import time
from fastapi import APIRouter
from ..schemas import InferRequest, FeatureVectorRequest
from ..ml.features import extract_features, FEATURE_NAMES
from ..ml.classifier import get_classifier
from ..ml.seed_data import HABITS

router = APIRouter(prefix="/detect", tags=["detect"])

# Per-session dwell/velocity state. Small and ephemeral by design — this is
# NOT persisted anywhere; it just lets extract_features() know what happened
# on the previous frame for this session so it can compute dwell time and
# hand velocity. Cleared when a session ends (see sessions.py).
_SESSION_STATE: dict[str, dict] = {}


def _state_for(session_id: str | None):
    key = session_id or "anonymous"
    return _SESSION_STATE.setdefault(key, {"prev_wrist": None, "dwell_state": None,
                                            "dwell_started_at": None, "t": time.time()})


@router.post("/infer")
def infer(req: InferRequest):
    """
    Full pipeline: raw landmarks -> geometric features -> personalized
    classifier probabilities. This is the endpoint the live detection loop
    calls every ~150-250ms while the camera is on.
    """
    face = [p.model_dump() for p in req.face] if req.face else None
    hands = [[p.model_dump() for p in h] for h in req.hands]

    state = _state_for(req.session_id)
    state["t"] = req.timestamp
    vec, new_state = extract_features(face, hands, state)
    _SESSION_STATE[req.session_id or "anonymous"] = new_state

    if face is None:
        # Every habit is defined relative to the face, so with no face
        # tracked there is nothing to judge -- say "none" outright rather
        # than asking the classifier about an all-zero vector.
        return {
            "probabilities": {h: (1.0 if h == "none" else 0.0) for h in HABITS},
            "top_label": "none",
            "top_confidence": 1.0,
            "face_detected": False,
            "feature_vector": vec,
        }

    clf = get_classifier(req.profile_id)
    result = clf.predict(vec)
    result["feature_vector"] = vec
    return result


@router.post("/infer-from-features")
def infer_from_features(req: FeatureVectorRequest):
    """For calibration preview / testing: skip landmark parsing and classify
    a feature vector directly."""
    clf = get_classifier(req.profile_id)
    return clf.predict(req.feature_vector)


@router.post("/reset-session-state/{session_id}")
def reset_session_state(session_id: str):
    _SESSION_STATE.pop(session_id, None)
    return {"ok": True}


@router.get("/feature-schema")
def feature_schema():
    return {"feature_names": FEATURE_NAMES, "n_features": len(FEATURE_NAMES)}
