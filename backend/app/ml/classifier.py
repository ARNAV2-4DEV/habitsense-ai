"""
Two-model inference-time blend: a shared synthetic "prior" model plus each
profile's own "personal" model trained on their real calibration data.

Lifecycle:
- PriorModel is trained ONCE on the synthetic seed dataset (seed_data.py) and
  shared across every profile via a module-level singleton -- computed once
  at server startup, not per-profile, not per-request. It never retrains.
- Each profile's HabitClassifier holds a separate "personal" model. It learns
  every habit the person has calibrated (real CalibrationSample rows only)
  plus one catch-all class, OTHER, which stands for "a habit this person has
  NOT calibrated". OTHER is the only place synthetic vectors enter the
  personal model: a small sample of the prior's synthetic examples of the
  uncalibrated habits, used purely as negatives. Without it, a model that has
  only ever seen nail_biting and none has to file a face touch under one of
  those two, which buried every uncalibrated habit (see predict()).
- A class only enters the personal model once it has BLEND_MIN_N real
  samples. Personal retrains are cheap, so retrain() re-fits from scratch on
  every /calibration/retrain call.
- predict() spreads the personal model's OTHER probability over the
  uncalibrated habits in the prior's proportions, so the personal model has
  an opinion on all 10 classes, then blends it with the prior using a weight
  driven by how many real samples the person has recorded.

Accuracy reporting: cross-validation runs on the person's REAL samples only.
When every calibrated class has at least two separate recording reps, folds
are split by rep, so the score measures "recognises a new rep of this habit"
rather than "recognises a frame from a rep it has already seen" (consecutive
frames of one rep are near-duplicates). cv_method says which one was used.

HABIT_CONFIDENCE communicates, per habit, how strong the underlying
geometric signal is -- hand-to-face proximity habits (nail biting, hair
pulling, face touching, ...) are on much firmer ground than lip biting,
which has no hand signal to anchor on. This is surfaced in the UI rather
than presenting every habit as equally certain.
"""
from __future__ import annotations
import os
import random
import time
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score, StratifiedKFold, StratifiedGroupKFold

from .features import FEATURE_NAMES
from .seed_data import generate_seed_dataset, HABITS

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_FORMAT_VERSION = 3  # bump whenever the saved payload shape changes

OTHER = "__other__"      # personal-model label for "a habit not calibrated yet"
OTHER_PER_CLASS = 40     # synthetic negatives drawn per uncalibrated habit

HABIT_CONFIDENCE = {
    "nail_biting": "high",      # hand + finger-curl + mouth proximity: strong geometric signal
    "hair_pulling": "high",     # hand sustained above forehead near scalp region: strong geometric signal
    "face_touching": "high",    # fingertip-to-face proximity: strong geometric signal
    "lip_biting": "moderate",   # mouth-geometry-only proxy, no hand corroboration: weaker signal
    "nose_picking": "high",     # same isolated-finger + region-proximity signal as nail_biting
    "eye_rubbing": "high",      # hand + eye-region proximity: strong geometric signal
    "skin_picking": "high",     # face_touching's region signal plus a distinct pinch-grip cue
    "chewing": "moderate",      # coarser mouth-contact pattern -- no isolated-finger signature to anchor on
    "chin_resting": "moderate", # static posture, not a compulsive habit -- see HABIT_CATEGORY in the frontend store
    "none": "n/a",
}

# Per-class blend weight as a function of that class's real sample count `n`.
BLEND_MIN_N = 8       # below this, the personal model isn't trained on the class at all -> prior only
BLEND_MAX_N = 25      # weight is fully ramped up by this point
BLEND_MIN_W = 0.3     # weight right as a class first qualifies
BLEND_MAX_W = 0.85    # weight just before full ramp-up
BLEND_FLOOR_W = 0.9   # permanent ceiling -- a 10% prior floor guards against overfitting to one
                       # session's lighting/background/angle even with lots of real samples

# Calibration samples posted more than this many seconds apart belong to
# different recording reps (one rep uploads all of its frames at once).
REP_GAP_SEC = 2.0


def blend_weight_for_count(n: int) -> float:
    if n < BLEND_MIN_N:
        return 0.0
    if n < BLEND_MAX_N:
        frac = (n - BLEND_MIN_N) / (BLEND_MAX_N - BLEND_MIN_N)
        return BLEND_MIN_W + frac * (BLEND_MAX_W - BLEND_MIN_W)
    return BLEND_FLOOR_W


def groups_from_timestamps(timestamps: list[float]) -> list[int]:
    """Assigns a rep id to each sample: a new rep starts wherever the gap to
    the previous sample (in time order) exceeds REP_GAP_SEC."""
    order = sorted(range(len(timestamps)), key=lambda i: timestamps[i])
    groups = [0] * len(timestamps)
    rep, prev = 0, None
    for i in order:
        if prev is not None and timestamps[i] - prev > REP_GAP_SEC:
            rep += 1
        groups[i] = rep
        prev = timestamps[i]
    return groups


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
        # Kept so personal models can draw OTHER negatives from it.
        self.X, self.y = X, y

    def predict_proba(self, feature_vector: list[float]) -> dict:
        x = np.array(feature_vector, dtype=float).reshape(1, -1)
        result = _proba_dict(self.model, x)
        for h in HABITS:
            result.setdefault(h, 0.0)
        return result

    def negatives_for(self, classes: set[str]) -> list[list[float]]:
        """A fixed, deterministic sample of synthetic vectors from `classes`."""
        rng = random.Random(0)
        out = []
        for h in sorted(classes):
            pool = [v for v, lbl in zip(self.X, self.y) if lbl == h]
            out.extend(rng.sample(pool, min(OTHER_PER_CLASS, len(pool))))
        return out


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
        self.personal_classes: list[str] = []  # calibrated classes, OTHER excluded
        self.trained_at: float | None = None
        self.real_sample_counts: dict[str, int] = {h: 0 for h in HABITS}
        self.cv_accuracy: float | None = None
        self.cv_method: str | None = None
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
                # Saved under an older/incompatible schema (e.g. before the
                # OTHER class, or a feature-vector length change) -- rather
                # than risk misaligned columns, start prior-only and let the
                # next retrain rebuild the personal model from real DB rows.
                return
            self.personal_model = payload["personal_model"]
            self.personal_classes = payload["personal_classes"]
            self.trained_at = payload["trained_at"]
            self.real_sample_counts = payload["real_sample_counts"]
            self.cv_accuracy = payload.get("cv_accuracy")
            self.cv_method = payload.get("cv_method")
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
            "cv_method": self.cv_method,
            "n_features": len(FEATURE_NAMES),
        }, self._model_path())

    def _cross_validate(self, X: np.ndarray, y: np.ndarray, groups: list[int] | None):
        """5-fold CV on real samples. Split by recording rep when every class
        has at least two reps; otherwise split within reps and say so."""
        if groups is not None:
            g = np.array(groups)
            reps_per_class = [len(set(g[y == c])) for c in set(y)]
            n_groups = len(set(groups))
            if min(reps_per_class) >= 2 and n_groups >= 2:
                cv = StratifiedGroupKFold(n_splits=min(5, n_groups))
                scores = cross_val_score(_make_pipeline(), X, y, cv=cv, groups=g)
                return float(np.mean(scores)), "across reps"
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        scores = cross_val_score(_make_pipeline(), X, y, cv=cv)
        return float(np.mean(scores)), "within reps (optimistic)"

    def retrain(self, real_samples: list[tuple[list[float], str]], groups: list[int] | None = None):
        """real_samples: (feature_vector, label) from this profile's actual
        calibration recordings. groups: optional rep id per sample (see
        groups_from_timestamps), used for honest cross-validation."""
        keep = [i for i, (v, _) in enumerate(real_samples) if len(v) == len(FEATURE_NAMES)]
        real_samples = [real_samples[i] for i in keep]
        if groups is not None:
            groups = [groups[i] for i in keep]

        counts: dict[str, int] = {h: 0 for h in HABITS}
        for _, y in real_samples:
            counts[y] = counts.get(y, 0) + 1
        self.real_sample_counts = counts

        qualifying = {h for h, n in counts.items() if n >= BLEND_MIN_N}
        if len(qualifying) < 2:
            # Not enough distinct classes with enough real samples yet for a
            # meaningful personal model -- stay prior-only until more
            # calibration comes in. (One rep already records its habit plus
            # "none", so a single good rep is enough to get past this.)
            self.personal_model = None
            self.personal_classes = []
            self.cv_accuracy = None
            self.cv_method = None
            self.trained_at = time.time()
            self._save()
            return

        idx = [i for i, (_, y) in enumerate(real_samples) if y in qualifying]
        X = np.array([real_samples[i][0] for i in idx], dtype=float)
        y = np.array([real_samples[i][1] for i in idx])
        g = [groups[i] for i in idx] if groups is not None else None

        # Accuracy is measured on real data only -- the synthetic OTHER
        # negatives are trivially separable and would only inflate it.
        try:
            self.cv_accuracy, self.cv_method = self._cross_validate(X, y, g)
        except Exception:
            self.cv_accuracy, self.cv_method = None, None

        uncalibrated = set(HABITS) - qualifying
        negatives = get_prior_model().negatives_for(uncalibrated)
        X_fit = np.vstack([X, np.array(negatives, dtype=float)]) if negatives else X
        y_fit = np.concatenate([y, np.array([OTHER] * len(negatives))]) if negatives else y

        pipe = _make_pipeline()
        pipe.fit(X_fit, y_fit)
        self.personal_model = pipe
        self.personal_classes = sorted(qualifying)
        self.trained_at = time.time()
        self._save()

    def blend_weights(self) -> dict[str, float]:
        """Per-habit blend weight actually in effect right now. A calibrated
        class uses its own sample count; an uncalibrated class borrows the
        mean weight of the calibrated ones, since the personal model's
        opinion on it (via OTHER) is exactly as trustworthy as the model
        overall. 0 everywhere while there's no personal model."""
        if self.personal_model is None:
            return {h: 0.0 for h in HABITS}
        own = {h: blend_weight_for_count(self.real_sample_counts.get(h, 0)) for h in self.personal_classes}
        mean_w = sum(own.values()) / len(own) if own else 0.0
        return {h: own.get(h, mean_w) for h in HABITS}

    def _personal_full(self, feature_vector: list[float], prior_probs: dict) -> dict:
        """The personal model's opinion on all 10 classes: calibrated classes
        straight from the model, OTHER's mass spread over the uncalibrated
        classes in the prior's proportions."""
        x = np.array(feature_vector, dtype=float).reshape(1, -1)
        raw = _proba_dict(self.personal_model, x)
        other_mass = raw.get(OTHER, 0.0)
        uncal = [h for h in HABITS if h not in self.personal_classes]
        uncal_prior = sum(prior_probs[h] for h in uncal)
        full = {}
        for h in HABITS:
            if h in self.personal_classes:
                full[h] = raw.get(h, 0.0)
            elif uncal_prior > 0:
                full[h] = other_mass * prior_probs[h] / uncal_prior
            else:
                full[h] = other_mass / max(len(uncal), 1)
        return full

    def predict(self, feature_vector: list[float]) -> dict:
        prior_probs = get_prior_model().predict_proba(feature_vector)
        weights = self.blend_weights()

        if self.personal_model is not None:
            personal = self._personal_full(feature_vector, prior_probs)
            blended = {h: (1 - weights[h]) * prior_probs[h] + weights[h] * personal[h] for h in HABITS}
        else:
            blended = dict(prior_probs)

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
        # Reported per habit as "how much of THIS habit's score comes from
        # your own recordings of it": 0 for a habit you haven't calibrated,
        # even though predict() lets the personal model's OTHER class weigh
        # in on it.
        per_habit = {
            h: {
                "real_samples": self.real_sample_counts.get(h, 0),
                "blend_weight": (
                    blend_weight_for_count(self.real_sample_counts.get(h, 0))
                    if self.personal_model is not None and h in self.personal_classes
                    else 0.0
                ),
            }
            for h in HABITS
        }
        return {
            "profile_id": self.profile_id,
            "trained_at": self.trained_at,
            "n_real_samples": sum(self.real_sample_counts.values()),
            "cv_accuracy": self.cv_accuracy,
            "cv_method": self.cv_method,
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
