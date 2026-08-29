import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDetectors, detectFrame, loadPoseLandmarker, detectPose } from '../lib/mediapipeSetup'
import { createFeatureExtractor, heuristicGuess, FEATURE_NAMES } from '../lib/featureExtraction'
import { createPostureMonitor } from '../lib/postureFeatures'
import { createAudioMonitor } from '../lib/audioDetection'
import { api } from '../lib/api'
import { useStore } from '../state/store'
import { requestConsent } from '../lib/consent'

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
  const fpsEmaRef = useRef(0)
  const lastFpsUpdateRef = useRef(0)

  // Raw per-frame landmarks -- mutated up to 60x/sec by the loop below.
  // Deliberately refs, not state: they only feed CameraStage's own
  // imperative canvas draw loop (which reads them via ref, see
  // components/detection/CameraStage.jsx), never anything React-rendered.
  // Making these state forced a full page re-render (including the AuraOrb
  // r3f canvas) on every single video frame instead of only when something
  // UI-visible actually changes -- that was the dominant cause of the
  // reported ~7fps ceiling on Live/Calibrate.
  const lastFaceRef = useRef(null)
  const lastHandsRef = useRef(null)
  const lastPoseRef = useRef(null)
  const postureStatusRef = useRef(null) // last {hasBaseline, isSlouching} pushed to state, to dedupe setState calls

  // Phase 4 (posture) and Phase 5 (audio) -- both rule-based, both entirely
  // client-side, both driven through the exact same dwell/event machinery
  // above via updateStreak() rather than a parallel system.
  const poseLandmarkerRef = useRef(null)
  const postureMonitorRef = useRef(createPostureMonitor())
  const audioMonitorRef = useRef(createAudioMonitor())

  const [loadingMsg, setLoadingMsg] = useState(null)
  const [error, setError] = useState(null)
  const [postureStatus, setPostureStatus] = useState(null) // { hasBaseline, isSlouching }
  const [audioBars, setAudioBars] = useState(null) // live spectrum, for the waveform visualizer only
  const [latestProbabilities, setLatestProbabilities] = useState(null)
  const [fps, setFps] = useState(0)

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

      if (useStore.getState().posture.enabled && !poseLandmarkerRef.current) {
        poseLandmarkerRef.current = await loadPoseLandmarker({ onProgress: setLoadingMsg })
      }
      postureMonitorRef.current.reset()
      setPostureStatus(null)

      if (useStore.getState().audio.enabled) {
        const micConsented = await requestConsent('mic')
        if (micConsented) {
          try {
            await audioMonitorRef.current.start()
          } catch (audioErr) {
            console.error('Microphone unavailable, continuing without audio detection:', audioErr)
          }
        }
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
    let serverId = null
    if (sid) {
      try {
        const created = await api.createEvent({
          session_id: sid,
          habit,
          confidence: open.maxConfidence,
          started_at: open.startedAt,
          ended_at: endedAt,
        })
        serverId = created.id
      } catch {
        /* offline is fine — the in-session log below still works, just without a
           server id, so trigger notes can't be attached until back online */
      }
    }
    useStore.getState().addSessionEvent({
      id: `${habit}-${open.startedAt}`,
      serverId,
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
    if (audioMonitorRef.current.isRunning) audioMonitorRef.current.stop()
    lastFaceRef.current = null
    lastHandsRef.current = null
    lastPoseRef.current = null
    postureStatusRef.current = null
    setPostureStatus(null)
    fpsEmaRef.current = 0
    setFps(0)

    const sid = useStore.getState().sessionId
    if (sid) {
      api.endSession(sid).catch(() => {})
      api.resetSessionState(sid).catch(() => {})
    }
    useStore.getState().setSessionId(null)
    useStore.getState().setDetecting(false)
    useStore.getState().setCurrentDetection('none', 0)
  }, [closeOpenEvent])

  // Shared dwell/event machinery: an "active" boolean sustained for at least
  // minDwell seconds opens a logged event and fires the reminder toast; once
  // it drops, the event closes. Used identically by the ML habit loop below,
  // by posture (Phase 4), and by the audio habits (Phase 5) -- only the
  // signal feeding `isActive` differs.
  const updateStreak = useCallback(
    (habit, isActive, dtSec, minDwell, confidence = 1) => {
      if (isActive) {
        activeStreakRef.current[habit] = (activeStreakRef.current[habit] || 0) + dtSec
        if (!openEventsRef.current[habit]) {
          if (activeStreakRef.current[habit] >= minDwell) {
            openEventsRef.current[habit] = { startedAt: Date.now() / 1000, maxConfidence: confidence }
            useStore.getState().setActiveReminder(habit)
          }
        } else {
          openEventsRef.current[habit].maxConfidence = Math.max(
            openEventsRef.current[habit].maxConfidence,
            confidence
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
    },
    [closeOpenEvent]
  )

  const handleClassification = useCallback(
    (result, dtSec) => {
      const s = useStore.getState()
      useStore.getState().setCurrentDetection(result.top_label, result.top_confidence)
      setLatestProbabilities(result.probabilities)

      for (const habit of Object.keys(s.enabledHabits)) {
        if (!s.enabledHabits[habit]) continue
        const prob = result.probabilities?.[habit] ?? 0
        const above = prob >= s.thresholds[habit] && result.top_label === habit
        updateStreak(habit, above, dtSec, s.minDwellSeconds[habit], prob)
      }
    },
    [updateStreak]
  )

  const loop = useCallback(() => {
    // Not async: the backend call below is intentionally fire-and-forget
    // (.then()/.catch(), never awaited) so a slow network response can
    // never delay the next requestAnimationFrame.
    const tick = () => {
      const video = videoRef.current
      const { faceLandmarker, handLandmarker } = detectorsRef.current || {}
      if (!video || !faceLandmarker || !handLandmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const now = performance.now()
      const dtSec = Math.max(0, (now - lastFrameTimeRef.current) / 1000)
      lastFrameTimeRef.current = now

      // Real fps, smoothed (EMA) so it doesn't jitter frame-to-frame, and
      // only pushed to state ~4x/sec -- displaying it doesn't need per-frame
      // precision and setState every rAF tick would just add render churn.
      if (dtSec > 0) {
        const instantFps = 1 / dtSec
        fpsEmaRef.current = fpsEmaRef.current ? fpsEmaRef.current * 0.9 + instantFps * 0.1 : instantFps
        if (now - lastFpsUpdateRef.current > 250) {
          lastFpsUpdateRef.current = now
          setFps(Math.round(fpsEmaRef.current))
        }
      }

      const { face, hands } = detectFrame(faceLandmarker, handLandmarker, video, now)
      lastFaceRef.current = face
      lastHandsRef.current = hands

      const localVec = extractorRef.current.extract(face, hands, now / 1000)

      // Phase 4: posture, entirely local, driven off the same rAF cadence
      // as face/hand tracking rather than the throttled backend poll below
      // -- there's no backend model involved at all (see postureFeatures.js
      // for why this stays a session-relative heuristic, not a classifier).
      const postureCfg = useStore.getState().posture
      if (postureCfg.enabled && poseLandmarkerRef.current) {
        const { pose } = detectPose(poseLandmarkerRef.current, video, now)
        lastPoseRef.current = pose
        const postureResult = postureMonitorRef.current.update(pose, now / 1000, postureCfg.sensitivity)
        // Only push to React state when the visible status actually changed
        // -- update() runs every frame, but hasBaseline/isSlouching flip
        // rarely, and a fresh object literal every tick would otherwise
        // force a re-render every frame same as the face/hands issue above.
        const prev = postureStatusRef.current
        if (!prev || prev.hasBaseline !== postureResult.hasBaseline || prev.isSlouching !== postureResult.isSlouching) {
          const next = { hasBaseline: postureResult.hasBaseline, isSlouching: postureResult.isSlouching }
          postureStatusRef.current = next
          setPostureStatus(next)
        }
        updateStreak(
          'posture_slouching',
          postureResult.hasBaseline && postureResult.isSlouching,
          dtSec,
          postureCfg.minDwellSeconds
        )
      }

      // Phase 5: audio habits, same local/no-backend pattern as posture.
      const audioCfg = useStore.getState().audio
      if (audioCfg.enabled && audioMonitorRef.current.isRunning) {
        const { grindingScore, crackingScore } = audioMonitorRef.current.update(now / 1000)
        setAudioBars(audioMonitorRef.current.getBars(5))
        updateStreak(
          'teeth_grinding',
          grindingScore >= audioCfg.thresholds.teeth_grinding,
          dtSec,
          audioCfg.minDwellSeconds.teeth_grinding,
          grindingScore
        )
        updateStreak(
          'knuckle_cracking',
          crackingScore >= audioCfg.thresholds.knuckle_cracking,
          dtSec,
          audioCfg.minDwellSeconds.knuckle_cracking,
          crackingScore
        )
      }

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
  }, [handleClassification, updateStreak])

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
    lastFaceRef,
    lastHandsRef,
    lastPoseRef,
    postureStatus,
    audioBars,
    latestProbabilities,
    fps,
    extractorRef,
    checkBackend,
  }
}

export { FEATURE_NAMES }
