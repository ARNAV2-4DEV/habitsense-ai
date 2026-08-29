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
async function createWithDelegateFallback(create, label) {
  try {
    const instance = await create('GPU')
    console.info(`[mediapipe] ${label}: GPU delegate active`)
    return instance
  } catch (err) {
    console.warn(`[mediapipe] ${label}: GPU delegate failed, falling back to CPU`, err)
    const instance = await create('CPU')
    console.info(`[mediapipe] ${label}: CPU delegate active`)
    return instance
  }
}

export async function loadDetectors({ onProgress } = {}) {
  onProgress?.('Loading vision runtime…')
  visionFileset = visionFileset || (await FilesetResolver.forVisionTasks(WASM_BASE))

  onProgress?.('Loading face landmark model…')
  const faceLandmarker = await createWithDelegateFallback(
    (delegate) =>
      FaceLandmarker.createFromOptions(visionFileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
    'FaceLandmarker'
  )

  onProgress?.('Loading hand landmark model…')
  const handLandmarker = await createWithDelegateFallback(
    (delegate) =>
      HandLandmarker.createFromOptions(visionFileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    'HandLandmarker'
  )

  onProgress?.('Ready')
  return { faceLandmarker, handLandmarker }
}

/**
 * Runs both landmarkers on a single video frame and returns plain-object
 * landmarks ({x,y,z} in normalized 0..1 image coordinates) matching exactly
 * the shape the backend's InferRequest schema expects.
 */
export function detectFrame(faceLandmarker, handLandmarker, videoEl, timestampMs) {
  const faceResult = faceLandmarker.detectForVideo(videoEl, timestampMs)
  const handResult = handLandmarker.detectForVideo(videoEl, timestampMs)

  const face =
    faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0
      ? faceResult.faceLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }))
      : null

  const hands = (handResult.landmarks || []).map((hand) =>
    hand.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }))
  )

  return { face, hands, handedness: handResult.handedness || [] }
}

/**
 * Lazily loads MediaPipe's PoseLandmarker (33-point body skeleton) -- only
 * called when a person opts into Phase 4 posture detection, so the model
 * download/init cost is never paid by someone who leaves that feature off.
 */
let poseLandmarkerPromise = null

export async function loadPoseLandmarker({ onProgress } = {}) {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      onProgress?.('Loading vision runtime…')
      visionFileset = visionFileset || (await FilesetResolver.forVisionTasks(WASM_BASE))
      onProgress?.('Loading posture model…')
      return createWithDelegateFallback(
        (delegate) =>
          PoseLandmarker.createFromOptions(visionFileset, {
            baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          }),
        'PoseLandmarker'
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
