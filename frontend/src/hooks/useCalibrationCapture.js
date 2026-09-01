import { useCallback, useRef, useState } from 'react'
import { createDetectionWorkerClient } from '../lib/detectionWorkerClient'
import { createFeatureExtractor } from '../lib/featureExtraction'
import { requestConsent } from '../lib/consent'
import { scheduleVideoFrameLoop, cancelVideoFrameLoop } from '../lib/videoFrameLoop'

const SAMPLE_INTERVAL_MS = 140 // ~7 samples/sec while recording a burst

export function useCalibrationCapture() {
  const videoRef = useRef(null)
  // See useDetectionEngine.js -- inference runs on a worker thread instead
  // of blocking this thread every frame. Persisted across stop()/start() so
  // re-recording within the same page visit doesn't reload the models.
  const workerRef = useRef(null)
  const extractorRef = useRef(createFeatureExtractor())
  const rafRef = useRef(null)
  const recordingRef = useRef(false)
  const collectedRef = useRef([])
  const lastSampleRef = useRef(0)
  // Refs, not state -- same reasoning as useDetectionEngine.js: these only
  // feed CameraStage's own imperative canvas draw loop, which reads them
  // via ref, so mutating them here must never trigger a page re-render.
  const lastFaceRef = useRef(null)
  const lastHandsRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [error, setError] = useState(null)

  const start = useCallback(async () => {
    setError(null)
    const consented = await requestConsent('camera')
    if (!consented) return
    try {
      setLoadingMsg('Requesting camera…')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      if (!workerRef.current) {
        workerRef.current = createDetectionWorkerClient()
      }
      if (!workerRef.current.ready) {
        await workerRef.current.init({ onProgress: setLoadingMsg })
      }
      setLoadingMsg(null)
      setReady(true)
      loop()
    } catch (err) {
      setError(err.message || String(err))
      setLoadingMsg(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = useCallback(() => {
    cancelVideoFrameLoop(rafRef.current)
    rafRef.current = null
    const stream = videoRef.current?.srcObject
    if (stream) stream.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setReady(false)
  }, [])

  const loop = useCallback(() => {
    // Frame-synced via requestVideoFrameCallback where available (see
    // lib/videoFrameLoop.js) -- same fix as useDetectionEngine.js: without
    // it, MediaPipe inference re-runs on identical video frames whenever
    // the display refresh rate exceeds the camera's actual frame rate. And
    // like useDetectionEngine.js, the actual inference runs on a worker
    // thread (see lib/detectionWorkerClient.js) so it never blocks this
    // thread's rendering while a calibration burst is being recorded.
    const tick = async () => {
      const video = videoRef.current
      const worker = workerRef.current
      if (video && worker?.ready && video.readyState >= 2) {
        const now = performance.now()
        try {
          const { face, hands } = await worker.detect(video, now, false)
          lastFaceRef.current = face
          lastHandsRef.current = hands
          const vec = extractorRef.current.extract(face, hands, now / 1000)

          if (recordingRef.current && now - lastSampleRef.current > SAMPLE_INTERVAL_MS) {
            lastSampleRef.current = now
            collectedRef.current.push(vec)
          }
        } catch {
          // Skip this frame (see useDetectionEngine.js's identical guard).
        }
      }
      rafRef.current = scheduleVideoFrameLoop(video, tick)
    }
    rafRef.current = scheduleVideoFrameLoop(videoRef.current, tick)
  }, [])

  /** Records for durationMs, resolving with the collected feature vectors. */
  const recordBurst = useCallback((durationMs) => {
    return new Promise((resolve) => {
      collectedRef.current = []
      recordingRef.current = true
      setTimeout(() => {
        recordingRef.current = false
        resolve([...collectedRef.current])
      }, durationMs)
    })
  }, [])

  return {
    videoRef,
    start,
    stop,
    recordBurst,
    ready,
    loadingMsg,
    error,
    lastFaceRef,
    lastHandsRef,
  }
}
