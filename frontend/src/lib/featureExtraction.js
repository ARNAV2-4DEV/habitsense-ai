/**
 * JS mirror of backend/app/ml/features.py -- same MediaPipe landmark indices,
 * same geometric formulas, same FEATURE_NAMES order, same named-region /
 * closest-finger contact map. Kept as a literal port (not "inspired by") so
 * client-side heuristics and the server-trained model agree on what each
 * number means. If you change one, change the other.
 */

export const FEATURE_NAMES = [
  'min_fingertip_to_mouth_dist',
  'min_fingertip_to_hairline_dist',
  'min_fingertip_to_face_dist',
  'hand_above_forehead',
  'hand_height_norm',
  'mouth_compression_ratio',
  'mouth_asymmetry',
  'finger_curl_score',
  'thumb_or_index_isolated',
  'pinch_grip_score',
  'hand_velocity_norm',
  'dwell_time_norm',
  'head_tilt_norm',
  'num_hands_present',
  'hand_face_overlap',
  'nearest_region_mouth',
  'nearest_region_cheek',
  'nearest_region_jaw',
  'nearest_region_eyebrow_forehead',
  'nearest_region_scalp',
  'nearest_region_nose',
  'nearest_region_eye',
  'nearest_region_dist',
  'closest_finger_is_thumb',
  'closest_finger_is_index',
  'closest_finger_is_middle',
  'closest_finger_is_ring',
  'closest_finger_is_pinky',
]

// --- Face landmark indices (MediaPipe FaceLandmarker, 478-point mesh) -----
const LIP_LEFT_CORNER = 61
const LIP_RIGHT_CORNER = 291
const LIP_TOP_OUTER = 0
const LIP_BOTTOM_OUTER = 17
const LIP_TOP_INNER = 13
const LIP_BOTTOM_INNER = 14
const NOSE_TIP = 4
const NOSE_BRIDGE = 6
const FOREHEAD_CENTER = 10
const CHIN = 152
const FACE_LEFT_EDGE = 234
const FACE_RIGHT_EDGE = 454
const TEMPLE_LEFT = 127
const TEMPLE_RIGHT = 356

// Named face regions (verified against MediaPipe's documented mesh region
// groupings -- eyebrow contours, cheek surface/cheekbone, jaw contour,
// forehead left/right) collapsed to a small representative point set each.
// Exported so CameraStage can draw the exact points the model reads, not a
// separate decorative overlay.
export const FACE_REGIONS = {
  mouth: [LIP_LEFT_CORNER, LIP_RIGHT_CORNER, LIP_TOP_OUTER, LIP_BOTTOM_OUTER, LIP_TOP_INNER, LIP_BOTTOM_INNER],
  left_cheek: [36, 205, 206, 207, 187, 123, 116, 117, 118, 119, 100, 47],
  right_cheek: [266, 425, 426, 427, 411, 352, 345, 346, 347, 348, 329, 277],
  left_jaw: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148],
  right_jaw: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377],
  chin: [152],
  left_eyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  right_eyebrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  forehead_left: [21, 54, 67, 68, 69, 71, 103, 104, 108, 109],
  forehead_right: [251, 284, 297, 298, 299, 301, 332, 333, 337, 338],
  nose: [NOSE_TIP, NOSE_BRIDGE],
  // Eye contours, verified against MediaPipe's current face_mesh_connections.py
  // (FACEMESH_LEFT_EYE / FACEMESH_RIGHT_EYE, google-ai-edge/mediapipe master).
  // MediaPipe's own "left"/"right" naming is anatomical (subject's left/right)
  // -- the mirror of this file's image-relative convention -- so the set that
  // matches our existing low-index left_cheek/left_jaw numbering is "left_eye".
  left_eye: [33, 133, 246, 161, 160, 159, 158, 157, 173, 7, 163, 144, 145, 153, 154, 155],
  right_eye: [263, 362, 466, 388, 387, 386, 385, 384, 398, 249, 390, 373, 374, 380, 381, 382],
}
const REGION_GROUPS = {
  mouth: 'mouth',
  left_cheek: 'cheek', right_cheek: 'cheek',
  left_jaw: 'jaw', right_jaw: 'jaw', chin: 'jaw',
  left_eyebrow: 'eyebrow_forehead', right_eyebrow: 'eyebrow_forehead',
  forehead_left: 'eyebrow_forehead', forehead_right: 'eyebrow_forehead',
  nose: 'nose',
  left_eye: 'eye', right_eye: 'eye',
}
const REGION_GROUP_NAMES = ['mouth', 'cheek', 'jaw', 'eyebrow_forehead', 'scalp', 'nose', 'eye']

// --- Hand landmark indices (MediaPipe HandLandmarker, 21 points) ----------
const WRIST = 0
const THUMB_TIP = 4, THUMB_MCP = 2
const INDEX_TIP = 8, INDEX_MCP = 5
const MIDDLE_TIP = 12, MIDDLE_MCP = 9
const RING_TIP = 16, RING_MCP = 13
const PINKY_TIP = 20, PINKY_MCP = 17
const FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
const FINGERTIP_NAMES = { [THUMB_TIP]: 'thumb', [INDEX_TIP]: 'index', [MIDDLE_TIP]: 'middle', [RING_TIP]: 'ring', [PINKY_TIP]: 'pinky' }
const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky']
const TIP_MCP_PAIRS = [
  [THUMB_TIP, THUMB_MCP],
  [INDEX_TIP, INDEX_MCP],
  [MIDDLE_TIP, MIDDLE_MCP],
  [RING_TIP, RING_MCP],
  [PINKY_TIP, PINKY_MCP],
]

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
function centroid(points) {
  const n = points.length
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
    z: points.reduce((s, p) => s + (p.z || 0), 0) / n,
  }
}
function regionCentroids(face) {
  const out = {}
  for (const [name, idxs] of Object.entries(FACE_REGIONS)) {
    out[name] = centroid(idxs.map((i) => face[i]))
  }
  return out
}
function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

// Extrapolated scalp target points -- a heuristic proxy, not real tracked
// landmarks (the face mesh has no hair/scalp points). Exported so the UI can
// render them visually distinct from real mesh points and not imply
// otherwise.
export function hairlineRegionPoints(face) {
  const forehead = face[FOREHEAD_CENTER]
  const chin = face[CHIN]
  const faceHeight = Math.abs(chin.y - forehead.y)
  const crown = { x: forehead.x, y: forehead.y - 0.35 * faceHeight, z: forehead.z || 0 }
  const leftTemple = face[TEMPLE_LEFT]
  const rightTemple = face[TEMPLE_RIGHT]
  const leftScalp = { x: leftTemple.x - 0.10 * faceHeight, y: leftTemple.y - 0.28 * faceHeight, z: leftTemple.z || 0 }
  const rightScalp = { x: rightTemple.x + 0.10 * faceHeight, y: rightTemple.y - 0.28 * faceHeight, z: rightTemple.z || 0 }
  return [crown, leftScalp, rightScalp]
}

function fingerCurl(hand) {
  const wrist = hand[WRIST]
  const palmScale = Math.max(dist(wrist, hand[MIDDLE_MCP]), 1e-6)
  const curls = TIP_MCP_PAIRS.slice(1).map(([tip, mcp]) => dist(hand[tip], hand[mcp]) / palmScale)
  const avgExt = curls.reduce((a, b) => a + b, 0) / curls.length
  return clamp(1.2 - avgExt)
}

function isolatedFinger(hand) {
  const wrist = hand[WRIST]
  const palmScale = Math.max(dist(wrist, hand[MIDDLE_MCP]), 1e-6)
  const ext = {}
  for (const [tip, mcp] of TIP_MCP_PAIRS) ext[tip] = dist(hand[tip], hand[mcp]) / palmScale
  const othersAvg = (ext[MIDDLE_TIP] + ext[RING_TIP] + ext[PINKY_TIP]) / 3
  const lead = Math.max(ext[THUMB_TIP], ext[INDEX_TIP])
  return lead - othersAvg > 0.35 ? 1.0 : 0.0
}

/** 1.0 when thumb and index tips are pressed together (a pinch) while the
 * other three fingers are curled out of the way -- the skin-picking grip,
 * distinct from nail-biting's single isolated finger and from a flat-palm
 * touch (both score near 0 here). */
function pinchGrip(hand) {
  const wrist = hand[WRIST]
  const palmScale = Math.max(dist(wrist, hand[MIDDLE_MCP]), 1e-6)
  const pinchDist = dist(hand[THUMB_TIP], hand[INDEX_TIP]) / palmScale
  const pinchComponent = clamp(1.0 - pinchDist / 0.5)
  const otherCurls = TIP_MCP_PAIRS.slice(2).map(([tip, mcp]) => dist(hand[tip], hand[mcp]) / palmScale)
  const othersAvgExt = otherCurls.reduce((a, b) => a + b, 0) / otherCurls.length
  const curlComponent = clamp(1.2 - othersAvgExt)
  return pinchComponent * curlComponent
}

/**
 * Finds the single closest fingertip-to-region pair for the current frame,
 * mirroring the inner search in extract() exactly (same distance formula,
 * same regions, same scalp extrapolation) but with no stateful side effects
 * -- safe to call every render purely for visualization (Phase 1 landmark
 * mesh overlay), independent of the stateful extractor used for inference.
 * Returns null if there's no face or no hands this frame.
 */
export function findNearestContact(face, hands) {
  if (!face || !hands || hands.length === 0) return null
  const faceW = Math.max(dist(face[FACE_LEFT_EDGE], face[FACE_RIGHT_EDGE]), 1e-6)
  const regions = regionCentroids(face)
  const scalpPts = hairlineRegionPoints(face)

  let best = null

  for (const hand of hands) {
    for (const tipIdx of FINGERTIPS) {
      const tip = hand[tipIdx]
      const fingerName = FINGERTIP_NAMES[tipIdx]

      for (const [regionName, point] of Object.entries(regions)) {
        const d = dist(tip, point) / faceW
        if (!best || d < best.dist) {
          best = { dist: d, group: REGION_GROUPS[regionName], finger: fingerName, regionPoint: point, tipPoint: tip }
        }
      }
      for (const point of scalpPts) {
        const d = dist(tip, point) / faceW
        if (!best || d < best.dist) {
          best = { dist: d, group: 'scalp', finger: fingerName, regionPoint: point, tipPoint: tip }
        }
      }
    }
  }
  return best
}

/**
 * Creates a stateful extractor closure. Call .extract(face, hands, timestampSec)
 * on every frame; it internally tracks previous wrist position and dwell time,
 * exactly like the Python extract_features(face, hands, prev_state) does.
 */
// Lip thinning, measured against the person's OWN resting lips -- mirror of
// lip_thickness / update_lip_baseline / lip_thinning in features.py. The
// earlier measure (1 - inner-lip gap / mouth width) read ~0.92 for an
// ordinary relaxed, closed mouth, the same as a real bite.
const LIP_THINNING_FULL = 0.4
const LIP_BASELINE_RISE = 0.2
const LIP_BASELINE_DRIFT = 0.01
const LIP_NEAR_REST = 0.85

function lipThickness(face) {
  const width = Math.max(dist(face[LIP_LEFT_CORNER], face[LIP_RIGHT_CORNER]), 1e-6)
  const upper = dist(face[LIP_TOP_OUTER], face[LIP_TOP_INNER])
  const lower = dist(face[LIP_BOTTOM_INNER], face[LIP_BOTTOM_OUTER])
  return (upper + lower) / width
}

function updateLipBaseline(baseline, thickness) {
  if (baseline == null) return thickness
  if (thickness > baseline) return baseline + LIP_BASELINE_RISE * (thickness - baseline)
  if (thickness > LIP_NEAR_REST * baseline) return baseline + LIP_BASELINE_DRIFT * (thickness - baseline)
  return baseline
}

function lipThinning(baseline, thickness) {
  return clamp((baseline - thickness) / Math.max(LIP_THINNING_FULL * baseline, 1e-6))
}

export function createFeatureExtractor() {
  let state = { prevWrist: null, dwellState: null, dwellStartedAt: null, lipBaseline: null, t: 0 }

  function reset() {
    state = { prevWrist: null, dwellState: null, dwellStartedAt: null, lipBaseline: null, t: 0 }
  }

  function extract(face, hands, timestampSec) {
    if (!face) {
      const vec = new Array(FEATURE_NAMES.length).fill(0)
      vec[FEATURE_NAMES.indexOf('num_hands_present')] = Math.min(hands.length, 2) / 2
      state.dwellState = null
      state.dwellStartedAt = null
      return vec
    }

    const faceW = Math.max(dist(face[FACE_LEFT_EDGE], face[FACE_RIGHT_EDGE]), 1e-6)
    const chin = face[CHIN]
    const forehead = face[FOREHEAD_CENTER]

    // Face-only geometry: computed whenever a face is tracked, regardless of
    // whether any hand is in frame. lip_biting has NO hand signal at all --
    // zeroing these out whenever hands is empty (as an earlier version did)
    // made lip-biting silently undetectable in exactly the situation it's
    // defined by (hands away from the camera).
    const thickness = lipThickness(face)
    state.lipBaseline = updateLipBaseline(state.lipBaseline, thickness)
    const mouthCompression = lipThinning(state.lipBaseline, thickness)
    const asymmetry = Math.min(Math.abs(face[LIP_LEFT_CORNER].y - face[LIP_RIGHT_CORNER].y) / faceW, 1.0)

    const nose = face[NOSE_TIP]
    const dx = chin.x - nose.x, dy = chin.y - nose.y
    const tiltRad = Math.atan2(dx, Math.max(dy, 1e-6))
    const tiltNorm = clamp(Math.abs(tiltRad) / (Math.PI / 4))

    // Hand-dependent geometry: only meaningful with at least one tracked
    // hand. Defaults below ("far"/0) match what a genuinely distant hand
    // would produce.
    let minMouth, minHair, minFace, handAboveForehead, handHeightNorm
    let curl, isolated, pinch, velocityNorm, overlap
    let bestGroup = null, bestFinger = null, bestDist
    let bestWrist = null

    if (hands.length === 0) {
      minMouth = minHair = minFace = 3
      handAboveForehead = 0.0
      handHeightNorm = 0.0
      curl = isolated = pinch = 0.0
      velocityNorm = 0.0
      overlap = 0.0
      bestDist = 3
    } else {
      const regions = regionCentroids(face)
      const scalpPts = hairlineRegionPoints(face)

      minMouth = Infinity; minHair = Infinity; minFace = Infinity
      bestDist = Infinity
      let bestHand = hands[0]
      bestWrist = bestHand[WRIST]

      for (const hand of hands) {
        for (const tipIdx of FINGERTIPS) {
          const tip = hand[tipIdx]
          const fingerName = FINGERTIP_NAMES[tipIdx]

          const dMouth = dist(tip, regions.mouth) / faceW
          const dFace = dist(tip, regions.nose) / faceW
          const dHair = Math.min(...scalpPts.map((p) => dist(tip, p))) / faceW
          minMouth = Math.min(minMouth, dMouth)
          minFace = Math.min(minFace, dFace)
          minHair = Math.min(minHair, dHair)

          for (const [regionName, point] of Object.entries(regions)) {
            const d = dist(tip, point) / faceW
            if (d < bestDist) {
              bestDist = d
              bestGroup = REGION_GROUPS[regionName]
              bestFinger = fingerName
            }
          }
          if (dHair < bestDist) {
            bestDist = dHair
            bestGroup = 'scalp'
            bestFinger = fingerName
          }
        }
        if (dist(hand[WRIST], regions.nose) < dist(bestWrist, regions.nose)) {
          bestHand = hand
          bestWrist = hand[WRIST]
        }
      }

      handAboveForehead = bestWrist.y < forehead.y ? 1.0 : 0.0
      const faceHeight = Math.max(Math.abs(chin.y - forehead.y), 1e-6)
      handHeightNorm = clamp((chin.y - bestWrist.y) / (faceHeight * 2.5))

      curl = fingerCurl(bestHand)
      isolated = isolatedFinger(bestHand)
      pinch = pinchGrip(bestHand)

      const v = state.prevWrist ? dist(bestWrist, state.prevWrist) / faceW : 0.0
      velocityNorm = clamp(v * 8.0)

      overlap = minFace < 0.9 ? 1.0 : 0.0
    }

    // Dwell/contact tracking: EITHER a fingertip sustained near a region OR
    // the mouth held compressed counts as "in contact". Without the
    // mouth-compression path, lip_biting -- which has no hand signal to
    // anchor on -- could never accumulate dwell time at all, so there was no
    // way to tell a sustained bite from a momentary bilabial consonant or
    // smile passing through the same compression range for a single frame.
    const handContact = minMouth < 0.55 || minHair < 0.55
    const mouthContact = mouthCompression > 0.6
    const inContact = handContact || mouthContact
    const now = timestampSec
    if (inContact) {
      if (state.dwellState !== 'contact') state.dwellStartedAt = now
      state.dwellState = 'contact'
    } else {
      state.dwellState = null
      state.dwellStartedAt = null
    }
    const dwellSeconds = state.dwellStartedAt != null ? now - state.dwellStartedAt : 0
    const dwellNorm = clamp(dwellSeconds / 10.0)

    const vec = new Array(FEATURE_NAMES.length).fill(0)
    vec[FEATURE_NAMES.indexOf('min_fingertip_to_mouth_dist')] = Math.min(minMouth, 3) / 3
    vec[FEATURE_NAMES.indexOf('min_fingertip_to_hairline_dist')] = Math.min(minHair, 3) / 3
    vec[FEATURE_NAMES.indexOf('min_fingertip_to_face_dist')] = Math.min(minFace, 3) / 3
    vec[FEATURE_NAMES.indexOf('hand_above_forehead')] = handAboveForehead
    vec[FEATURE_NAMES.indexOf('hand_height_norm')] = handHeightNorm
    vec[FEATURE_NAMES.indexOf('mouth_compression_ratio')] = mouthCompression
    vec[FEATURE_NAMES.indexOf('mouth_asymmetry')] = asymmetry
    vec[FEATURE_NAMES.indexOf('finger_curl_score')] = curl
    vec[FEATURE_NAMES.indexOf('thumb_or_index_isolated')] = isolated
    vec[FEATURE_NAMES.indexOf('pinch_grip_score')] = pinch
    vec[FEATURE_NAMES.indexOf('hand_velocity_norm')] = velocityNorm
    vec[FEATURE_NAMES.indexOf('dwell_time_norm')] = dwellNorm
    vec[FEATURE_NAMES.indexOf('head_tilt_norm')] = tiltNorm
    vec[FEATURE_NAMES.indexOf('num_hands_present')] = Math.min(hands.length, 2) / 2
    vec[FEATURE_NAMES.indexOf('hand_face_overlap')] = overlap

    for (const g of REGION_GROUP_NAMES) {
      vec[FEATURE_NAMES.indexOf(`nearest_region_${g}`)] = bestGroup === g ? 1.0 : 0.0
    }
    vec[FEATURE_NAMES.indexOf('nearest_region_dist')] = Math.min(bestDist, 3) / 3
    for (const fn of FINGER_NAMES) {
      vec[FEATURE_NAMES.indexOf(`closest_finger_is_${fn}`)] = bestFinger === fn ? 1.0 : 0.0
    }

    // Only overwrite prevWrist when a hand was actually tracked this frame
    // -- otherwise a hand reappearing after being briefly out of frame would
    // compute velocity against a stale/null position rather than simply
    // carrying the last known one forward.
    if (bestWrist !== null) state.prevWrist = bestWrist
    state.t = now
    return vec
  }

  return { extract, reset }
}

/** Quick local heuristic (no ML) used for the very first frame before the
 * backend responds, and as an offline fallback if the backend is down. */
export function heuristicGuess(vec) {
  const f = (name) => vec[FEATURE_NAMES.indexOf(name)]
  if (f('nearest_region_mouth') === 1 && f('nearest_region_dist') < 0.2) {
    return { label: 'nail_biting', confidence: 0.55 }
  }
  if (f('nearest_region_scalp') === 1 && f('nearest_region_dist') < 0.25) {
    return { label: 'hair_pulling', confidence: 0.55 }
  }
  if (f('nearest_region_nose') === 1 && f('nearest_region_dist') < 0.2) {
    return { label: 'nose_picking', confidence: 0.5 }
  }
  if (f('nearest_region_eye') === 1 && f('nearest_region_dist') < 0.2) {
    return { label: 'eye_rubbing', confidence: 0.5 }
  }
  if (f('mouth_compression_ratio') > 0.7 && f('num_hands_present') === 0) {
    return { label: 'lip_biting', confidence: 0.4 }
  }
  if ((f('nearest_region_cheek') === 1 || f('nearest_region_jaw') === 1) && f('nearest_region_dist') < 0.25) {
    if (f('pinch_grip_score') > 0.6) {
      return { label: 'skin_picking', confidence: 0.45 }
    }
    // Static, sustained contact with near-zero hand movement reads as a
    // resting posture (chin/cheek-in-hand) rather than an active touch --
    // see Phase 4 in the expansion plan.
    if (f('hand_velocity_norm') < 0.1 && f('dwell_time_norm') > 0.5) {
      return { label: 'chin_resting', confidence: 0.45 }
    }
    return { label: 'face_touching', confidence: 0.45 }
  }
  return { label: 'none', confidence: 0.6 }
}
