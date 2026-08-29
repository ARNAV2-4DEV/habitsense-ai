/**
 * Runs the actual MediaPipe FaceLandmarker/HandLandmarker/PoseLandmarker
 * inference off the main thread. Same functions from lib/mediapipeSetup.js
 * as before (GPU-with-CPU-fallback delegate, etc.) -- the only thing that
 * changes here is WHERE they run: the main thread now just captures a video
 * frame into a transferable ImageBitmap and hands it off, so the expensive
 * synchronous WASM/GPU work that used to block rendering, canvas drawing,
 * and the AuraOrb loop every single frame happens on this thread instead.
 * ImageBitmap is a valid MediaPipe Tasks Vision image source, same as an
 * HTMLVideoElement, so detectFrame/detectPose need no changes.
 */
// Deliberately built as a CLASSIC worker at runtime (see how it's
// constructed in lib/detectionWorkerClient.js, without `{ type: 'module' }`)
// -- MediaPipe Tasks Vision loads its WASM glue via `importScripts()`, which
// throws "Module scripts don't support importScripts()" in a module worker;
// its fallback there (dynamically `import()`-ing the glue script as an ES
// module) doesn't work either, because that script assigns its factory with
// a top-level `var`, which in a real classic script becomes a global
// (`self.ModuleFactory`) but inside an ES module is just module-scoped -- so
// the import "succeeds" yet `self.ModuleFactory` is never actually set, and
// the library throws "ModuleFactory not set." A classic worker lets
// `importScripts()` work as the library expects.
//
// The static import below is fine even though the *output* worker is
// classic: Vite/Rollup bundle this file (and everything it pulls in,
// including @mediapipe/tasks-vision) into one self-contained script with no
// module syntax, rather than trying to split it into multiple chunks -- a
// dynamic `import()` here instead would force Rollup to code-split, which
// IIFE/classic output can't do ("UMD and IIFE output formats are not
// supported for code-splitting builds"), and broke the production build.
import { loadDetectors, detectFrame, loadPoseLandmarker, detectPose } from '../lib/mediapipeSetup'

let detectors = null
let poseLandmarker = null

self.onmessage = async (event) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      detectors = await loadDetectors({
        onProgress: (message) => self.postMessage({ type: 'progress', message }),
      })
      self.postMessage({ type: 'ready' })
    } else if (msg.type === 'initPose') {
      poseLandmarker = await loadPoseLandmarker({
        onProgress: (message) => self.postMessage({ type: 'progress', message }),
      })
      self.postMessage({ type: 'poseReady' })
    } else if (msg.type === 'detect') {
      const { requestId, bitmap, timestampMs, wantPose } = msg
      const { face, hands } = detectFrame(detectors.faceLandmarker, detectors.handLandmarker, bitmap, timestampMs)
      const pose = wantPose && poseLandmarker ? detectPose(poseLandmarker, bitmap, timestampMs).pose : null
      bitmap.close()
      self.postMessage({ type: 'result', requestId, face, hands, pose })
    }
  } catch (err) {
    const message = err?.message || String(err)
    if (msg.type === 'detect') {
      self.postMessage({ type: 'error', requestId: msg.requestId, message })
    } else {
      self.postMessage({ type: 'initError', phase: msg.type, message })
    }
  }
}
