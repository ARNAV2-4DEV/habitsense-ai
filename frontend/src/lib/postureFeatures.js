/**
 * Phase 4: posture-slouching, from MediaPipe PoseLandmarker's 33-point body
 * skeleton (https://developers.google.com/mediapipe/solutions/vision/pose_landmarker).
 *
 * HONEST SCOPE NOTE (see the expansion plan, Phase 4): this is deliberately
 * NOT run through the RandomForest classifier the other habits use. There is
 * no labeled posture dataset any more than there's a labeled BFRB one, but
 * unlike BFRB geometry (nail-biting's finger-at-mouth shape is essentially
 * pose-invariant), "good posture" has no universal absolute geometry -- it
 * depends entirely on a person's own camera distance, angle, and body
 * proportions. A single fixed threshold would be meaningless across setups.
 * What IS measurable and honest: how much someone's neck-to-shoulder
 * geometry has collapsed relative to THEIR OWN posture a few seconds ago.
 * So this is a session-relative heuristic (a baseline captured at the start
 * of detection, compared against a live ratio), not a trained model and not
 * an absolute rule -- documented as exactly that in the UI, the same way
 * the extrapolated scalp points are flagged as a heuristic proxy rather than
 * a real tracked landmark.
 */

const NOSE = 0
const LEFT_EAR = 7
const RIGHT_EAR = 8
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12

const MIN_VISIBILITY = 0.5
const BASELINE_WINDOW_SEC = 3
// How much the neck-length ratio must drop below baseline (as a fraction)
// before it counts as "slouching," scaled by the sensitivity slider (0..1).
// Higher sensitivity -> a smaller drop is enough -> fires sooner.
function requiredDropFraction(sensitivity) {
  return 0.06 + (1 - sensitivity) * 0.14
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
function visible(p) {
  return !!p && (p.visibility === undefined || p.visibility >= MIN_VISIBILITY)
}

/**
 * Pulls the small set of points this module actually reads out of the full
 * 33-point pose, plus the two ratios computed from them. Returns null if the
 * shoulders/ears aren't reliably tracked this frame (e.g. out of frame,
 * turned away from the camera).
 */
export function computePostureMetrics(pose) {
  if (!pose) return null
  const ls = pose[LEFT_SHOULDER], rs = pose[RIGHT_SHOULDER]
  const le = pose[LEFT_EAR], re = pose[RIGHT_EAR]
  if (!visible(ls) || !visible(rs) || !visible(le) || !visible(re)) return null

  const shoulderWidth = Math.max(dist(ls, rs), 1e-6)
  const shoulderMid = midpoint(ls, rs)
  const earMid = midpoint(le, re)
  const neckLength = dist(earMid, shoulderMid)
  const neckRatio = neckLength / shoulderWidth
  const shoulderTilt = Math.abs(ls.y - rs.y) / shoulderWidth

  return { neckRatio, shoulderTilt, shoulderMid, earMid, points: { ls, rs, le, re, nose: pose[NOSE] } }
}

/**
 * Stateful monitor: captures a short baseline the first few seconds it sees
 * a reliable pose, then on every later frame reports how far the current
 * posture has drifted from it. Call .update(pose, nowSec) every frame;
 * .reset() when a session starts fresh.
 */
export function createPostureMonitor() {
  let baselineSamples = []
  let baselineStartedAt = null
  let baseline = null // { neckRatio, shoulderTilt }

  function reset() {
    baselineSamples = []
    baselineStartedAt = null
    baseline = null
  }

  function update(pose, nowSec, sensitivity) {
    const metrics = computePostureMetrics(pose)
    if (!metrics) {
      return { hasBaseline: !!baseline, isSlouching: false, metrics: null }
    }

    if (!baseline) {
      if (baselineStartedAt === null) baselineStartedAt = nowSec
      baselineSamples.push(metrics)
      if (nowSec - baselineStartedAt >= BASELINE_WINDOW_SEC) {
        baseline = {
          neckRatio: median(baselineSamples.map((s) => s.neckRatio)),
          shoulderTilt: median(baselineSamples.map((s) => s.shoulderTilt)),
        }
      }
      return { hasBaseline: !!baseline, isSlouching: false, metrics, baseline }
    }

    const required = requiredDropFraction(sensitivity ?? 0.5)
    const neckDropFrac = (baseline.neckRatio - metrics.neckRatio) / baseline.neckRatio
    const tiltIncreaseFrac = (metrics.shoulderTilt - baseline.shoulderTilt) / Math.max(baseline.neckRatio, 1e-6)
    const isSlouching = neckDropFrac > required || tiltIncreaseFrac > required * 1.5

    return { hasBaseline: true, isSlouching, metrics, baseline, neckDropFrac }
  }

  return { update, reset }
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
