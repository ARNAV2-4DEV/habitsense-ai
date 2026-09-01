/**
 * Main-thread handle for workers/mediapipeWorker.js.
 *
 * One worker per model, deliberately. The face and hand landmarkers used to
 * share a single worker and ran back to back inside it, so a frame cost
 * face + hand (measured 37.8ms + 32.1ms = 70.6ms p50). That is over two
 * camera frame intervals at 30fps, so the detection loop -- which waits for
 * a result before scheduling the next capture -- could only service every
 * second or third frame, and the landmarks being drawn were always a couple
 * of frames stale. Running them on separate threads makes a frame cost
 * max(face, hand) instead of the sum.
 *
 * The loop stays strictly serial per frame (capture -> await all models ->
 * capture next). That is what keeps a slow frame from building a backlog of
 * queued bitmaps whose results would be drawn against ever-newer video.
 */

function spawnWorker(role) {
  // Options must stay a static object literal -- Vite's worker-import-meta-url
  // plugin parses them at build time and errors on anything computed (so no
  // interpolated `name` here). The role is sent in the init message instead.
  const worker = new Worker(new URL('../workers/mediapipeWorker.js', import.meta.url), {
    type: 'module',
  })

  const pending = new Map() // requestId -> {resolve, reject}
  let readyWaiters = []
  let ready = false
  let onProgress = null

  worker.addEventListener('message', (event) => {
    const msg = event.data
    switch (msg.type) {
      case 'progress':
        onProgress?.(msg.message)
        break
      case 'ready':
        ready = true
        readyWaiters.forEach((w) => w.resolve())
        readyWaiters = []
        break
      case 'result': {
        const p = pending.get(msg.requestId)
        if (p) {
          pending.delete(msg.requestId)
          p.resolve(msg)
        }
        break
      }
      case 'error': {
        const p = pending.get(msg.requestId)
        if (p) {
          pending.delete(msg.requestId)
          p.reject(new Error(msg.message))
        }
        break
      }
      case 'initError': {
        const err = new Error(msg.message)
        readyWaiters.forEach((w) => w.reject(err))
        readyWaiters = []
        break
      }
      default:
        break
    }
  })

  worker.addEventListener('error', (err) => {
    // A crash the worker couldn't even report as its own {type:'error'}
    // message (e.g. a thrown error outside the try/catch, or the module
    // failing to load at all) -- fail every in-flight caller instead of
    // leaving their promises hanging forever.
    const wrapped = err instanceof Error ? err : new Error(err?.message || 'MediaPipe worker crashed')
    for (const p of pending.values()) p.reject(wrapped)
    pending.clear()
    readyWaiters.forEach((w) => w.reject(wrapped))
    readyWaiters = []
  })

  return {
    role,
    get ready() {
      return ready
    },
    init({ onProgress: cb } = {}) {
      onProgress = cb || onProgress
      if (ready) return Promise.resolve()
      worker.postMessage({ type: 'init', role })
      return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }))
    },
    /** bitmap ownership transfers to the worker -- don't touch it after calling this. */
    detect(requestId, bitmap, timestampMs) {
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
        worker.postMessage({ type: 'detect', requestId, bitmap, timestampMs }, [bitmap])
      })
    },
    terminate() {
      worker.terminate()
      pending.clear()
      readyWaiters = []
    },
  }
}

let nextRequestId = 1

export function createDetectionWorkerClient() {
  const face = spawnWorker('face')
  const hand = spawnWorker('hand')
  let pose = null // lazily spawned: posture is opt-in and off by default

  return {
    get ready() {
      return face.ready && hand.ready
    },
    get poseReady() {
      return !!pose?.ready
    },
    init({ onProgress } = {}) {
      // Both models download and initialise concurrently too, not just infer.
      return Promise.all([face.init({ onProgress }), hand.init({ onProgress })])
    },
    initPose({ onProgress } = {}) {
      pose = pose || spawnWorker('pose')
      return pose.init({ onProgress })
    },
    /**
     * Captures one frame per active model and runs them all concurrently.
     * Each worker needs its own ImageBitmap because ownership transfers on
     * postMessage; createImageBitmap measured 0.3ms, so the extra copies are
     * noise next to the ~35ms of inference they let us overlap.
     */
    async detect(video, timestampMs, wantPose) {
      const requestId = nextRequestId++
      const usePose = wantPose && pose?.ready
      // Capture at full resolution. Downscaling the bitmap to 320x240 before
      // handing it over was measured and made no difference (inference p50
      // 47.4ms vs 45.5ms at full size) -- the cost is model compute, not the
      // texture upload -- so there's no reason to give up landmark precision
      // on small or distant hands for it.
      const [faceBmp, handBmp, poseBmp] = await Promise.all([
        createImageBitmap(video),
        createImageBitmap(video),
        usePose ? createImageBitmap(video) : Promise.resolve(null),
      ])
      const [faceMsg, handMsg, poseMsg] = await Promise.all([
        face.detect(requestId, faceBmp, timestampMs),
        hand.detect(requestId, handBmp, timestampMs),
        usePose ? pose.detect(requestId, poseBmp, timestampMs) : Promise.resolve(null),
      ])
      return {
        face: faceMsg.face,
        hands: handMsg.hands,
        pose: poseMsg ? poseMsg.pose : null,
      }
    },
    terminate() {
      face.terminate()
      hand.terminate()
      pose?.terminate()
    },
  }
}
