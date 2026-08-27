import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDetectors, detectFrame } from '../lib/mediapipeSetup'
import { createFeatureExtractor, heuristicGuess, FEATURE_NAMES } from '../lib/featureExtraction'
import { api } from '../lib/api'
import { useStore } from '../state/store'

const BACKEND_POLL_MS = 200 // ~5 calls/sec to the local classifier — plenty for dwell-smoothed detection

export function useDetectionEngine() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const detectorsRef = useRef(null)
  const extractorRef = useRef(createFeatureExtractor())
  const lastBackendCallRef = useRef(0)
  const openEventsRef = useRef({}) // habit -> { startedAt, maxConfidence }
  const activeStreakRef = useRef({}) // habit -> seconds sustained above threshold this "bout"
  const lastFrameTimeRef = useRef(performance.now())

  const [loadingMsg, setLoadingMsg] = useState(null)
  const [error, setError] = useState(null)
  const [lastFace, setLastFace] = useState(null)
  const [lastHands, setLastHands] = useState(null)
  const [latestProbabilities, setLatestProbabilities] = useState(null)

  const {
    profileId,
    sessionId,
    setSessionId,
    isDetecting,
    setDetecting,
    setCurrentDetection,
    addSessionEvent,
    enabledHabits,
    thresholds,
    minDwellSeconds,
    setModelInfo,
    setBackendOnline,
  } = useStore.getState()

  const store = useStore()

  const checkBackend = useCallback(async () => {
    try {
      await api.health()
      useStore.getState().setBackendOnline(true)
      return true
    } catch {
      useStore.getState().setBackendOnline(false)
      return false
    }
  }, [])

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

      await checkBackend()

      const habitsOn = Object.entries(useStore.getState().enabledHabits)
        .filter(([, v]) => v)
        .map(([k]) => k)
      const { session_id } = await api
        .startSession(useStore.getState().profileId, habitsOn)
        .catch(() => ({ session_id: null }))
      useStore.getState().setSessionId(session_id)

      api.modelStatus(useStore.getState().profileId).then(useStore.getState().setModelInfo).catch(() => {})

      extractorRef.current.reset()
      openEventsRef.current = {}
      activeStreakRef.current = {}
      lastFrameTimeRef.current = performance.now()

      setLoadingMsg(null)
      useStore.getState().setDetecting(true)
      loop()
    } catch (err) {
      console.error(err)
      setError(err.message || String(err))
      setLoadingMsg(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkBackend])

  const closeOpenEvent = useCallback(async (habit, endedAt) => {
    const open = openEventsRef.current[habit]
    if (!open) return
    delete openEventsRef.current[habit]
    const sid = useStore.getState().sessionId
    if (sid) {
      try {
        await api.createEvent({
          session_id: sid,
          habit,
          confidence: open.maxConfidence,
          started_at: open.startedAt,
          ended_at: endedAt,
        })
      } catch {
        /* offline is fine — the in-session log below still works */
      }
    }
    useStore.getState().addSessionEvent({
      id: `${habit}-${open.startedAt}`,
      habit,
      confidence: open.maxConfidence,
      startedAt: open.startedAt,
      endedAt,
      durationSec: endedAt - open.startedAt,
    })
  }, [])

  const stop = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    const nowSec = Date.now() / 1000
    for (const habit of Object.keys(openEventsRef.current)) {
      await closeOpenEvent(habit, nowSec)
    }
    const stream = videoRef.current?.srcObject
    if (stream) stream.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null

    const sid = useStore.getState().sessionId
    if (sid) {
      api.endSession(sid).catch(() => {})
      api.resetSessionState(sid).catch(() => {})
    }
    useStore.getState().setSessionId(null)
    useStore.getState().setDetecting(false)
    useStore.getState().setCurrentDetection('none', 0)
  }, [closeOpenEvent])

  const handleClassification = useCallback(
    (result, dtSec) => {
      const s = useStore.getState()
      useStore.getState().setCurrentDetection(result.top_label, result.top_confidence)
      setLatestProbabilities(result.probabilities)

      for (const habit of Object.keys(s.enabledHabits)) {
        if (!s.enabledHabits[habit]) continue
        const prob = result.probabilities?.[habit] ?? 0
        const above = prob >= s.thresholds[habit] && result.top_label === habit
        if (above) {
          activeStreakRef.current[habit] = (activeStreakRef.current[habit] || 0) + dtSec
          if (!openEventsRef.current[habit]) {
            if (activeStreakRef.current[habit] >= s.minDwellSeconds[habit]) {
              openEventsRef.current[habit] = { startedAt: Date.now() / 1000, maxConfidence: prob }
              useStore.getState().setActiveReminder(habit)
            }
          } else {
            openEventsRef.current[habit].maxConfidence = Math.max(
              openEventsRef.current[habit].maxConfidence,
              prob
            )
          }
        } else {
          activeStreakRef.current[habit] = 0
          if (openEventsRef.current[habit]) {
            closeOpenEvent(habit, Date.now() / 1000)
            if (useStore.getState().activeReminder === habit) {
              useStore.getState().clearActiveReminder()
            }
          }
        }
      }
    },
    [closeOpenEvent]
  )

  const loop = useCallback(() => {
    const tick = async () => {
      const video = videoRef.current
      const { faceLandmarker, handLandmarker } = detectorsRef.current || {}
      if (!video || !faceLandmarker || !handLandmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const now = performance.now()
      const dtSec = Math.max(0, (now - lastFrameTimeRef.current) / 1000)
      lastFrameTimeRef.current = now

      const { face, hands } = detectFrame(faceLandmarker, handLandmarker, video, now)
      setLastFace(face)
      setLastHands(hands)

      const localVec = extractorRef.current.extract(face, hands, now / 1000)

      // Throttle the network round trip to the local backend; use the
      // personalized model when we have it, otherwise fall back instantly
      // to the zero-latency geometric heuristic so the UI never stalls.
      if (now - lastBackendCallRef.current > BACKEND_POLL_MS) {
        lastBackendCallRef.current = now
        const sid = useStore.getState().sessionId
        api
          .infer({
            profile_id: useStore.getState().profileId,
            session_id: sid,
            face: face ? face.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
            hands: hands.map((h) => h.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
            timestamp: now / 1000,
          })
          .then((result) => handleClassification(result, BACKEND_POLL_MS / 1000))
          .catch(() => {
            const guess = heuristicGuess(localVec)
            handleClassification(
              {
                top_label: guess.label,
                top_confidence: guess.confidence,
                probabilities: { [guess.label]: guess.confidence },
              },
              BACKEND_POLL_MS / 1000
            )
          })
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [handleClassification])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return {
    videoRef,
    canvasRef,
    start,
    stop,
    loadingMsg,
    error,
    lastFace,
    lastHands,
    latestProbabilities,
    extractorRef,
    checkBackend,
  }
}

export { FEATURE_NAMES }
