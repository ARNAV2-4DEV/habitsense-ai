"""
Landmark index constants for Google's MediaPipe FaceLandmarker (478-point face mesh)
and HandLandmarker (21-point hand skeleton) models.

These indices are part of MediaPipe's public, documented topology
(https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py
and https://developers.google.com/mediapipe/solutions/vision/face_landmarker).
They are not invented — every geometric feature HabitSense computes is derived
from these well-known, publicly documented point indices.

IMPORTANT HONESTY NOTE:
MediaPipe's face mesh covers the FACE surface only. It does not track hair or
the scalp. There is no "hair landmark". For hair-pulling detection we use the
forehead/temple landmarks (widely used as a hairline proxy in AR try-on
applications) and extrapolate a scalp region above and outward from them.
This is a documented limitation, surfaced to the user in the UI copy, not
hidden.
"""

# --- Face landmark indices (subset of the 478-point mesh) -----------------

# Outer lip contour
LIP_LEFT_CORNER = 61
LIP_RIGHT_CORNER = 291
LIP_TOP_OUTER = 0
LIP_BOTTOM_OUTER = 17

# Inner lip contour (gap between these closes when lips are pressed/bitten)
LIP_TOP_INNER = 13
LIP_BOTTOM_INNER = 14

# Nose
NOSE_TIP = 4  # pronasale (tip); 1 is the columella, just below it
NOSE_BRIDGE = 6

# Hairline / forehead boundary proxy (top of the tracked face mesh surface)
FOREHEAD_CENTER = 10
TEMPLE_LEFT = 127
TEMPLE_RIGHT = 356

# Chin (used for head-tilt estimate)
CHIN = 152

# Face width reference points (used to scale/normalize all distances so the
# features are invariant to how close the person is sitting to the camera)
FACE_LEFT_EDGE = 234
FACE_RIGHT_EDGE = 454

MOUTH_LANDMARKS = [LIP_LEFT_CORNER, LIP_RIGHT_CORNER, LIP_TOP_OUTER, LIP_BOTTOM_OUTER]

# --- Named face regions, each a small cluster of points we average into a
# single representative point ("centroid"). Indices verified against
# MediaPipe's documented face mesh region groupings (eyebrow contours, cheek
# surface/cheekbone, jaw contour, forehead left/right). This is what lets us
# ask "which specific region did this fingertip land closest to" instead of
# just "how far from a couple of hand-picked points" — many more nodes, much
# more specific answers, same idea as a denser landmark mesh giving a denser
# answer.
# Eye contours, verified against MediaPipe's current face_mesh_connections.py
# (FACEMESH_LEFT_EYE / FACEMESH_RIGHT_EYE, google-ai-edge/mediapipe master,
# fetched directly rather than trusted from memory). MediaPipe's own
# "left"/"right" naming is anatomical (subject's left/right), which is the
# MIRROR of this file's existing image-relative convention (our "left_*"
# regions -- left_cheek, left_jaw, TEMPLE_LEFT=127 -- all share the same
# low-index numbering as MediaPipe's FACEMESH_RIGHT_EYE, so that set is what
# we call "left_eye" here, and vice versa).
LEFT_EYE = [33, 133, 246, 161, 160, 159, 158, 157, 173, 7, 163, 144, 145, 153, 154, 155]
RIGHT_EYE = [263, 362, 466, 388, 387, 386, 385, 384, 398, 249, 390, 373, 374, 380, 381, 382]

FACE_REGIONS = {
    "mouth": [LIP_LEFT_CORNER, LIP_RIGHT_CORNER, LIP_TOP_OUTER, LIP_BOTTOM_OUTER, LIP_TOP_INNER, LIP_BOTTOM_INNER],
    "left_cheek": [36, 205, 206, 207, 187, 123, 116, 117, 118, 119, 100, 47],
    "right_cheek": [266, 425, 426, 427, 411, 352, 345, 346, 347, 348, 329, 277],
    "left_jaw": [234, 93, 132, 58, 172, 136, 150, 149, 176, 148],
    "right_jaw": [454, 323, 361, 288, 397, 365, 379, 378, 400, 377],
    "chin": [152],
    "left_eyebrow": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "right_eyebrow": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    "forehead_left": [21, 54, 67, 68, 69, 71, 103, 104, 108, 109],
    "forehead_right": [251, 284, 297, 298, 299, 301, 332, 333, 337, 338],
    "nose": [NOSE_TIP, NOSE_BRIDGE],
    "left_eye": LEFT_EYE,
    "right_eye": RIGHT_EYE,
}

# Broad groups used for the classifier's one-hot "which region group" signal
# — fine enough to distinguish the habits, coarse enough not to overfit to
# single noisy points.
REGION_GROUPS = {
    "mouth": "mouth",
    "left_cheek": "cheek",
    "right_cheek": "cheek",
    "left_jaw": "jaw",
    "right_jaw": "jaw",
    "chin": "jaw",
    "left_eyebrow": "eyebrow_forehead",
    "right_eyebrow": "eyebrow_forehead",
    "forehead_left": "eyebrow_forehead",
    "forehead_right": "eyebrow_forehead",
    "nose": "nose",
    "left_eye": "eye",
    "right_eye": "eye",
    "scalp": "scalp",  # extrapolated crown/temple points, not a mesh-native region
}
REGION_GROUP_NAMES = ["mouth", "cheek", "jaw", "eyebrow_forehead", "scalp", "nose", "eye"]

# --- Hand landmark indices (MediaPipe HandLandmarker, 21 points) ----------

WRIST = 0
THUMB_TIP = 4
INDEX_TIP = 8
MIDDLE_TIP = 12
RING_TIP = 16
PINKY_TIP = 20

FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
FINGERTIP_NAMES = {THUMB_TIP: "thumb", INDEX_TIP: "index", MIDDLE_TIP: "middle", RING_TIP: "ring", PINKY_TIP: "pinky"}
FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"]

# MCP (knuckle) joints, used to estimate finger curl for the
# "fist-with-one-finger-extended" posture typical of nail biting
THUMB_MCP = 2
INDEX_MCP = 5
MIDDLE_MCP = 9
RING_MCP = 13
PINKY_MCP = 17

FINGER_TIP_MCP_PAIRS = [
    (THUMB_TIP, THUMB_MCP),
    (INDEX_TIP, INDEX_MCP),
    (MIDDLE_TIP, MIDDLE_MCP),
    (RING_TIP, RING_MCP),
    (PINKY_TIP, PINKY_MCP),
]


def dist(a, b):
    """Euclidean distance between two {x,y,z} landmark dicts (z optional)."""
    dx = a["x"] - b["x"]
    dy = a["y"] - b["y"]
    dz = a.get("z", 0.0) - b.get("z", 0.0)
    return (dx * dx + dy * dy + dz * dz) ** 0.5


def midpoint(a, b):
    return {
        "x": (a["x"] + b["x"]) / 2,
        "y": (a["y"] + b["y"]) / 2,
        "z": (a.get("z", 0.0) + b.get("z", 0.0)) / 2,
    }


def centroid(points):
    n = len(points)
    return {
        "x": sum(p["x"] for p in points) / n,
        "y": sum(p["y"] for p in points) / n,
        "z": sum(p.get("z", 0.0) for p in points) / n,
    }


def region_centroids(face):
    """Returns {region_name: {x,y,z}} for every named region in FACE_REGIONS."""
    return {name: centroid([face[i] for i in idxs]) for name, idxs in FACE_REGIONS.items()}
