/**
 * requestAnimationFrame fires at the display's refresh rate (commonly
 * 60/sec) regardless of how often the camera actually delivers a new frame
 * (commonly ~30/sec). Driving MediaPipe inference off plain rAF means, on a
 * 60Hz display, roughly half of every FaceLandmarker/HandLandmarker call
 * re-processes a video frame that hasn't changed since the previous call --
 * the single most expensive step in the whole pipeline, run for nothing.
 *
 * HTMLVideoElement.requestVideoFrameCallback fires exactly once per actual
 * decoded frame, so scheduling the detection tick through it (instead of
 * rAF) makes inference cadence track the camera's real frame rate for free.
 * Supported in Chrome/Edge since 2020 and Safari since 15.4; this module
 * falls back to plain rAF where it's unavailable (older Firefox), which is
 * exactly today's behavior -- never worse, often significantly better.
 */

export function supportsVideoFrameCallback(video) {
  return !!video && typeof video.requestVideoFrameCallback === 'function'
}

/**
 * Schedules `tick` to run on the next real video frame if the browser
 * supports it, otherwise the next animation frame. Returns an opaque handle
 * object -- pass it to cancelVideoFrameLoop to cancel, don't inspect it.
 */
export function scheduleVideoFrameLoop(video, tick) {
  if (supportsVideoFrameCallback(video)) {
    const id = video.requestVideoFrameCallback((now) => tick(now))
    return { kind: 'rvfc', video, id }
  }
  const id = requestAnimationFrame((now) => tick(now))
  return { kind: 'raf', id }
}

export function cancelVideoFrameLoop(handle) {
  if (!handle) return
  if (handle.kind === 'rvfc') {
    try {
      handle.video.cancelVideoFrameCallback(handle.id)
    } catch {
      /* video element already gone (stream stopped/unmounted) -- nothing to clean up */
    }
  } else {
    cancelAnimationFrame(handle.id)
  }
}
