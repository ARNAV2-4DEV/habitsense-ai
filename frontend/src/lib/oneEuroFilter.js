/**
 * One Euro Filter (Casiez, Roussel, Vogel 2012) -- adaptive low-pass
 * smoothing that leans heavily on smoothing when a point is nearly still
 * (killing per-frame landmark jitter) and backs off automatically as speed
 * increases (so a fast hand motion doesn't visibly lag behind the real
 * position). This is display-only: it's applied in CameraStage's draw loop,
 * never to the landmarks fed into featureExtraction/classification, so the
 * habit detector keeps seeing raw, unsmoothed coordinates.
 */
class LowPassFilter {
  constructor() {
    this.hasValue = false
    this.value = 0
  }
  filter(value, alpha) {
    this.value = this.hasValue ? alpha * value + (1 - alpha) * this.value : value
    this.hasValue = true
    return this.value
  }
  reset() {
    this.hasValue = false
  }
}

function smoothingAlpha(cutoffHz, dtSec) {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSec)
}

class OneEuroFilter {
  constructor({ minCutoff = 1.4, beta = 1.2, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.xFilter = new LowPassFilter()
    this.dxFilter = new LowPassFilter()
    this.lastTimeSec = null
  }
  filter(value, timestampSec) {
    if (this.lastTimeSec === null) {
      this.lastTimeSec = timestampSec
      this.xFilter.filter(value, 1)
      return value
    }
    const dt = Math.max(timestampSec - this.lastTimeSec, 1 / 240)
    this.lastTimeSec = timestampSec

    const rawSpeed = (value - this.xFilter.value) / dt
    const speed = this.dxFilter.filter(rawSpeed, smoothingAlpha(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(speed)
    return this.xFilter.filter(value, smoothingAlpha(cutoff, dt))
  }
  reset() {
    this.xFilter.reset()
    this.dxFilter.reset()
    this.lastTimeSec = null
  }
}

/**
 * Smooths one {x,y,z} landmark array (a face mesh, a single hand, or a
 * pose) across frames. Point count changing between calls (a track
 * appearing/disappearing) resets every filter so the newly-visible track
 * snaps to its real position instead of interpolating in from stale state.
 */
export function createLandmarkSmoother(options) {
  let perPoint = []

  return function smooth(points, timestampSec) {
    if (!points) {
      perPoint = []
      return null
    }
    if (points.length !== perPoint.length) {
      perPoint = points.map(() => ({
        x: new OneEuroFilter(options),
        y: new OneEuroFilter(options),
        z: new OneEuroFilter(options),
      }))
    }
    return points.map((p, i) => {
      const f = perPoint[i]
      const out = {
        x: f.x.filter(p.x, timestampSec),
        y: f.y.filter(p.y, timestampSec),
        z: f.z.filter(p.z || 0, timestampSec),
      }
      if (p.visibility !== undefined) out.visibility = p.visibility
      return out
    })
  }
}

/** Same idea as createLandmarkSmoother, but for the hands array (0-2 hands, slot-indexed). */
export function createHandsSmoother(options) {
  let slots = []

  return function smooth(hands, timestampSec) {
    if (!hands || hands.length === 0) {
      slots = []
      return hands || []
    }
    if (hands.length !== slots.length) {
      slots = hands.map(() => createLandmarkSmoother(options))
    }
    return hands.map((hand, i) => slots[i](hand, timestampSec))
  }
}
