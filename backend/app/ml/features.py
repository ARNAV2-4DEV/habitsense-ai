"""
Turns a single frame of raw MediaPipe landmarks (face + hands) into the fixed
28-dimensional feature vector HabitClassifier is trained on.

v2: in addition to the original coarse distance signals, this version tracks
*which specific fingertip* (thumb/index/middle/ring/pinky) is closest to
*which specific named face region* (mouth, left/right cheek, left/right jaw,
eyebrow/forehead, extrapolated scalp, nose) on every frame -- using ~50
underlying mesh landmark points across those regions instead of a handful of
hand-picked ones. This is the "which node connects to which node" signal:
nail-biting is a specific finger at the mouth; hair-pulling is a hand at the
scalp; face-touching is a broad palm/finger contact with cheek or jaw. Naming
the actual region and finger gives the classifier far more to work with than
raw undifferentiated distance.

This is the single canonical implementation of the feature schema. The
frontend mirrors this exact schema in JS (src/lib/featureExtraction.js) so
that live, low-latency client-side heuristics and the server-trained model
agree on what each number means. If you change FEATURE_NAMES here, update
the JS mirror too -- see the comment block at the top of that file.

Nothing here trains on raw pixels or video. Every number is a normalized
geometric relationship between hand and face landmark points (see
landmarks.py for exactly which points and why).
"""
from __future__ import annotations
import math
from . import landmarks as L

FEATURE_NAMES = [
    "min_fingertip_to_mouth_dist",      # closest fingertip to mouth region, /face_width
    "min_fingertip_to_hairline_dist",   # closest fingertip to hairline/scalp region, /face_width
    "min_fingertip_to_face_dist",       # closest fingertip to nose region (general "face touch"), /face_width
    "hand_above_forehead",              # 1.0 if wrist is above the forehead landmark, else 0.0
    "hand_height_norm",                 # wrist height relative to face, normalized
    "mouth_compression_ratio",          # how much thinner the visible lips are than this person's own resting
                                         # lips: 0 = relaxed, 1 = 40%+ thinner (lips bitten / rolled in)
    "mouth_asymmetry",                  # |left corner y - right corner y| / face_width -> lip-biting tends to pull one side
    "finger_curl_score",                # 0 = fingers extended, 1 = curled into a fist (typical nail-biting hand shape)
    "thumb_or_index_isolated",          # 1.0 if exactly one of thumb/index is far more extended than the rest (finger-to-mouth posture)
    "pinch_grip_score",                 # 1.0 if thumb+index tips are pressed together while the other three fingers are
                                         # curled -- the "pinching skin" grip, distinct from nail-biting's isolated finger
                                         # or a flat-palm touch
    "hand_velocity_norm",               # wrist movement since previous frame, normalized (near 0 = static sustained contact)
    "dwell_time_norm",                  # seconds since the current contact state began, capped at 10s and scaled to [0,1]
    "head_tilt_norm",                   # chin-to-nose vector angle vs vertical, normalized -> people tilt into the hand
    "num_hands_present",                # 0, 1, or 2 (scaled /2)
    "hand_face_overlap",                # 1.0 if any fingertip is within the face's bounding region at all
    # -- region/finger contact map (v2) --
    "nearest_region_mouth",             # 1.0 if the single closest fingertip-to-region pair this frame is at the mouth
    "nearest_region_cheek",             # ...at either cheek
    "nearest_region_jaw",               # ...at jaw/chin
    "nearest_region_eyebrow_forehead",  # ...at an eyebrow or forehead side
    "nearest_region_scalp",             # ...at the extrapolated scalp/temple region
    "nearest_region_nose",              # ...at the nose
    "nearest_region_eye",               # ...at either eye
    "nearest_region_dist",              # distance of that single closest pair, /face_width
    "closest_finger_is_thumb",          # which finger achieved that closest pair
    "closest_finger_is_index",
    "closest_finger_is_middle",
    "closest_finger_is_ring",
    "closest_finger_is_pinky",
]

N_FEATURES = len(FEATURE_NAMES)


def _face_width(face):
    return max(L.dist(face[L.FACE_LEFT_EDGE], face[L.FACE_RIGHT_EDGE]), 1e-6)


def hairline_region_points(face):
    """
    Approximate scalp target points: extrapolate upward from the forehead
    AND from both temples, since the face mesh does not include hair and
    people pull/touch hair from the sides of the head as often as the top.
    Returns a list of candidate points; callers take the minimum distance
    across all of them. This is a heuristic proxy, documented as such.
    """
    forehead = face[L.FOREHEAD_CENTER]
    chin = face[L.CHIN]
    face_height = abs(chin["y"] - forehead["y"])
    crown = {
        "x": forehead["x"],
        "y": forehead["y"] - 0.35 * face_height,
        "z": forehead.get("z", 0.0),
    }
    left_temple = face[L.TEMPLE_LEFT]
    right_temple = face[L.TEMPLE_RIGHT]
    left_scalp = {
        "x": left_temple["x"] - 0.10 * face_height,
        "y": left_temple["y"] - 0.28 * face_height,
        "z": left_temple.get("z", 0.0),
    }
    right_scalp = {
        "x": right_temple["x"] + 0.10 * face_height,
        "y": right_temple["y"] - 0.28 * face_height,
        "z": right_temple.get("z", 0.0),
    }
    return [crown, left_scalp, right_scalp]


def _finger_curl(hand):
    """Average of (tip-to-MCP distance / palm-scale) across the 4 non-thumb fingers.
    Small value = curled fingers (fist-like), large value = extended fingers."""
    wrist = hand[L.WRIST]
    palm_scale = max(L.dist(wrist, hand[L.MIDDLE_MCP]), 1e-6)
    curls = []
    for tip_idx, mcp_idx in L.FINGER_TIP_MCP_PAIRS[1:]:  # skip thumb, handled separately
        curls.append(L.dist(hand[tip_idx], hand[mcp_idx]) / palm_scale)
    avg_extension = sum(curls) / len(curls)
    return max(0.0, min(1.0, 1.2 - avg_extension))


def _isolated_finger(hand):
    """1.0 if thumb or index is clearly more extended than the other three
    (the classic 'one finger toward the mouth, rest curled' nail-biting shape)."""
    wrist = hand[L.WRIST]
    palm_scale = max(L.dist(wrist, hand[L.MIDDLE_MCP]), 1e-6)
    ext = {}
    for tip_idx, mcp_idx in L.FINGER_TIP_MCP_PAIRS:
        ext[tip_idx] = L.dist(hand[tip_idx], hand[mcp_idx]) / palm_scale
    others = [ext[L.MIDDLE_TIP], ext[L.RING_TIP], ext[L.PINKY_TIP]]
    others_avg = sum(others) / len(others)
    lead = max(ext[L.THUMB_TIP], ext[L.INDEX_TIP])
    return 1.0 if (lead - others_avg) > 0.35 else 0.0


def _pinch_grip(hand):
    """1.0 when thumb and index tips are pressed together (a pinch) while
    the other three fingers are curled out of the way -- the skin-picking
    grip, distinct from nail-biting's single isolated finger and from a
    flat-palm touch (both score near 0 here)."""
    wrist = hand[L.WRIST]
    palm_scale = max(L.dist(wrist, hand[L.MIDDLE_MCP]), 1e-6)
    pinch_dist = L.dist(hand[L.THUMB_TIP], hand[L.INDEX_TIP]) / palm_scale
    pinch_component = max(0.0, min(1.0, 1.0 - pinch_dist / 0.5))
    other_curls = [
        L.dist(hand[tip], hand[mcp]) / palm_scale
        for tip, mcp in L.FINGER_TIP_MCP_PAIRS[2:]  # middle, ring, pinky
    ]
    others_avg_ext = sum(other_curls) / len(other_curls)
    curl_component = max(0.0, min(1.0, 1.2 - others_avg_ext))
    return pinch_component * curl_component


# Lip thinning, measured against the person's OWN resting lips. The earlier
# measure (1 - inner-lip gap / mouth width) read ~0.92 for an ordinary
# relaxed, closed mouth -- the same as a real bite -- so "mouth closed, hands
# down" was classified as lip biting. Visible lip thickness (outer to inner
# contour, upper + lower) is what actually shrinks when lips are bitten or
# rolled in, and it varies a lot between people, hence the baseline.
LIP_THINNING_FULL = 0.4      # 40% thinner than resting reads as fully compressed (1.0)
LIP_BASELINE_RISE = 0.2      # baseline follows fuller lips quickly...
LIP_BASELINE_DRIFT = 0.01    # ...and drifts down slowly, only while near resting
LIP_NEAR_REST = 0.85         # thinner than this fraction of baseline = possibly biting: baseline frozen


def lip_thickness(face):
    """Upper + lower visible lip thickness, as a fraction of mouth width."""
    width = max(L.dist(face[L.LIP_LEFT_CORNER], face[L.LIP_RIGHT_CORNER]), 1e-6)
    upper = L.dist(face[L.LIP_TOP_OUTER], face[L.LIP_TOP_INNER])
    lower = L.dist(face[L.LIP_BOTTOM_INNER], face[L.LIP_BOTTOM_OUTER])
    return (upper + lower) / width


def update_lip_baseline(baseline, thickness):
    if baseline is None:
        return thickness
    if thickness > baseline:
        return baseline + LIP_BASELINE_RISE * (thickness - baseline)
    if thickness > LIP_NEAR_REST * baseline:
        return baseline + LIP_BASELINE_DRIFT * (thickness - baseline)
    return baseline


def lip_thinning(baseline, thickness):
    return max(0.0, min(1.0, (baseline - thickness) / max(LIP_THINNING_FULL * baseline, 1e-6)))


def extract_features(face, hands, prev_state):
    """
    face: list of 478 {x,y,z} dicts, normalized image coordinates (0..1), or None
    hands: list of hand landmark lists (each 21 {x,y,z} dicts), 0-2 hands
    prev_state: dict carried between frames for this session, holding at least
        {"prev_wrist": {...} | None, "dwell_state": str | None, "dwell_started_at": float | None, "t": float}
        and, once a face has been seen, "lip_baseline" (this person's resting lip thickness)
        The API layer is responsible for persisting/passing this per session.

    Returns (feature_vector: list[float] length N_FEATURES, new_state: dict)
    """
    if face is None:
        vec = [0.0] * N_FEATURES
        vec[FEATURE_NAMES.index("num_hands_present")] = min(len(hands), 2) / 2.0
        new_state = dict(prev_state)
        new_state["dwell_state"] = None
        new_state["dwell_started_at"] = None
        return vec, new_state

    face_w = _face_width(face)
    chin = face[L.CHIN]
    forehead = face[L.FOREHEAD_CENTER]

    # --- Face-only geometry: computed whenever a face is tracked, regardless
    # of whether any hand is in frame. lip_biting has NO hand signal at all --
    # zeroing these out whenever hands==[] (as an earlier version did) made
    # lip-biting silently undetectable in exactly the situation it's defined
    # by (hands away from the camera).
    thickness = lip_thickness(face)
    lip_baseline = update_lip_baseline(prev_state.get("lip_baseline"), thickness)
    mouth_compression = lip_thinning(lip_baseline, thickness)
    asymmetry = abs(face[L.LIP_LEFT_CORNER]["y"] - face[L.LIP_RIGHT_CORNER]["y"]) / face_w

    nose_pt = face[L.NOSE_TIP]
    dx = chin["x"] - nose_pt["x"]
    dy = chin["y"] - nose_pt["y"]
    tilt_rad = math.atan2(dx, max(dy, 1e-6))
    tilt_norm = max(0.0, min(1.0, abs(tilt_rad) / (math.pi / 4)))

    # --- Hand-dependent geometry: only meaningful with at least one tracked
    # hand. Defaults below ("far"/0) match what a genuinely distant hand
    # would produce, so downstream logic doesn't need to special-case "no
    # hand" beyond these values.
    if len(hands) == 0:
        min_mouth_d = min_hair_d = min_face_d = 3.0
        hand_above_forehead = 0.0
        hand_height_norm = 0.0
        curl = isolated = pinch = 0.0
        velocity_norm = 0.0
        overlap = 0.0
        best_group, best_finger, best_dist = None, None, 3.0
        best_wrist = None
    else:
        regions = L.region_centroids(face)  # 11 named mesh regions -> centroid point
        scalp_pts = hairline_region_points(face)

        min_mouth_d = math.inf
        min_hair_d = math.inf
        min_face_d = math.inf

        best_group, best_finger, best_dist = None, None, math.inf

        best_hand = hands[0]
        best_wrist = best_hand[L.WRIST]

        for hand in hands:
            for tip_idx in L.FINGERTIPS:
                tip = hand[tip_idx]
                finger_name = L.FINGERTIP_NAMES[tip_idx]

                d_mouth = L.dist(tip, regions["mouth"]) / face_w
                d_face = L.dist(tip, regions["nose"]) / face_w
                d_hair = min(L.dist(tip, p) for p in scalp_pts) / face_w
                min_mouth_d = min(min_mouth_d, d_mouth)
                min_face_d = min(min_face_d, d_face)
                min_hair_d = min(min_hair_d, d_hair)

                for region_name, point in regions.items():
                    d = L.dist(tip, point) / face_w
                    if d < best_dist:
                        best_dist = d
                        best_group = L.REGION_GROUPS[region_name]
                        best_finger = finger_name
                if d_hair < best_dist:
                    best_dist = d_hair
                    best_group = "scalp"
                    best_finger = finger_name

            if L.dist(hand[L.WRIST], regions["nose"]) < L.dist(best_wrist, regions["nose"]):
                best_hand = hand
                best_wrist = hand[L.WRIST]

        hand_above_forehead = 1.0 if best_wrist["y"] < forehead["y"] else 0.0
        face_height = max(abs(chin["y"] - forehead["y"]), 1e-6)
        hand_height_norm = max(0.0, min(1.0, (chin["y"] - best_wrist["y"]) / (face_height * 2.5)))

        curl = _finger_curl(best_hand)
        isolated = _isolated_finger(best_hand)
        pinch = _pinch_grip(best_hand)

        prev_wrist = prev_state.get("prev_wrist")
        if prev_wrist is not None:
            v = L.dist(best_wrist, prev_wrist) / face_w
        else:
            v = 0.0
        velocity_norm = max(0.0, min(1.0, v * 8.0))

        overlap = 1.0 if min_face_d < 0.9 else 0.0

    # --- Dwell/contact tracking: EITHER a fingertip sustained near a region
    # OR the mouth held compressed counts as "in contact". Without the
    # mouth-compression path, lip_biting -- which has no hand signal to
    # anchor on -- could never accumulate dwell time at all, so the
    # classifier had no way to tell a sustained bite from a momentary
    # bilabial consonant or smile passing through the same compression
    # range for a single frame.
    hand_contact = (min_mouth_d < 0.55) or (min_hair_d < 0.55)
    mouth_contact = mouth_compression > 0.6
    in_contact = hand_contact or mouth_contact
    now = prev_state.get("t", 0.0) + 1.0 / 24.0
    dwell_state = prev_state.get("dwell_state")
    dwell_started_at = prev_state.get("dwell_started_at")
    if in_contact:
        if dwell_state != "contact":
            dwell_started_at = now
        dwell_state = "contact"
    else:
        dwell_state = None
        dwell_started_at = None
    dwell_seconds = (now - dwell_started_at) if dwell_started_at is not None else 0.0
    dwell_norm = max(0.0, min(1.0, dwell_seconds / 10.0))

    vec = [0.0] * N_FEATURES
    vec[FEATURE_NAMES.index("min_fingertip_to_mouth_dist")] = min(min_mouth_d, 3.0) / 3.0
    vec[FEATURE_NAMES.index("min_fingertip_to_hairline_dist")] = min(min_hair_d, 3.0) / 3.0
    vec[FEATURE_NAMES.index("min_fingertip_to_face_dist")] = min(min_face_d, 3.0) / 3.0
    vec[FEATURE_NAMES.index("hand_above_forehead")] = hand_above_forehead
    vec[FEATURE_NAMES.index("hand_height_norm")] = hand_height_norm
    vec[FEATURE_NAMES.index("mouth_compression_ratio")] = mouth_compression
    vec[FEATURE_NAMES.index("mouth_asymmetry")] = min(asymmetry, 1.0)
    vec[FEATURE_NAMES.index("finger_curl_score")] = curl
    vec[FEATURE_NAMES.index("thumb_or_index_isolated")] = isolated
    vec[FEATURE_NAMES.index("pinch_grip_score")] = pinch
    vec[FEATURE_NAMES.index("hand_velocity_norm")] = velocity_norm
    vec[FEATURE_NAMES.index("dwell_time_norm")] = dwell_norm
    vec[FEATURE_NAMES.index("head_tilt_norm")] = tilt_norm
    vec[FEATURE_NAMES.index("num_hands_present")] = min(len(hands), 2) / 2.0
    vec[FEATURE_NAMES.index("hand_face_overlap")] = overlap

    for g in L.REGION_GROUP_NAMES:
        vec[FEATURE_NAMES.index(f"nearest_region_{g}")] = 1.0 if best_group == g else 0.0
    vec[FEATURE_NAMES.index("nearest_region_dist")] = min(best_dist, 3.0) / 3.0
    for fn in L.FINGER_NAMES:
        vec[FEATURE_NAMES.index(f"closest_finger_is_{fn}")] = 1.0 if best_finger == fn else 0.0

    new_state = {
        # Only overwrite prev_wrist when a hand was actually tracked this
        # frame -- otherwise a hand reappearing after being briefly out of
        # frame would compute velocity against a stale/None position rather
        # than simply carrying the last known one forward.
        "prev_wrist": best_wrist if best_wrist is not None else prev_state.get("prev_wrist"),
        "dwell_state": dwell_state,
        "dwell_started_at": dwell_started_at,
        "lip_baseline": lip_baseline,
        "t": now,
    }
    return vec, new_state
