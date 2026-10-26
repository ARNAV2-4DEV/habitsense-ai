/**
 * Loads Google's real, pretrained MediaPipe FaceLandmarker (478-point face
 * mesh + blendshapes) and HandLandmarker (21-point hand skeleton, up to 2
 * hands) models and runs them on live video frames, entirely in the
 * browser via WebAssembly/WebGL.
 *
 * Nothing here is a mock or a stand-in — these are the same production
 * models Google ships in MediaPipe Solutions. Model weight files (.task)
 * are fetched from Google's storage CDN on first run and cached by the
 * browser afterward; video frames themselves are processed locally and
 * never uploaded anywhere.
 */
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// "Lite" variant deliberately: posture (Phase 4) is an opt-in, off-by-default
// feature layered on top of the core face/hand pipeline, so it shouldn't add
// a heavy model load for the majority of people who leave it off.
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let visionFileset = null

// tasks-vision doesn't expose a "which delegate actually got used" getter on
// the created landmarker, so the only way to confirm GPU vs. silent CPU
// fallback is to watch whether creation with delegate:'GPU' throws. It does
// throw (rather than silently downgrading) when GPU init genuinely fails,
// so this also doubles as a real safety net -- without it, a GPU init
// failure would previously take down the whole app instead of degrading.
async function createWithDelegateFallback(create, label, preferred = 'GPU') {
  try {
    const instance = await create(preferred)
    return { instance, delegate: preferred }
  } catch (err) {
    if (preferred === 'CPU') throw err
    console.warn(`[mediapipe] ${label}: GPU delegate failed, falling back to CPU`, err)
    return { instance: await create('CPU'), delegate: 'CPU' }
  }
}

/** Median single-frame inference time on `sample`, after a short warm-up.
 * Timestamps start at 1 so the real loop's (performance.now()-based)
 * timestamps are always later, as VIDEO mode requires. */
function medianInferenceMs(instance, sample) {
  let ts = 1
  for (let i = 0; i < 3; i++) instance.detectForVideo(sample, ts++)
  const times = []
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    instance.detectForVideo(sample, ts++)
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[3]
}

/**
 * GPU is not always the fast path. Measured on a laptop with Intel UHD
 * integrated graphics and a 32-core CPU: face 55ms GPU vs 44ms CPU, hands
 * 91ms vs 72ms -- and with both models sharing one weak GPU, a frame took
 * ~139ms (7fps). So when given a real camera frame, build the model on both
 * delegates, time them on that frame, and keep the faster. `delegate` skips
 * the race (the client caches the winner per GPU, see detectionWorkerClient).
 */
async function createFastest(create, label, { sample, delegate } = {}) {
  if (delegate) return createWithDelegateFallback(create, label, delegate)
  const gpu = await createWithDelegateFallback(create, label, 'GPU')
  if (!sample || gpu.delegate !== 'GPU') return gpu
  const cpu = await createWithDelegateFallback(create, label, 'CPU')
  const timings = { GPU: medianInferenceMs(gpu.instance, sample), CPU: medianInferenceMs(cpu.instance, sample) }
  const [keep, drop] = timings.CPU < timings.GPU ? [cpu, gpu] : [gpu, cpu]
  drop.instance.close()
  return { ...keep, timings }
}

async function fileset() {
  visionFileset = visionFileset || (await FilesetResolver.forVisionTasks(WASM_BASE))
  return visionFileset
}

/**
 * Face and hand landmarkers load independently, one per worker, because they
 * are now run CONCURRENTLY on separate threads rather than back to back on
 * one. Measured on this machine, running them sequentially in a single
 * worker cost 37.8ms (face) + 32.1ms (hand) = 70.6ms per frame -- more than
 * two camera frame intervals at 30fps, which is why the detection loop was
 * only managing ~15fps and the overlay trailed the video by ~110ms.
 */
export async function loadFaceLandmarker({ onProgress, sample, delegate } = {}) {
  onProgress?.('Loading vision runtime…')
  const vision = await fileset()
  onProgress?.('Loading face landmark model…')
  return createFastest(
    (d) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: d },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
    'FaceLandmarker',
    { sample, delegate }
  )
}

export async function loadHandLandmarker({ onProgress, sample, delegate } = {}) {
  onProgress?.('Loading vision runtime…')
  const vision = await fileset()
  onProgress?.('Loading hand landmark model…')
  return createFastest(
    (d) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: d },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    'HandLandmarker',
    { sample, delegate }
  )
}

/** Normalized 0..1 {x,y,z} landmarks, the shape the backend's InferRequest expects. */
export function detectFace(faceLandmarker, image, timestampMs) {
  const result = faceLandmarker.detectForVideo(image, timestampMs)
  return result.faceLandmarks && result.faceLandmarks.length > 0
    ? result.faceLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }))
    : null
}

export function detectHands(handLandmarker, image, timestampMs) {
  const result = handLandmarker.detectForVideo(image, timestampMs)
  return (result.landmarks || []).map((hand) =>
    hand.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }))
  )
}

/**
 * Lazily loads MediaPipe's PoseLandmarker (33-point body skeleton) -- only
 * called when a person opts into Phase 4 posture detection, so the model
 * download/init cost is never paid by someone who leaves that feature off.
 */
let poseLandmarkerPromise = null

export async function loadPoseLandmarker({ onProgress, sample, delegate } = {}) {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      onProgress?.('Loading vision runtime…')
      const vision = await fileset()
      onProgress?.('Loading posture model…')
      return createFastest(
        (d) =>
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: d },
            runningMode: 'VIDEO',
            numPoses: 1,
          }),
        'PoseLandmarker',
        { sample, delegate }
      )
    })()
  }
  return poseLandmarkerPromise
}

export function detectPose(poseLandmarker, videoEl, timestampMs) {
  const result = poseLandmarker.detectForVideo(videoEl, timestampMs)
  const pose =
    result.landmarks && result.landmarks.length > 0
      ? result.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z || 0, visibility: p.visibility ?? 1 }))
      : null
  return { pose }
}
