"""
Generates the synthetic bootstrap dataset the classifier ships with before
any real person has calibrated it.

WHY THIS EXISTS AND WHAT IT HONESTLY IS:
There is no public, ethically-sourced, labeled video dataset of people
biting their nails / pulling hair / touching their face that this project
has access to, and this environment has no camera or GPU to record and
train on real footage. Pretending otherwise would be dishonest.

What we do instead, and what is real:
1. The face/hand tracking (MediaPipe FaceLandmarker + HandLandmarker) IS a
   real, accurate, production-grade pretrained model from Google — that
   part is not synthetic at all.
2. The GEOMETRIC FEATURES in features.py (distances, dwell time, finger
   curl, etc.) encode real, documented behavioral signatures of each habit
   (e.g. nail biting = one fingertip sustained at the mouth with the other
   fingers curled; hair pulling = a hand sustained above the forehead near
   the scalp region).
3. This file samples plausible feature vectors *from those same documented
   rules*, with randomized noise, to give the classifier a reasonable prior
   so the app is not useless on first launch.
4. The moment a real person runs the Calibration flow, their actual labeled
   samples (also just feature vectors, computed from their own live
   landmarks — see /calibration/samples) are stored and retrained on,
   and in practice dominate and correct this synthetic prior quickly
   because they reflect that specific person's real geometry and habits.

The UI is required to disclose this (see frontend Privacy/About copy):
"HabitSense starts with a rule-based estimate and gets more accurate as
you calibrate it to your own movements."
"""
import random
from .features import FEATURE_NAMES
from . import landmarks as L

HABITS = [
    "none", "nail_biting", "hair_pulling", "face_touching", "lip_biting",
    "nose_picking", "eye_rubbing", "skin_picking", "chewing", "chin_resting",
]

IDX = {name: i for i, name in enumerate(FEATURE_NAMES)}


def _base_vector():
    return [0.0] * len(FEATURE_NAMES)


def _noisy(value, spread=0.08, lo=0.0, hi=1.0):
    v = value + random.uniform(-spread, spread)
    return max(lo, min(hi, v))


def _set_region(v, group, dist_value, dist_spread=0.08, dist_lo=0.0, dist_hi=1.0):
    """Sets the nearest_region_* one-hots and nearest_region_dist for a sample."""
    for g in L.REGION_GROUP_NAMES:
        v[IDX[f"nearest_region_{g}"]] = 1.0 if g == group else 0.0
    v[IDX["nearest_region_dist"]] = _noisy(dist_value, dist_spread, dist_lo, dist_hi)


def _set_finger(v, finger):
    """Sets the closest_finger_is_* one-hots. finger=None picks uniformly at random."""
    if finger is None:
        finger = random.choice(["thumb", "index", "middle", "ring", "pinky"])
    for f in ["thumb", "index", "middle", "ring", "pinky"]:
        v[IDX[f"closest_finger_is_{f}"]] = 1.0 if f == finger else 0.0


def _sample_none():
    """Neutral / resting posture: hands away from face. Covers the FULL
    realistic range of "not touching," including a hand resting on a desk
    or lap that's still only ~1-1.5 face-widths from the mouth in a typical
    close-up webcam frame — not just the "hand nowhere near the camera at
    all" case. Without this, the model never sees examples of ordinary
    resting distances and defaults to whatever contact class is nearest."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.55, 0.22, 0.3, 1.0)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.55, 0.22, 0.3, 1.0)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.5, 0.22, 0.28, 1.0)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.15, 0.1, 0.0, 0.4)
    # mouth_compression_ratio is lip THINNING relative to the person's own
    # resting lips (see features.lip_thinning): a relaxed mouth reads ~0.
    # A meaningful fraction of "none" moments are a smile or a mid-word
    # bilabial consonant caught in a single frame -- both stretch or press
    # the lips thin for a moment, much like a bite. What actually separates
    # them is that they never SUSTAIN, so this hard negative pairs high
    # compression with zero dwell, teaching the classifier that compression
    # alone isn't enough evidence.
    if random.random() < 0.3:
        v[IDX["mouth_compression_ratio"]] = _noisy(0.75, 0.15, 0.5, 1.0)
        v[IDX["mouth_asymmetry"]] = _noisy(0.1, 0.08)
    else:
        v[IDX["mouth_compression_ratio"]] = _noisy(0.2, 0.1)
        v[IDX["mouth_asymmetry"]] = _noisy(0.05, 0.05)
    v[IDX["finger_curl_score"]] = _noisy(0.2, 0.15)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.4, 0.2)
    v[IDX["dwell_time_norm"]] = 0.0
    v[IDX["head_tilt_norm"]] = _noisy(0.15, 0.1)
    v[IDX["num_hands_present"]] = random.choice([0.0, 0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 0.0
    # resting hand: whichever region happens to be nearest is incidental and far
    _set_region(v, random.choice(L.REGION_GROUP_NAMES), 0.55, 0.2, 0.35, 1.0)
    _set_finger(v, None)
    return v


def _sample_nail_biting():
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.08, 0.06, 0.0, 0.22)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.7, 0.15, 0.3, 1.0)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.2, 0.1, 0.0, 0.5)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.55, 0.1, 0.3, 0.8)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.55, 0.15)
    v[IDX["mouth_asymmetry"]] = _noisy(0.15, 0.1)
    v[IDX["finger_curl_score"]] = _noisy(0.75, 0.15, 0.4, 1.0)
    v[IDX["thumb_or_index_isolated"]] = 1.0 if random.random() < 0.8 else 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.15, 0.15, 0.0, 0.4)
    v[IDX["dwell_time_norm"]] = _noisy(0.5, 0.3, 0.05, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.35, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # nail biting: the closest finger-region pair is unambiguously a fingertip at the mouth
    _set_region(v, "mouth", 0.08, 0.06, 0.0, 0.2)
    _set_finger(v, "thumb" if random.random() < 0.5 else "index")
    return v


def _sample_hair_pulling():
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.7, 0.15, 0.3, 1.0)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.12, 0.09, 0.0, 0.25)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.35, 0.18, 0.05, 0.9)
    # Hair-pulling happens at the crown (hand clearly above the forehead) just
    # as often as at the temples/sides (hand roughly level with or below the
    # forehead, reaching sideways) — both are real postures, so this is mixed
    # rather than assumed to always be "above."
    v[IDX["hand_above_forehead"]] = 1.0 if random.random() < 0.5 else 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.6, 0.25, 0.25, 1.0)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.2, 0.1)
    v[IDX["mouth_asymmetry"]] = _noisy(0.08, 0.06)
    v[IDX["finger_curl_score"]] = _noisy(0.45, 0.2)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.2, 0.15, 0.0, 0.5)
    v[IDX["dwell_time_norm"]] = _noisy(0.45, 0.3, 0.05, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.5, 0.2, 0.1, 1.0)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # hair pulling: closest pair is a fingertip at the scalp region -- any finger,
    # since grip posture for pulling a strand varies a lot person to person
    _set_region(v, "scalp", 0.1, 0.08, 0.0, 0.22)
    _set_finger(v, None)
    return v


def _sample_face_touching():
    v = _base_vector()
    # Real face geometry is compact -- a cheek or jaw touch can land almost as
    # close to the mouth centroid as an actual mouth touch would. The legacy
    # mouth-distance feature alone can't reliably rule this class out anymore;
    # that's exactly why the region-identity features below exist to carry
    # the real distinguishing signal instead.
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.3, 0.28, 0.0, 0.8)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.5, 0.2, 0.1, 0.9)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.12, 0.08, 0.0, 0.25)
    v[IDX["hand_above_forehead"]] = 0.0 if random.random() < 0.8 else 1.0
    v[IDX["hand_height_norm"]] = _noisy(0.5, 0.2, 0.2, 0.9)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.25, 0.15)
    v[IDX["mouth_asymmetry"]] = _noisy(0.08, 0.07)
    v[IDX["finger_curl_score"]] = _noisy(0.35, 0.2)
    # A flat hand resting on the cheek can incidentally show one finger more
    # extended than the rest, just by hand posture, without that meaning
    # anything -- so this isn't reliably 0 like a true "flat palm" assumption
    # would suggest.
    v[IDX["thumb_or_index_isolated"]] = 1.0 if random.random() < 0.25 else 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.3, 0.2)
    v[IDX["dwell_time_norm"]] = _noisy(0.25, 0.2, 0.0, 0.7)
    v[IDX["head_tilt_norm"]] = _noisy(0.25, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # face touching: closest pair is at cheek or jaw specifically (not mouth,
    # not scalp) -- this is the feature that most directly separates it from
    # the other two hand-based habits now that region identity is available
    _set_region(v, random.choice(["cheek", "jaw"]), 0.1, 0.07, 0.0, 0.22)
    _set_finger(v, None)
    return v


def _sample_lip_biting():
    """No-hands-required habit: detected from mouth geometry alone.
    Lower geometric confidence than the hand-based habits — flagged as such
    in the UI (see HABIT_CONFIDENCE in classifier.py)."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.8, 0.15, 0.4, 1.0)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.8, 0.15, 0.4, 1.0)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.75, 0.15, 0.4, 1.0)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.15, 0.1, 0.0, 0.4)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.8, 0.12, 0.5, 1.0)
    v[IDX["mouth_asymmetry"]] = _noisy(0.35, 0.15, 0.1, 0.8)
    v[IDX["finger_curl_score"]] = _noisy(0.2, 0.15)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.4, 0.2)
    # Floor raised (was 0.0) now that dwell is actually tracked for this
    # habit via mouth-compression contact, not just hand proximity (see
    # extract_features -- previously dwell_time_norm could never accumulate
    # at all when no hand was present, which is the normal case here).
    # Sustained duration is the main thing that actually separates a real
    # bite from a smile or a bilabial consonant passing through the same
    # compression range for a single frame, so real lip-biting samples
    # should reflect that they're a SUSTAINED posture, not a momentary one.
    v[IDX["dwell_time_norm"]] = _noisy(0.55, 0.3, 0.15, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.2, 0.12)
    v[IDX["num_hands_present"]] = random.choice([0.0, 0.5])
    v[IDX["hand_face_overlap"]] = 0.0
    # lip biting has no hand signal at all -- whatever region/finger is
    # "nearest" is meaningless here, so it looks like the resting/away case
    _set_region(v, random.choice(L.REGION_GROUP_NAMES), 0.55, 0.2, 0.35, 1.0)
    _set_finger(v, None)
    return v


def _sample_nose_picking():
    """Same shape as nail_biting -- one isolated finger sustained at a
    specific facial region with the rest of the hand curled -- just aimed at
    the nose instead of the mouth."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.35, 0.2, 0.05, 0.8)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.7, 0.15, 0.3, 1.0)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.08, 0.06, 0.0, 0.2)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.5, 0.12, 0.25, 0.75)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.2, 0.1)
    v[IDX["mouth_asymmetry"]] = _noisy(0.1, 0.08)
    v[IDX["finger_curl_score"]] = _noisy(0.75, 0.15, 0.4, 1.0)
    v[IDX["thumb_or_index_isolated"]] = 1.0 if random.random() < 0.8 else 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.15, 0.15, 0.0, 0.4)
    v[IDX["dwell_time_norm"]] = _noisy(0.45, 0.3, 0.05, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.3, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # nose picking: closest pair is unambiguously a fingertip at the nose
    _set_region(v, "nose", 0.08, 0.06, 0.0, 0.2)
    _set_finger(v, "thumb" if random.random() < 0.5 else "index")
    return v


def _sample_eye_rubbing():
    """A hand sustained at either eye -- similar hand-shape variability to
    face_touching (grip posture varies a lot), distinguished mainly by the
    region-identity signal now that "eye" is a tracked region."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.55, 0.2, 0.2, 1.0)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.45, 0.2, 0.1, 0.9)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.15, 0.1, 0.0, 0.3)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.55, 0.15, 0.3, 0.85)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.2, 0.1)
    v[IDX["mouth_asymmetry"]] = _noisy(0.08, 0.06)
    v[IDX["finger_curl_score"]] = _noisy(0.5, 0.2)
    v[IDX["thumb_or_index_isolated"]] = 1.0 if random.random() < 0.35 else 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.3, 0.2)
    v[IDX["dwell_time_norm"]] = _noisy(0.3, 0.2, 0.0, 0.8)
    v[IDX["head_tilt_norm"]] = _noisy(0.25, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # eye rubbing: closest pair is at either eye specifically
    _set_region(v, "eye", 0.1, 0.07, 0.0, 0.22)
    _set_finger(v, None)
    return v


def _sample_skin_picking():
    """A refinement of face_touching with a distinct grip: thumb and index
    pinched together at a cheek/jaw spot, the other fingers curled out of
    the way -- unlike face_touching's flatter, more varied hand shape."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.3, 0.25, 0.0, 0.75)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.5, 0.2, 0.1, 0.9)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.1, 0.07, 0.0, 0.22)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.5, 0.18, 0.2, 0.85)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.22, 0.12)
    v[IDX["mouth_asymmetry"]] = _noisy(0.08, 0.07)
    v[IDX["finger_curl_score"]] = _noisy(0.55, 0.18, 0.2, 0.9)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["pinch_grip_score"]] = _noisy(0.75, 0.15, 0.4, 1.0)
    v[IDX["hand_velocity_norm"]] = _noisy(0.2, 0.15, 0.0, 0.5)
    v[IDX["dwell_time_norm"]] = _noisy(0.3, 0.2, 0.0, 0.75)
    v[IDX["head_tilt_norm"]] = _noisy(0.25, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # skin picking: same region family as face_touching (cheek or jaw), the
    # pinch grip above is what actually distinguishes it
    _set_region(v, random.choice(["cheek", "jaw"]), 0.09, 0.06, 0.0, 0.2)
    _set_finger(v, None)
    return v


def _sample_chewing():
    """Coarser mouth-contact pattern than nail_biting: a hand (gripping an
    object such as a pen) held steady at the mouth. Unlike nail_biting, no
    single finger is isolated -- the grip curls the fingers together around
    the object -- and wrist velocity is characteristically very low/steady
    rather than the small fidgety adjustments nail-biting shows."""
    v = _base_vector()
    # Floors raised above nail_biting's own ranges (0.0-0.22ish) on both
    # distance dims -- the grip point on a held object is never quite as
    # tight as an actual fingertip-on-mouth contact, and without this floor
    # gap the two classes overlap too much for the isolation flag alone to
    # separate them.
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.28, 0.12, 0.15, 0.5)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.7, 0.15, 0.3, 1.0)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.3, 0.15, 0.1, 0.55)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.5, 0.12, 0.3, 0.75)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.3, 0.15, 0.0, 0.6)
    v[IDX["mouth_asymmetry"]] = _noisy(0.1, 0.08)
    v[IDX["finger_curl_score"]] = _noisy(0.6, 0.15, 0.3, 0.9)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["hand_velocity_norm"]] = _noisy(0.08, 0.08, 0.0, 0.25)
    v[IDX["dwell_time_norm"]] = _noisy(0.6, 0.3, 0.1, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.2, 0.12)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # chewing: closest pair is at the mouth, but -- unlike nail_biting --
    # no isolated finger and a looser, more relaxed grip distance
    _set_region(v, "mouth", 0.28, 0.1, 0.15, 0.45)
    _set_finger(v, None)
    return v


def _sample_chin_resting():
    """Plan Phase 4: chin/cheek-resting, modeled as documented -- 'a static
    low-velocity face-touch variant.' Same region family as face_touching
    (jaw/chin most often, since that's where a resting palm or knuckles
    naturally lands), but distinguished by near-zero wrist velocity and a
    much longer sustained dwell than an active touch, picking, or pulling
    motion ever shows. Flagged 'posture', not a BFRB, in the UI -- see
    HABIT_CATEGORY in state/store.js -- since resting your chin on your hand
    isn't compulsive/self-injurious the way the other habits are."""
    v = _base_vector()
    v[IDX["min_fingertip_to_mouth_dist"]] = _noisy(0.35, 0.25, 0.0, 0.8)
    v[IDX["min_fingertip_to_hairline_dist"]] = _noisy(0.55, 0.2, 0.15, 0.95)
    v[IDX["min_fingertip_to_face_dist"]] = _noisy(0.15, 0.09, 0.0, 0.3)
    v[IDX["hand_above_forehead"]] = 0.0
    v[IDX["hand_height_norm"]] = _noisy(0.55, 0.15, 0.3, 0.85)
    v[IDX["mouth_compression_ratio"]] = _noisy(0.2, 0.1)
    v[IDX["mouth_asymmetry"]] = _noisy(0.08, 0.06)
    # A resting hand/palm is characteristically relaxed -- not curled into a
    # fist the way nail_biting or nose_picking are, and not isolated to one
    # finger the way an active pinch or point is.
    v[IDX["finger_curl_score"]] = _noisy(0.25, 0.15)
    v[IDX["thumb_or_index_isolated"]] = 0.0
    v[IDX["pinch_grip_score"]] = _noisy(0.1, 0.1, 0.0, 0.35)
    # The defining signal: this is a STATIC posture, not an active motion --
    # velocity near zero and dwell time near the cap, unlike every other
    # hand-based habit above which involves ongoing small adjustments.
    v[IDX["hand_velocity_norm"]] = _noisy(0.04, 0.05, 0.0, 0.15)
    v[IDX["dwell_time_norm"]] = _noisy(0.75, 0.2, 0.4, 1.0)
    v[IDX["head_tilt_norm"]] = _noisy(0.3, 0.15)
    v[IDX["num_hands_present"]] = random.choice([0.5, 1.0])
    v[IDX["hand_face_overlap"]] = 1.0
    # chin/cheek resting: jaw most common (classic "hand under chin"), cheek
    # also real (elbow-on-desk, cheek-in-palm)
    _set_region(v, random.choice(["jaw", "jaw", "cheek"]), 0.09, 0.06, 0.0, 0.2)
    _set_finger(v, None)
    return v


SAMPLERS = {
    "none": _sample_none,
    "nail_biting": _sample_nail_biting,
    "hair_pulling": _sample_hair_pulling,
    "face_touching": _sample_face_touching,
    "lip_biting": _sample_lip_biting,
    "nose_picking": _sample_nose_picking,
    "eye_rubbing": _sample_eye_rubbing,
    "skin_picking": _sample_skin_picking,
    "chewing": _sample_chewing,
    "chin_resting": _sample_chin_resting,
}


def generate_seed_dataset(n_per_class=180, seed=42):
    rng = random.Random(seed)
    random.seed(seed)
    X, y = [], []
    for label, sampler in SAMPLERS.items():
        for _ in range(n_per_class):
            X.append(sampler())
            y.append(label)
    combined = list(zip(X, y))
    rng.shuffle(combined)
    X, y = zip(*combined)
    return list(X), list(y)
