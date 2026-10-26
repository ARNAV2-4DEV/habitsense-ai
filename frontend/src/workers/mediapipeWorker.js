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
// This is a module worker (see lib/detectionWorkerClient.js) so static
// `import` works consistently in both Vite dev (which always serves workers
// as native ES modules, regardless of how they're constructed) and a
// production build (which would otherwise fail to bundle a dynamic
// `import()` here into IIFE/classic output: "UMD and IIFE output formats
// are not supported for code-splitting builds").
//
// The catch: MediaPipe Tasks Vision loads its WASM glue via
// `importScripts()`, which module workers don't support (throws "Module
// scripts don't support importScripts()"); its own fallback there
// (dynamically `import()`-ing the glue script as an ES module) doesn't
// work either, because that script sets its factory with a top-level
// `var`, which only becomes a real global (`self.ModuleFactory`) under
// classic-script evaluation -- inside an ES module it's just module-scoped,
// so the import "succeeds" yet the library still throws "ModuleFactory not
// set." Fixed below by polyfilling `importScripts` itself with something
// that behaves like the real (synchronous, global-scope-executing) one,
// rather than fighting the worker's type.
//
// One worker instance owns exactly ONE landmarker (see the `role` on the
// init message). The client spawns one per model so face and hand inference
// run concurrently on separate threads instead of back to back on a single
// one -- sequential execution was costing the sum of both models' time
// (~70ms measured), which exceeded the 33ms camera frame budget and forced
// the detection loop down to every other frame.
import {
  loadFaceLandmarker,
  loadHandLandmarker,
  detectFace,
  detectHands,
  loadPoseLandmarker,
  detectPose,
} from '../lib/mediapipeSetup'

// Synchronous XHR + indirect eval: indirect eval (the `(0, eval)(...)` form,
// as opposed to calling `eval` directly) always executes as global code
// against the real global object, exactly like a classic <script> or a real
// importScripts() call would -- so `var ModuleFactory = ...` inside the
// fetched script lands on `self.ModuleFactory`, same as MediaPipe expects.
self.importScripts = function (...urls) {
  for (const url of urls) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.send(null)
    if (xhr.status !== 200 && xhr.status !== 0) {
      throw new Error(`importScripts polyfill: ${url} failed with status ${xhr.status}`)
    }
    ;(0, eval)(xhr.responseText)
  }
}

let role = null
let landmarker = null

const LOADERS = {
  face: loadFaceLandmarker,
  hand: loadHandLandmarker,
  pose: loadPoseLandmarker,
}

self.onmessage = async (event) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      role = msg.role
      const { instance, delegate, timings } = await LOADERS[role]({
        onProgress: (message) => self.postMessage({ type: 'progress', message }),
        sample: msg.sample, // a real camera frame to race GPU vs CPU on, or null
        delegate: msg.delegate, // a cached winner, which skips the race
      })
      msg.sample?.close()
      landmarker = instance
      self.postMessage({ type: 'ready', role, delegate, timings })
    } else if (msg.type === 'detect') {
      const { requestId, bitmap, timestampMs } = msg
      let payload
      if (role === 'face') payload = { face: detectFace(landmarker, bitmap, timestampMs) }
      else if (role === 'hand') payload = { hands: detectHands(landmarker, bitmap, timestampMs) }
      else payload = { pose: detectPose(landmarker, bitmap, timestampMs).pose }
      bitmap.close()
      self.postMessage({ type: 'result', requestId, role, ...payload })
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
