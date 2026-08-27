"""
Two-model inference-time blend: a shared synthetic "prior" model plus each
profile's own "personal" model trained only on their real calibration data.

Lifecycle:
- PriorModel is trained ONCE on the synthetic seed dataset (seed_data.py) and
  shared across every profile via a module-level singleton -- computed once
  at server startup, not per-profile, not per-request. It never retrains.
- Each profile's HabitClassifier holds a separate "personal" model trained
  only on that profile's real CalibrationSample rows -- no synthetic data
  mixed in -- and only once a class has enough real samples to be worth
  fitting (see BLEND_MIN_N). Personal retrains are cheap (tens of samples),
  so retrain() re-fits on every /calibration/retrain call.
- predict() blends prior and personal per-class probabilities using a
  per-class weight driven by how many real samples that class has, then
  renormalizes across all classes so they still sum to 1.

HABIT_CONFIDENCE communicates, per habit, how strong the underlying
geometric signal is -- hand-to-face proximity habits (nail biting, hair
pulling, face touching) are on much firmer ground than lip biting, which
has no hand signal to anchor on. This is surfaced in the UI rather than
presenting all four as equally certain.
"""
from __future__ import annotations
import os
import time
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score

from .features import FEATURE_NAMES
from .seed_data import generate_seed_dataset, HABITS

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_FORMAT_VERSION = 2  # bump whenever the saved payload shape changes

HABIT_CONFIDENCE = {
    "nail_biting": "high",      # hand + finger-curl + mouth proximity: strong geometric signal
    "hair_pulling": "high",     # hand sustained above forehead near scalp region: strong geometric signal
    "face_touching": "high",    # fingertip-to-face proximity: strong geometric signal
    "lip_biting": "moderate",   # mouth-geometry-only proxy, no hand corroboration: weaker signal
    "nose_picking": "high",     # same isolated-finger + region-proximity signal as nail_biting
    "eye_rubbing": "high",      # hand + eye-region proximity: strong geometric signal
    "skin_picking": "high",     # face_touching's region signal plus a distinct pinch-grip cue
    "chewing": "moderate",      # coarser mouth-contact pattern -- no isolated-finger signature to anchor on
    "none": "n/a",
}

# Per-class blend weight as a function of that class's real sample count `n`.
# See project plan section 1 for the rationale behind these specific breaks.
BLEND_MIN_N = 8      # below this, the personal model isn't trained on the class at all -> prior only
BLEND_MAX_N = 25      # weight is fully ramped up by this point
BLEND_MIN_W = 0.3     # weight right as a class first qualifies
BLEND_MAX_W = 0.85    # weight just before full ramp-up
BLEND_FLOOR_W = 0.9   # permanent ceiling -- a 10% prior floor guards against overfitting to one
                       # session's lighting/background/angle even with lots of real samples


def blend_weight_for_count(n: int) -> float:
    if n < BLEND_MIN_N:
        return 0.0
    if n < BLEND_MAX_N:
        frac = (n - BLEND_MIN_N) / (BLEND_MAX_N - BLEND_MIN_N)
        return BLEND_MIN_W + frac * (BLEND_MAX_W - BLEND_MIN_W)
    return BLEND_FLOOR_W


def _make_pipeline() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=42,
        )),
    ])


def _proba_dict(pipe: Pipeline, x: np.ndarray) -> dict:
    proba = pipe.predict_proba(x)[0]
    classes = pipe.named_steps["clf"].classes_
    return {cls: float(p) for cls, p in zip(classes, proba)}


class PriorModel:
    """Trained once on synthetic seed data only, identical for every
    profile. A shared singleton -- see get_prior_model()."""

    def __init__(self):
        X, y = generate_seed_dataset(n_per_class=220)
        pipe = _make_pipeline()
        pipe.fit(np.array(X, dtype=float), np.array(y))
        self.model = pipe
        self.trained_at = time.time()

    def predict_proba(self, feature_vector: list[float]) -> dict:
        x = np.array(feature_vector, dtype=float).reshape(1, -1)
        result = _proba_dict(self.model, x)
        for h in HABITS:
            result.setdefault(h, 0.0)
        return result


_PRIOR: PriorModel | None = None


def get_prior_model() -> PriorModel:
    global _PRIOR
    if _PRIOR is None:
        _PRIOR = PriorModel()
    return _PRIOR


class HabitClassifier:
    """Per-profile personal model plus the inference-time blend against the
    shared PriorModel."""

    def __init__(self, profile_id: str = "default"):
        self.profile_id = profile_id
        self.personal_model: Pipeline | None = None
        self.personal_classes: list[str] = []
        self.trained_at: float | None = None
        self.real_sample_counts: dict[str, int] = {h: 0 for h in HABITS}
        self.cv_accuracy: float | None = None
        self._load()

    def _model_path(self):
        return os.path.join(MODEL_DIR, f"{self.profile_id}.joblib")

    def _load(self):
        path = self._model_path()
        if not os.path.exists(path):
            return
        try:
            payload = joblib.load(path)
            if (
                payload.get("format") != MODEL_FORMAT_VERSION
                or payload.get("n_features") != len(FEATURE_NAMES)
            ):
                # Saved under an older/incompatible schema (e.g. the single-
                # model era, or a feature-vector length change) -- rather
                # than risk misaligned columns, start prior-only and let the
                # next retrain rebuild the personal model from real DB rows.
                return
            self.personal_model = payload["personal_model"]
            self.personal_classes = payload["personal_classes"]
            self.trained_at = payload["trained_at"]
            self.real_sample_counts = payload["real_sample_counts"]
            self.cv_accuracy = payload.get("cv_accuracy")
        except Exception:
            pass  # corrupt/unreadable -- fall back to prior-only

    def _save(self):
        joblib.dump({
            "format": MODEL_FORMAT_VERSION,
            "personal_model": self.personal_model,
            "personal_classes": self.personal_classes,
            "trained_at": self.trained_at,
            "real_sample_counts": self.real_sample_counts,
            "cv_accuracy": self.cv_accuracy,
            "n_features": len(FEATURE_NAMES),
        }, self._model_path())

    def retrain(self, real_samples: list[tuple[list[float], str]]):
        """real_samples: (feature_vector, label) from this profile's actual
        calibration recordings -- real data only, never mixed with the
        synthetic prior."""
        real_samples = [(v, y) for v, y in real_samples if len(v) == len(FEATURE_NAMES)]

        counts: dict[str, int] = {h: 0 for h in HABITS}
        for _, y in real_samples:
            counts[y] = counts.get(y, 0) + 1
        self.real_sample_counts = counts

        qualifying = {h for h, n in counts.items() if n >= BLEND_MIN_N}
        if len(qualifying) < 2:
            # Not enough distinct classes with enough real samples yet for a
            # meaningful personal model (need at least 2 to fit a
            # classifier) -- stay prior-only until more calibration comes in.
            self.personal_model = None
            self.personal_classes = []
            self.cv_accuracy = None
            self.trained_at = time.time()
            self._save()
            return

        X = [v for v, y in real_samples if y in qualifying]
        y = [lbl for _, lbl in real_samples if lbl in qualifying]
        pipe = _make_pipeline()
        Xa, ya = np.array(X, dtype=float), np.array(y)
        try:
            scores = cross_val_score(pipe, Xa, ya, cv=5)
            self.cv_accuracy = float(np.mean(scores))
        except Exception:
            self.cv_accuracy = None
        pipe.fit(Xa, ya)
        self.personal_model = pipe
        self.personal_classes = sorted(qualifying)
        self.trained_at = time.time()
        self._save()

    def blend_weights(self) -> dict[str, float]:
        """Per-habit blend weight actually in effect right now. Always 0 for
        a class the personal model hasn't been trained on yet -- safe by
        construction, never touches an undefined personal probability."""
        weights = {}
        for h in HABITS:
            if self.personal_model is not None and h in self.personal_classes:
                weights[h] = blend_weight_for_count(self.real_sample_counts.get(h, 0))
            else:
                weights[h] = 0.0
        return weights

    def predict(self, feature_vector: list[float]) -> dict:
        prior_probs = get_prior_model().predict_proba(feature_vector)
        weights = self.blend_weights()

        personal_probs: dict = {}
        if self.personal_model is not None:
            x = np.array(feature_vector, dtype=float).reshape(1, -1)
            personal_probs = _proba_dict(self.personal_model, x)

        blended = {}
        for h in HABITS:
            w = weights[h]
            blended[h] = (1 - w) * prior_probs[h] + w * personal_probs.get(h, 0.0) if w > 0 else prior_probs[h]

        total = sum(blended.values())
        if total > 0:
            blended = {h: v / total for h, v in blended.items()}

        top = max(blended, key=blended.get)
        return {
            "probabilities": blended,
            "top_label": top,
            "top_confidence": blended[top],
            "model_trained_at": self.trained_at,
            "n_real_samples": sum(self.real_sample_counts.values()),
            "cv_accuracy": self.cv_accuracy,
        }

    def status(self) -> dict:
        weights = self.blend_weights()
        per_habit = {
            h: {
                "real_samples": self.real_sample_counts.get(h, 0),
                "blend_weight": weights[h],
            }
            for h in HABITS
        }
        return {
            "profile_id": self.profile_id,
            "trained_at": self.trained_at,
            "n_real_samples": sum(self.real_sample_counts.values()),
            "cv_accuracy": self.cv_accuracy,
            "feature_names": FEATURE_NAMES,
            "habits": HABITS,
            "habit_confidence": HABIT_CONFIDENCE,
            "per_habit": per_habit,
        }


# In-process cache of classifiers per profile so we don't reload from disk
# on every request.
_CLASSIFIER_CACHE: dict[str, HabitClassifier] = {}


def get_classifier(profile_id: str = "default") -> HabitClassifier:
    if profile_id not in _CLASSIFIER_CACHE:
        _CLASSIFIER_CACHE[profile_id] = HabitClassifier(profile_id)
    return _CLASSIFIER_CACHE[profile_id]
