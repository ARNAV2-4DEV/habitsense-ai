/**
 * Main-thread handle for workers/mediapipeWorker.js. Talks to it purely via
 * postMessage/requestId round trips so useDetectionEngine.js and
 * useCalibrationCapture.js can `await client.detect(bitmap, ts)` as if it
 * were the old synchronous detectFrame() call, without knowing anything
 * about worker plumbing.
 */
let nextRequestId = 1

export function createDetectionWorkerClient() {
  const worker = new Worker(new URL('../workers/mediapipeWorker.js', import.meta.url), { type: 'module' })

  const pendingDetect = new Map() // requestId -> {resolve, reject}
  let readyWaiters = [] // {resolve, reject}
  let poseReadyWaiters = []
  let ready = false
  let poseReady = false
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
      case 'poseReady':
        poseReady = true
        poseReadyWaiters.forEach((w) => w.resolve())
        poseReadyWaiters = []
        break
      case 'result': {
        const p = pendingDetect.get(msg.requestId)
        if (p) {
          pendingDetect.delete(msg.requestId)
          p.resolve({ face: msg.face, hands: msg.hands, pose: msg.pose })
        }
        break
      }
      case 'error': {
        const p = pendingDetect.get(msg.requestId)
        if (p) {
          pendingDetect.delete(msg.requestId)
          p.reject(new Error(msg.message))
        }
        break
      }
      case 'initError': {
        const err = new Error(msg.message)
        const waiters = msg.phase === 'init' ? readyWaiters : poseReadyWaiters
        waiters.forEach((w) => w.reject(err))
        if (msg.phase === 'init') readyWaiters = []
        else poseReadyWaiters = []
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
    for (const p of pendingDetect.values()) p.reject(wrapped)
    pendingDetect.clear()
    readyWaiters.forEach((w) => w.reject(wrapped))
    readyWaiters = []
    poseReadyWaiters.forEach((w) => w.reject(wrapped))
    poseReadyWaiters = []
  })

  return {
    get ready() {
      return ready
    },
    get poseReady() {
      return poseReady
    },
    init({ onProgress: cb } = {}) {
      onProgress = cb || onProgress
      if (ready) return Promise.resolve()
      worker.postMessage({ type: 'init' })
      return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }))
    },
    initPose({ onProgress: cb } = {}) {
      onProgress = cb || onProgress
      if (poseReady) return Promise.resolve()
      worker.postMessage({ type: 'initPose' })
      return new Promise((resolve, reject) => poseReadyWaiters.push({ resolve, reject }))
    },
    /** bitmap ownership transfers to the worker -- don't touch it after calling this. */
    detect(bitmap, timestampMs, wantPose) {
      const requestId = nextRequestId++
      return new Promise((resolve, reject) => {
        pendingDetect.set(requestId, { resolve, reject })
        worker.postMessage({ type: 'detect', requestId, bitmap, timestampMs, wantPose }, [bitmap])
      })
    },
    terminate() {
      worker.terminate()
      pendingDetect.clear()
      readyWaiters = []
      poseReadyWaiters = []
    },
  }
}
