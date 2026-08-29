import { useCallback, useRef, useState } from 'react'
import { loadDetectors, detectFrame } from '../lib/mediapipeSetup'
import { createFeatureExtractor } from '../lib/featureExtraction'
import { requestConsent } from '../lib/consent'
import { scheduleVideoFrameLoop, cancelVideoFrameLoop } from '../lib/videoFrameLoop'

const SAMPLE_INTERVAL_MS = 140 // ~7 samples/sec while recording a burst

export function useCalibrationCapture() {
  const videoRef = useRef(null)
  const detectorsRef = useRef(null)
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
      if (!detectorsRef.current) {
        detectorsRef.current = await loadDetectors({ onProgress: setLoadingMsg })
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
    // the display refresh rate exceeds the camera's actual frame rate.
    const tick = () => {
      const video = videoRef.current
      const { faceLandmarker, handLandmarker } = detectorsRef.current || {}
      if (video && faceLandmarker && handLandmarker && video.readyState >= 2) {
        const now = performance.now()
        const { face, hands } = detectFrame(faceLandmarker, handLandmarker, video, now)
        lastFaceRef.current = face
        lastHandsRef.current = hands
        const vec = extractorRef.current.extract(face, hands, now / 1000)

        if (recordingRef.current && now - lastSampleRef.current > SAMPLE_INTERVAL_MS) {
          lastSampleRef.current = now
          collectedRef.current.push(vec)
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
