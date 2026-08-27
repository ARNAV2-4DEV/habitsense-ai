/**
 * Client-side calibration quality gates -- run on feature vectors already
 * collected during a recording burst, BEFORE anything is uploaded to the
 * backend. This keeps rejection instant and keeps "only clean labeled
 * vectors leave the browser" true.
 *
 * All five thresholds live here as named constants -- they're a starting
 * guess, not validated against real usage, so this is the one place to
 * tune them later rather than scattered magic numbers.
 */
import { FEATURE_NAMES } from './featureExtraction'

export const HAND_DETECTED_MIN_FRAC = 0.7
export const CONTACT_MIN_FRAC = 0.4
export const CONTACT_MAX_DIST = 0.25
export const LIP_COMPRESSION_MIN_FRAC = 0.3
export const LIP_COMPRESSION_THRESHOLD = 0.5
export const NEUTRAL_CONTAMINATION_MAX_FRAC = 0.15
export const MAX_GATE_RETRIES = 3

// Which named region group(s) count as "contact" for each hand-based habit.
// lip_biting has no hand signal at all, so it isn't listed here -- it's
// checked via mouth geometry instead (see evaluateHabitBurst below).
const EXPECTED_REGION_GROUPS = {
  nail_biting: ['mouth'],
  hair_pulling: ['scalp'],
  face_touching: ['cheek', 'jaw'],
  nose_picking: ['nose'],
  eye_rubbing: ['eye'],
  skin_picking: ['cheek', 'jaw'],
  chewing: ['mouth'],
}

const IDX = Object.fromEntries(FEATURE_NAMES.map((name, i) => [name, i]))

function frac(vectors, predicate) {
  if (!vectors || vectors.length === 0) return 0
  let n = 0
  for (const v of vectors) if (predicate(v)) n++
  return n / vectors.length
}

function isContact(vector, groups) {
  const nearEnough = vector[IDX.nearest_region_dist] < CONTACT_MAX_DIST
  const inExpectedGroup = groups.some((g) => vector[IDX[`nearest_region_${g}`]] === 1)
  return nearEnough && inExpectedGroup
}

/** Checks the "doing the habit" burst. Returns { pass, reason }. */
export function evaluateHabitBurst(habit, vectors) {
  if (!vectors || vectors.length === 0) {
    return { pass: false, reason: "No frames were captured — make sure your camera has a clear view and try again." }
  }

  if (habit === 'lip_biting') {
    // No hand signal exists for this habit; use the geometry that actually
    // carries its signal instead.
    const compressedFrac = frac(vectors, (v) => v[IDX.mouth_compression_ratio] > LIP_COMPRESSION_THRESHOLD)
    if (compressedFrac < LIP_COMPRESSION_MIN_FRAC) {
      return {
        pass: false,
        reason: "That didn't quite capture it — try pressing or biting your lips together more firmly during the recording.",
      }
    }
    return { pass: true }
  }

  const handFrac = frac(vectors, (v) => v[IDX.num_hands_present] > 0)
  if (handFrac < HAND_DETECTED_MIN_FRAC) {
    return {
      pass: false,
      reason: "Your hand wasn't visible enough of the time — make sure it stays in frame and try again.",
    }
  }

  const groups = EXPECTED_REGION_GROUPS[habit]
  const contactFrac = frac(vectors, (v) => isContact(v, groups))
  if (contactFrac < CONTACT_MIN_FRAC) {
    return {
      pass: false,
      reason: "That didn't quite capture it — try to make clearer, more sustained contact during the recording.",
    }
  }
  return { pass: true }
}

/** Checks the neutral/"none" burst for lingering contact contamination. */
export function evaluateNeutralBurst(habit, vectors) {
  const groups = EXPECTED_REGION_GROUPS[habit]
  if (!groups || !vectors || vectors.length === 0) return { pass: true }

  const contaminationFrac = frac(vectors, (v) => isContact(v, groups))
  if (contaminationFrac >= NEUTRAL_CONTAMINATION_MAX_FRAC) {
    return {
      pass: false,
      reason: "Your hand hadn't fully relaxed away from your face during the neutral pause — give it a moment longer and try again.",
    }
  }
  return { pass: true }
}

/** Runs both checks for a completed habit+neutral rep pair. */
export function runQualityGates(habit, habitVectors, neutralVectors) {
  const habitCheck = evaluateHabitBurst(habit, habitVectors)
  if (!habitCheck.pass) return habitCheck
  return evaluateNeutralBurst(habit, neutralVectors)
}
