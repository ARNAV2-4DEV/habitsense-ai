import { useCallback, useEffect, useRef, useState } from 'react'
import { createDetectionWorkerClient } from '../lib/detectionWorkerClient'
import { createFeatureExtractor, heuristicGuess, FEATURE_NAMES } from '../lib/featureExtraction'
import { createPostureMonitor } from '../lib/postureFeatures'
import { createAudioMonitor } from '../lib/audioDetection'
import { api } from '../lib/api'
import { useStore } from '../state/store'
import { requestConsent } from '../lib/consent'
import { scheduleVideoFrameLoop, cancelVideoFrameLoop, scheduleImmediate } from '../lib/videoFrameLoop'

const BACKEND_POLL_MS = 200 // ~5 calls/sec to the local classifier — plenty for dwell-smoothed detection

export function useDetectionEngine() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const loopHandleRef = useRef(null)
  // Bumped on every stop(): ticks captured under an older id bail out rather
  // than rescheduling themselves against a torn-down video element.
  const runIdRef = useRef(0)
  // Holds the MediaPipe worker client (see lib/detectionWorkerClient.js):
  // face/hand/pose inference now runs on a dedicated worker thread instead
  // of blocking this thread's rendering/animation work every frame. Kept in
  // a ref (not reset on stop()) so restarting a session within the same
  // page visit reuses the already-loaded models instead of paying init cost
  // again -- same caching behavior the old detectorsRef had.
  const workerRef = useRef(null)
  const extractorRef = useRef(createFeatureExtractor())
  const lastBackendCallRef = useRef(0)
  const openEventsRef = useRef({}) // habit -> { startedAt, maxConfidence }
  const activeStreakRef = useRef({}) // habit -> seconds sustained above threshold this "bout"
  const lastFrameTimeRef = useRef(performance.now())

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
  // above via updateStreak() rather than a parallel system. Pose inference
  // itself now happens inside the worker (see workerRef) alongside face/hand.
  const postureMonitorRef = useRef(createPostureMonitor())
  const audioMonitorRef = useRef(createAudioMonitor())

  const [loadingMsg, setLoadingMsg] = useState(null)
  const [error, setError] = useState(null)
  const [postureStatus, setPostureStatus] = useState(null) // { hasBaseline, isSlouching }
  const [audioBars, setAudioBars] = useState(null) // live spectrum, for the waveform visualizer only
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

  const cancelLoop = useCallback(() => {
    cancelVideoFrameLoop(loopHandleRef.current)
    loopHandleRef.current = null
  }, [])

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

  /**
   * Every habit key this session can actually emit an event for, across all
   * three independent gates: the `enabledHabits` map (the landmark habits),
   * the posture switch, and the audio switch.
   *
   * Deliberately reports what is RUNNING, not what is merely configured --
   * posture only counts once its model is loaded, and the audio habits only
   * once the microphone actually started, since a declined mic prompt leaves
   * audio.enabled true while nothing can ever fire. Call this after the
   * models and the mic have been brought up.
   */
  const activeHabitKeys = useCallback(() => {
    const s = useStore.getState()
    const keys = Object.entries(s.enabledHabits)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (s.posture.enabled && workerRef.current?.poseReady) keys.push('posture_slouching')
    if (s.audio.enabled && audioMonitorRef.current.isRunning) {
      keys.push('teeth_grinding', 'knuckle_cracking')
    }
    return keys
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

      if (!workerRef.current) {
        workerRef.current = createDetectionWorkerClient()
      }
      if (!workerRef.current.ready) {
        await workerRef.current.init({ onProgress: setLoadingMsg })
      }

      if (useStore.getState().posture.enabled && !workerRef.current.poseReady) {
        await workerRef.current.initPose({ onProgress: setLoadingMsg })
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

      // Posture and the audio habits live outside `enabledHabits` -- they're
      // gated by their own posture.enabled / audio.enabled switches and go
      // straight through updateStreak. That meant they logged events into
      // sessions whose habits_enabled list never mentioned them, so the
      // session record disagreed with its own events about what was being
      // watched. Declare whatever is actually running, from all three gates.
      const habitsOn = activeHabitKeys()
      const { session_id } = await api
        .startSession(useStore.getState().profileId, habitsOn)
        .catch(() => ({ session_id: null }))
      useStore.getState().setSessionId(session_id)

      api.modelStatus(useStore.getState().profileId).then(useStore.getState().setModelInfo).catch(() => {})

      extractorRef.current.reset()
      openEventsRef.current = {}
      activeStreakRef.current = {}
      lastFrameTimeRef.current = performance.now()
      runIdRef.current += 1 // new session generation; fences ticks from a stopped session

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
    // Fence first, then cancel: a tick already awaiting inference will still
    // resume, and the bumped id is what stops it rescheduling itself.
    runIdRef.current += 1
    cancelLoop()
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

    const sid = useStore.getState().sessionId
    if (sid) {
      api.endSession(sid).catch(() => {})
      api.resetSessionState(sid).catch(() => {})
    }
    useStore.getState().setSessionId(null)
    useStore.getState().setDetecting(false)
    useStore.getState().setCurrentDetection('none', 0)
  }, [closeOpenEvent, cancelLoop])

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
    const runId = runIdRef.current

    // Video time of the frame the last tick actually captured, so the
    // scheduler below can tell "a new frame is waiting" from "nothing new
    // has arrived yet".
    let lastCapturedTime = -1

    /**
     * requestVideoFrameCallback earns its keep only while inference is
     * FASTER than the camera delivers -- it stops us re-running the models
     * on a frame that hasn't changed. Measured here, inference is slower
     * (~40ms against a 33ms frame interval), and in that regime waiting for
     * the next rVFC means idling ~20ms per cycle while an already-decoded
     * frame sits unprocessed. That is what pinned the loop to every other
     * camera frame -- a hard 15fps against a 30fps camera.
     *
     * So: if a newer frame is already available, take it now; otherwise wait
     * for the next one. Self-tuning, and it keeps the anti-backlog property
     * that matters -- at most one frame is ever in flight, so a slow frame
     * can never queue up stale work whose results land against newer video.
     */
    const scheduleNext = (video) => {
      loopHandleRef.current =
        video && video.currentTime !== lastCapturedTime
          ? scheduleImmediate(tick)
          : scheduleVideoFrameLoop(video, tick)
    }

    // Not async: the backend call below is intentionally fire-and-forget
    // (.then()/.catch(), never awaited) so a slow network response can
    // never delay the next frame.
    const tick = async () => {
      if (runId !== runIdRef.current) return // session stopped underneath us
      const video = videoRef.current
      const worker = workerRef.current
      if (!video || !worker || !worker.ready || video.readyState < 2) {
        // Plain rAF here, deliberately: requestVideoFrameCallback may not
        // fire at all before the video actually starts playing, which
        // would stall this readiness poll indefinitely. Once past this
        // check, scheduling below switches to frame-synced timing.
        loopHandleRef.current = { kind: 'raf', id: requestAnimationFrame(tick) }
        return
      }

      // dtSec is real elapsed time since the last processed frame -- the
      // camera's actual delivery rate, not the display's refresh rate. Used
      // below for the dwell/streak timing (posture, audio, habit events).
      const now = performance.now()
      const dtSec = Math.max(0, (now - lastFrameTimeRef.current) / 1000)
      lastFrameTimeRef.current = now

      const postureCfg = useStore.getState().posture
      const wantPose = postureCfg.enabled && worker.poseReady

      // The client captures one cheap, hardware-accelerated ImageBitmap per
      // model and transfers them (zero-copy) to one worker each, so face and
      // hand inference overlap instead of running back to back.
      //
      // They are joined with Promise.all rather than run on independent
      // loops. That was measured both ways: decoupling them so neither waits
      // on the other moved overlay lag 69.3ms -> 66.8ms, i.e. nothing, while
      // the face model itself went 29.5ms -> 38.4ms. The GPU is saturated --
      // the two models serialize in the driver regardless of which thread
      // issues them -- so independent loops buy noise in exchange for real
      // complexity and a face/hand temporal skew in the classifier features.
      //
      // Awaiting the joined result before scheduling the next tick is also
      // what caps in-flight work at one frame, so a slow frame can never
      // build a queue of stale bitmaps landing against newer video.
      let face, hands, pose
      // Which frame this tick is about to consume, in the video's own clock,
      // so scheduleNext() can tell whether a newer one has arrived since.
      lastCapturedTime = video.currentTime
      try {
        ;({ face, hands, pose } = await worker.detect(video, now, wantPose))
      } catch {
        // Frame capture/detection failed for this tick (e.g. a transient
        // decode hiccup) -- skip it, same as the old code implicitly did
        // whenever a frame wasn't ready; next scheduled tick just tries again.
        if (runId === runIdRef.current) scheduleNext(video)
        return
      }
      if (runId !== runIdRef.current) return
      lastFaceRef.current = face
      lastHandsRef.current = hands

      const localVec = extractorRef.current.extract(face, hands, now / 1000)

      // Phase 4: posture, entirely local, driven off the same cadence as
      // face/hand tracking rather than the throttled backend poll below --
      // there's no backend model involved at all (see postureFeatures.js
      // for why this stays a session-relative heuristic, not a classifier).
      if (wantPose) {
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

      scheduleNext(video)
    }

    tick()
  }, [handleClassification, updateStreak])

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      cancelLoop()
      workerRef.current?.terminate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    extractorRef,
    checkBackend,
  }
}

export { FEATURE_NAMES }
