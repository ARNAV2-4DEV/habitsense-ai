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
} from '@mediapipe/tasks-vision'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let visionFileset = null

export async function loadDetectors({ onProgress } = {}) {
  onProgress?.('Loading vision runtime…')
  visionFileset = visionFileset || (await FilesetResolver.forVisionTasks(WASM_BASE))

  onProgress?.('Loading face landmark model…')
  const faceLandmarker = await FaceLandmarker.createFromOptions(visionFileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })

  onProgress?.('Loading hand landmark model…')
  const handLandmarker = await HandLandmarker.createFromOptions(visionFileset, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  })

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
