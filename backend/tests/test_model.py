"""
Model behaviour tests. Standard library only -- run from backend/:

    python -m unittest discover tests

Calibration data is simulated with the seed samplers plus Gaussian noise
(real frames are never as clean as the seed rules), and models are written to
a temporary folder, never to storage/models.
"""
import random
import tempfile
import unittest

from pydantic import ValidationError

import app.ml.classifier as C
from app.ml.features import FEATURE_NAMES, N_FEATURES, extract_features
from app.ml.seed_data import HABITS, SAMPLERS
from app.schemas import CalibrationBatchIn, CalibrationSampleIn, FeatureVectorRequest

C.MODEL_DIR = tempfile.mkdtemp()
IDX = {n: i for i, n in enumerate(FEATURE_NAMES)}
NOISE = 0.12


def noisy(v):
    return [min(1.0, max(0.0, x + random.gauss(0, NOISE))) for x in v]


def users_nail_biting():
    """A person whose nail biting breaks the textbook rule: middle finger,
    loose grip, no isolated finger. The prior mostly misses this."""
    v = SAMPLERS["nail_biting"]()
    for f in ["thumb", "index", "middle", "ring", "pinky"]:
        v[IDX[f"closest_finger_is_{f}"]] = 1.0 if f == "middle" else 0.0
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["finger_curl_score"]] = random.uniform(0.2, 0.45)
    v[IDX["min_fingertip_to_mouth_dist"]] = random.uniform(0.12, 0.3)
    v[IDX["nearest_region_dist"]] = random.uniform(0.12, 0.3)
    return v


def hit_rate(predict, gen, label, n=200):
    return sum(predict(noisy(gen())) == label for _ in range(n)) / n


def prior_top(v):
    p = C.get_prior_model().predict_proba(v)
    return max(p, key=p.get)


class CalibratedOneHabit(unittest.TestCase):
    """The person calibrated only nail_biting (one rep records its habit
    frames plus 'none' frames)."""

    @classmethod
    def setUpClass(cls):
        random.seed(7)
        real = [(noisy(users_nail_biting()), "nail_biting") for _ in range(42)]
        real += [(noisy(SAMPLERS["none"]()), "none") for _ in range(32)]
        cls.clf = C.HabitClassifier("test-one-habit")
        cls.clf.retrain(real)

    def predict(self, v):
        return self.clf.predict(v)["top_label"]

    def test_calibration_teaches_the_persons_own_style(self):
        random.seed(11)
        before = hit_rate(prior_top, users_nail_biting, "nail_biting")
        random.seed(11)
        after = hit_rate(self.predict, users_nail_biting, "nail_biting")
        self.assertLess(before, 0.6)
        self.assertGreater(after, 0.9)

    def test_uncalibrated_habits_are_not_buried(self):
        # The pre-fix blend dropped face_touching from ~75% to ~39% here.
        for habit in ["face_touching", "hair_pulling", "eye_rubbing", "skin_picking"]:
            random.seed(23)
            before = hit_rate(prior_top, SAMPLERS[habit], habit)
            random.seed(23)
            after = hit_rate(self.predict, SAMPLERS[habit], habit)
            self.assertGreater(after, before - 0.08, habit)

    def test_probabilities_cover_all_classes_and_sum_to_one(self):
        r = self.clf.predict(noisy(SAMPLERS["face_touching"]()))
        self.assertEqual(set(r["probabilities"]), set(HABITS))
        self.assertAlmostEqual(sum(r["probabilities"].values()), 1.0, places=6)

    def test_status_reports_zero_personal_weight_for_uncalibrated(self):
        per = self.clf.status()["per_habit"]
        self.assertGreater(per["nail_biting"]["blend_weight"], 0)
        self.assertEqual(per["face_touching"]["blend_weight"], 0.0)


class Persistence(unittest.TestCase):
    def test_saved_model_reloads_with_identical_predictions(self):
        random.seed(5)
        real = [(noisy(SAMPLERS["hair_pulling"]()), "hair_pulling") for _ in range(30)]
        real += [(noisy(SAMPLERS["none"]()), "none") for _ in range(30)]
        a = C.HabitClassifier("test-persist")
        a.retrain(real)
        b = C.HabitClassifier("test-persist")
        v = noisy(SAMPLERS["hair_pulling"]())
        self.assertEqual(a.predict(v)["probabilities"], b.predict(v)["probabilities"])


class CrossValidation(unittest.TestCase):
    def test_one_rep_per_habit_is_flagged_optimistic(self):
        random.seed(1)
        real = [(noisy(SAMPLERS["nail_biting"]()), "nail_biting") for _ in range(40)]
        real += [(noisy(SAMPLERS["none"]()), "none") for _ in range(30)]
        clf = C.HabitClassifier("test-cv-one")
        clf.retrain(real, groups=[0] * len(real))
        self.assertEqual(clf.cv_method, "within reps (optimistic)")

    def test_two_reps_per_habit_scores_across_reps(self):
        random.seed(2)
        real, groups = [], []
        for rep in range(2):
            real += [(noisy(SAMPLERS["nail_biting"]()), "nail_biting") for _ in range(40)]
            real += [(noisy(SAMPLERS["none"]()), "none") for _ in range(30)]
            groups += [rep] * 70
        clf = C.HabitClassifier("test-cv-two")
        clf.retrain(real, groups=groups)
        self.assertEqual(clf.cv_method, "across reps")
        self.assertIsNotNone(clf.cv_accuracy)

    def test_rep_grouping_splits_on_time_gaps(self):
        ts = [100.0, 100.1, 100.2, 115.0, 115.1, 130.0]
        self.assertEqual(C.groups_from_timestamps(ts), [0, 0, 0, 1, 1, 2])


class TooLittleData(unittest.TestCase):
    def test_stays_prior_only_below_the_minimum(self):
        random.seed(4)
        real = [(noisy(SAMPLERS["nail_biting"]()), "nail_biting") for _ in range(5)]
        clf = C.HabitClassifier("test-too-little")
        clf.retrain(real)
        self.assertIsNone(clf.personal_model)
        v = noisy(SAMPLERS["face_touching"]())
        prior = C.get_prior_model().predict_proba(v)
        for h, p in clf.predict(v)["probabilities"].items():
            self.assertAlmostEqual(p, prior[h], places=9)


class Features(unittest.TestCase):
    def test_no_face_gives_a_full_length_vector_classified_none(self):
        vec, _ = extract_features(None, [], {"prev_wrist": None, "dwell_state": None, "dwell_started_at": None, "t": 0})
        self.assertEqual(len(vec), N_FEATURES)
        self.assertEqual(prior_top(vec), "none")


def fake_face(upper_lip, lower_lip, inner_gap=0.0):
    """478 points with only the mouth set: corners 0.2 apart, lips of the
    given thickness (in the same units) above/below a centre line."""
    from app.ml import landmarks as L
    face = [{"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(478)]
    face[L.FACE_LEFT_EDGE] = {"x": 0.3, "y": 0.5, "z": 0.0}
    face[L.FACE_RIGHT_EDGE] = {"x": 0.7, "y": 0.5, "z": 0.0}
    face[L.CHIN] = {"x": 0.5, "y": 0.8, "z": 0.0}
    face[L.NOSE_TIP] = {"x": 0.5, "y": 0.55, "z": 0.0}
    face[L.LIP_LEFT_CORNER] = {"x": 0.4, "y": 0.7, "z": 0.0}
    face[L.LIP_RIGHT_CORNER] = {"x": 0.6, "y": 0.7, "z": 0.0}
    face[L.LIP_TOP_INNER] = {"x": 0.5, "y": 0.7 - inner_gap / 2, "z": 0.0}
    face[L.LIP_BOTTOM_INNER] = {"x": 0.5, "y": 0.7 + inner_gap / 2, "z": 0.0}
    face[L.LIP_TOP_OUTER] = {"x": 0.5, "y": 0.7 - inner_gap / 2 - upper_lip, "z": 0.0}
    face[L.LIP_BOTTOM_OUTER] = {"x": 0.5, "y": 0.7 + inner_gap / 2 + lower_lip, "z": 0.0}
    return face


class LipBiting(unittest.TestCase):
    COMP = FEATURE_NAMES.index("mouth_compression_ratio")

    def run_frames(self, faces):
        state = {"prev_wrist": None, "dwell_state": None, "dwell_started_at": None, "t": 0.0}
        out = []
        for f in faces:
            vec, state = extract_features(f, [], state)
            out.append(vec[self.COMP])
        return out

    def test_relaxed_closed_mouth_is_not_compressed(self):
        # The old formula read ~0.92 here, so "mouth closed, hands down"
        # was classified as lip biting (seen live: lip_biting 0.57).
        comp = self.run_frames([fake_face(0.05, 0.055)] * 20)
        self.assertLess(max(comp), 0.05)

    def test_lips_pulled_in_reads_as_compressed_and_stays_so(self):
        rest = [fake_face(0.05, 0.055)] * 10
        bite = [fake_face(0.035, 0.02)] * 30  # lower lip mostly pulled under the teeth
        comp = self.run_frames(rest + bite)
        self.assertGreater(min(comp[10:]), 0.9)  # baseline must not drift down to meet the bite


class Validation(unittest.TestCase):
    def test_wrong_length_vector_is_rejected(self):
        with self.assertRaises(ValidationError):
            FeatureVectorRequest(feature_vector=[0.0] * 14)

    def test_unknown_habit_is_rejected(self):
        with self.assertRaises(ValidationError):
            CalibrationSampleIn(habit="nail_bitting", feature_vector=[0.0] * N_FEATURES)

    def test_valid_batch_is_accepted(self):
        b = CalibrationBatchIn(samples=[{"habit": "none", "feature_vector": [0.0] * N_FEATURES}])
        self.assertEqual(len(b.samples), 1)


if __name__ == "__main__":
    unittest.main()
