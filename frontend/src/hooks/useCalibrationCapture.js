import { useCallback, useRef, useState } from 'react'
import { loadDetectors, detectFrame } from '../lib/mediapipeSetup'
import { createFeatureExtractor } from '../lib/featureExtraction'

const SAMPLE_INTERVAL_MS = 140 // ~7 samples/sec while recording a burst

export function useCalibrationCapture() {
  const videoRef = useRef(null)
  const detectorsRef = useRef(null)
  const extractorRef = useRef(createFeatureExtractor())
  const rafRef = useRef(null)
  const recordingRef = useRef(false)
  const collectedRef = useRef([])
  const lastSampleRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(null)
  const [error, setError] = useState(null)
  const [lastFace, setLastFace] = useState(null)
  const [lastHands, setLastHands] = useState(null)

  const start = useCallback(async () => {
    setError(null)
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
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const stream = videoRef.current?.srcObject
    if (stream) stream.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setReady(false)
  }, [])

  const loop = useCallback(() => {
    const tick = () => {
      const video = videoRef.current
      const { faceLandmarker, handLandmarker } = detectorsRef.current || {}
      if (video && faceLandmarker && handLandmarker && video.readyState >= 2) {
        const now = performance.now()
        const { face, hands } = detectFrame(faceLandmarker, handLandmarker, video, now)
        setLastFace(face)
        setLastHands(hands)
        const vec = extractorRef.current.extract(face, hands, now / 1000)

        if (recordingRef.current && now - lastSampleRef.current > SAMPLE_INTERVAL_MS) {
          lastSampleRef.current = now
          collectedRef.current.push(vec)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
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
    lastFace,
    lastHands,
  }
}
