import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Loader2, CheckCircle2, RotateCcw, Sparkles, AlertCircle } from 'lucide-react'
import { useCalibrationCapture } from '../hooks/useCalibrationCapture'
import { useStore } from '../state/store'
import { api } from '../lib/api'
import { runQualityGates, MAX_GATE_RETRIES } from '../lib/qualityGates'
import CameraStage from '../components/detection/CameraStage'
import Panel from '../components/ui/Panel'
import SectionLabel from '../components/ui/SectionLabel'
import PaperAmbientField from '../components/ui/PaperAmbientField'
import PrivacyPanel from '../components/ui/PrivacyPanel'
import { STATUS_COLOR } from '../lib/paperTheme'

const HABIT_COPY = {
  nail_biting: { label: 'Nail biting', prompt: 'Bring a fingertip to your mouth as if biting your nail.' },
  hair_pulling: { label: 'Hair pulling', prompt: 'Bring your hand up near your hairline/temple, like reaching for a strand.' },
  face_touching: { label: 'Face touching', prompt: 'Rest your hand on your cheek, chin, or forehead.' },
  lip_biting: { label: 'Lip biting', prompt: 'Press or bite your lips together, hands away from your face.' },
  nose_picking: { label: 'Nose picking', prompt: 'Bring a fingertip to your nose as if picking it.' },
  eye_rubbing: { label: 'Eye rubbing', prompt: 'Bring your hand up to rub or touch your eye.' },
  skin_picking: { label: 'Skin picking', prompt: 'Pinch your thumb and index finger together against your cheek or jaw, as if picking at skin.' },
  chewing: { label: 'Chewing on objects', prompt: 'Hold a pen or similar object steady between your teeth, hand relaxed near your mouth.' },
  chin_resting: { label: 'Chin/cheek resting', prompt: 'Rest your chin or cheek in your hand and hold still, like resting your head while thinking.', category: 'posture' },
}

// Real phases the recording pipeline actually moves through -- used to
// drive the step-progress bar (ported visual from the reference's flow
// dots), not a separate manually-advanced demo state like the reference had.
const PHASE_ORDER = ['idle', 'countdown', 'recording-habit', 'recording-neutral', 'uploading']

function ProgressRing({ durationMs, color }) {
  const r = 28
  const c = 2 * Math.PI * r
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="mx-auto mb-3 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(35,59,53,0.1)" strokeWidth="4" />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: durationMs / 1000, ease: 'linear' }}
      />
    </svg>
  )
}

const HABIT_BURST_MS = 6000
const NEUTRAL_BURST_MS = 4500
const REP_MINIMUM = 3
const REP_SUGGESTED = 12 // midpoint of the plan's "10-15 across sessions" guidance

const HAND_OPTIONS = [
  { value: 'either', label: 'Either hand' },
  { value: 'left', label: 'Left hand' },
  { value: 'right', label: 'Right hand' },
]
const FINGER_OPTIONS = [
  { value: 'any', label: 'Any finger' },
  { value: 'thumb', label: 'Thumb' },
  { value: 'index', label: 'Index' },
]

const ISOLATED_FINGER_HABITS = ['nail_biting', 'nose_picking']
const HAND_ONLY_VARIANT_HABITS = ['hair_pulling', 'face_touching', 'eye_rubbing', 'skin_picking', 'chewing', 'chin_resting']

function variantTag(habit, variant) {
  if (ISOLATED_FINGER_HABITS.includes(habit)) {
    const parts = []
    if (variant.hand !== 'either') parts.push(variant.hand)
    if (variant.finger !== 'any') parts.push(variant.finger)
    return parts.length ? parts.join('_') : null
  }
  if (HAND_ONLY_VARIANT_HABITS.includes(habit)) {
    return variant.hand !== 'either' ? variant.hand : null
  }
  return null
}

function repsKey(profileId) {
  return `habitsense_reps_v1_${profileId}`
}

function loadRepCounts(profileId) {
  try {
    return JSON.parse(localStorage.getItem(repsKey(profileId))) || {}
  } catch {
    return {}
  }
}

export default function Calibrate() {
  const { videoRef, start, stop, recordBurst, ready, loadingMsg, error, lastFaceRef, lastHandsRef } =
    useCalibrationCapture()
  const profileId = useStore((s) => s.profileId)

  const [phase, setPhase] = useState('idle') // idle | countdown | recording-habit | recording-neutral | uploading | gate-failed | done
  const [habitIndex, setHabitIndex] = useState(0)
  const [countdownN, setCountdownN] = useState(3)
  const [summary, setSummary] = useState(null)
  const [modelInfo, setModelInfo] = useState(null)
  const [retrainResult, setRetrainResult] = useState(null)
  const [retraining, setRetraining] = useState(false)
  const [repCounts, setRepCounts] = useState(() => loadRepCounts(profileId))
  const [failedAttempts, setFailedAttempts] = useState({})
  const [lastAttempt, setLastAttempt] = useState(null)
  const [gateFailure, setGateFailure] = useState(null)
  const [variant, setVariant] = useState({ hand: 'either', finger: 'any' })

  const habits = Object.keys(HABIT_COPY)
  const currentHabit = habits[habitIndex]

  const refreshSummary = useCallback(() => {
    api.calibrationSummary(profileId).then(setSummary).catch(() => {})
  }, [profileId])

  const refreshModelInfo = useCallback(() => {
    api.modelStatus(profileId).then(setModelInfo).catch(() => {})
  }, [profileId])

  useEffect(() => {
    refreshSummary()
    refreshModelInfo()
  }, [refreshSummary, refreshModelInfo])

  useEffect(() => {
    setVariant({ hand: 'either', finger: 'any' })
  }, [habitIndex])

  useEffect(() => {
    return () => {
      if (useStore.getState) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runCountdown = () =>
    new Promise((resolve) => {
      let n = 3
      setCountdownN(n)
      const id = setInterval(() => {
        n -= 1
        setCountdownN(n)
        if (n <= 0) {
          clearInterval(id)
          resolve()
        }
      }, 700)
    })

  const bumpRepCount = (habit) => {
    setRepCounts((prev) => {
      const next = { ...prev, [habit]: (prev[habit] || 0) + 1 }
      try {
        localStorage.setItem(repsKey(profileId), JSON.stringify(next))
      } catch {
        /* localStorage unavailable -- rep counter just resets on reload, not fatal */
      }
      return next
    })
  }

  const commitRep = async (habit, habitVectors, neutralVectors, tag) => {
    setPhase('uploading')
    await Promise.all([
      ...habitVectors.map((v) => api.addCalibrationSample(profileId, habit, v, tag)),
      ...neutralVectors.map((v) => api.addCalibrationSample(profileId, 'none', v)),
    ])
    bumpRepCount(habit)
    setFailedAttempts((f) => ({ ...f, [habit]: 0 }))
    setLastAttempt(null)
    setGateFailure(null)
    refreshSummary()
    refreshModelInfo()
    setPhase('idle')
  }

  const runStepForHabit = async (habit) => {
    setPhase('countdown')
    await runCountdown()

    setPhase('recording-habit')
    const habitVectors = await recordBurst(HABIT_BURST_MS)

    setPhase('countdown')
    setCountdownN(2)
    await new Promise((r) => setTimeout(r, 1400))

    setPhase('recording-neutral')
    const neutralVectors = await recordBurst(NEUTRAL_BURST_MS)

    const gate = runQualityGates(habit, habitVectors, neutralVectors)
    if (!gate.pass) {
      setLastAttempt({ habit, habitVectors, neutralVectors })
      setGateFailure(gate.reason)
      setFailedAttempts((f) => ({ ...f, [habit]: (f[habit] || 0) + 1 }))
      setPhase('gate-failed')
      return
    }

    await commitRep(habit, habitVectors, neutralVectors, variantTag(habit, variant))
  }

  const handleRetry = () => {
    setGateFailure(null)
    runStepForHabit(currentHabit)
  }

  const handleRecordAnyway = () => {
    if (!lastAttempt) return
    commitRep(lastAttempt.habit, lastAttempt.habitVectors, lastAttempt.neutralVectors, variantTag(lastAttempt.habit, variant))
  }

  const handleBegin = async () => {
    if (!ready) await start()
  }

  const handleRetrain = async () => {
    setRetraining(true)
    try {
      const result = await api.retrain(profileId)
      setRetrainResult(result)
      refreshModelInfo()
    } catch {
      setRetrainResult({ error: true })
    }
    setRetraining(false)
  }

  const handleClear = async () => {
    await api.clearCalibration(profileId)
    setRetrainResult(null)
    refreshSummary()
    refreshModelInfo()
  }

  const recordColor =
    phase === 'recording-habit' ? STATUS_COLOR[currentHabit] || STATUS_COLOR.none
    : phase === 'recording-neutral' ? STATUS_COLOR.none
    : '#4e8a7c'
  const currentReps = repCounts[currentHabit] || 0
  const currentFailedAttempts = failedAttempts[currentHabit] || 0
  const phaseStepIndex = Math.max(0, PHASE_ORDER.indexOf(phase === 'gate-failed' ? 'uploading' : phase))

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
      <PaperAmbientField />
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <div className="mb-7">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">
            Personal model · local retraining
          </p>
          <h1 className="font-display text-4xl tracking-[-.03em] text-[#1c3731] sm:text-5xl">
            Teach it your rhythm.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#68756d]">
            A short guided recording per habit — a burst of the behavior, then a neutral burst —
            gives the classifier real, labeled examples of your specific movements. This is
            genuine retraining: you'll see the cross-validated accuracy change.
          </p>
        </div>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,.85fr)]">
          <div>
            <SectionLabel detail={ready ? 'camera on' : 'camera off'}>Sample preview</SectionLabel>
            <Panel className="p-3 sm:p-5">
              <CameraStage videoRef={videoRef} faceRef={lastFaceRef} handsRef={lastHandsRef} statusColor={recordColor} light />

              {!ready && (
                <div className="mt-5 flex justify-center">
                  <motion.button
                    onClick={handleBegin}
                    disabled={!!loadingMsg}
                    whileTap={{ scale: 0.96 }}
                    className="inline-flex items-center gap-2 bg-[#1d3933] text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-[#274943] transition-colors disabled:opacity-60"
                  >
                    {loadingMsg ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
                    {loadingMsg || 'Turn on camera'}
                  </motion.button>
                </div>
              )}

              {error && <p className="text-[#8b3f34] text-sm text-center mt-4">{error}</p>}

              <AnimatePresence mode="wait">
                {ready && (
                  <motion.div
                    key={phase + habitIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-5 rounded-xl border border-[#233b35]/10 bg-[#f8f7f1]/60 p-6 text-center"
                  >
                    {phase === 'idle' && (
                      <>
                        <div className="font-mono text-[10px] uppercase tracking-[.14em] text-[#87918a] mb-2">
                          Step {habitIndex + 1} of {habits.length}
                        </div>
                        <h3 className="text-lg font-semibold text-[#28453c] mb-2 flex items-center justify-center gap-2">
                          {HABIT_COPY[currentHabit].label}
                          {HABIT_COPY[currentHabit].category === 'posture' && (
                            <span className="text-[10px] uppercase tracking-wide text-[#6f9db7] border border-[#6f9db7]/30 rounded-full px-2 py-0.5">
                              posture, not a BFRB
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-[#5f6d65] max-w-sm mx-auto mb-4">
                          {HABIT_COPY[currentHabit].prompt} You'll get a 3-second countdown, then{' '}
                          {HABIT_BURST_MS / 1000}s doing it, then a short neutral pose.
                        </p>

                        {currentHabit !== 'lip_biting' && (
                          <div className="flex flex-col items-center gap-2 mb-5">
                            <VariantChips
                              options={HAND_OPTIONS}
                              value={variant.hand}
                              onChange={(v) => setVariant((s) => ({ ...s, hand: v }))}
                            />
                            {ISOLATED_FINGER_HABITS.includes(currentHabit) && (
                              <VariantChips
                                options={FINGER_OPTIONS}
                                value={variant.finger}
                                onChange={(v) => setVariant((s) => ({ ...s, finger: v }))}
                              />
                            )}
                          </div>
                        )}

                        <motion.button
                          onClick={() => runStepForHabit(currentHabit)}
                          whileTap={{ scale: 0.96 }}
                          whileHover={{ scale: 1.02 }}
                          className="inline-flex items-center gap-2 bg-[#1d3933] text-white text-sm font-medium rounded-full px-5 py-2.5"
                        >
                          {currentReps > 0 ? 'Record another rep' : 'Record this habit'}
                        </motion.button>

                        <p className="text-xs text-[#7c8880] mt-3">
                          {currentReps} rep{currentReps === 1 ? '' : 's'} recorded so far
                          {currentReps < REP_MINIMUM
                            ? ` — record at least ${REP_MINIMUM} to get a personal model going`
                            : ` — keep going toward ${REP_SUGGESTED}+ across sessions for the best personalization, or move on whenever you're ready`}
                        </p>
                      </>
                    )}

                    {phase === 'countdown' && (
                      <div className="py-6">
                        <div className="text-5xl font-display text-[#1c3731]">{countdownN > 0 ? countdownN : '···'}</div>
                        <p className="text-[#7c8880] text-sm mt-2">Get ready…</p>
                      </div>
                    )}

                    {phase === 'recording-habit' && (
                      <div className="py-6">
                        <ProgressRing durationMs={HABIT_BURST_MS} color={STATUS_COLOR[currentHabit] || STATUS_COLOR.none} />
                        <p className="font-semibold text-[#28453c]">{HABIT_COPY[currentHabit].label} — go ahead</p>
                        <p className="text-[#7c8880] text-sm mt-1">{HABIT_COPY[currentHabit].prompt}</p>
                      </div>
                    )}

                    {phase === 'recording-neutral' && (
                      <div className="py-6">
                        <ProgressRing durationMs={NEUTRAL_BURST_MS} color={STATUS_COLOR.none} />
                        <p className="font-semibold text-[#28453c]">Now relax — hands away from your face</p>
                      </div>
                    )}

                    {phase === 'uploading' && (
                      <div className="py-6 flex flex-col items-center gap-2 text-[#7c8880] text-sm">
                        <Loader2 size={18} className="animate-spin" />
                        Saving samples…
                      </div>
                    )}

                    {phase === 'gate-failed' && (
                      <div className="py-6">
                        <AlertCircle size={22} className="mx-auto text-[#8b3f34] mb-2" />
                        <p className="font-semibold text-[#8b3f34]">That didn't quite capture it</p>
                        <p className="text-[#7c8880] text-sm mt-1.5 max-w-sm mx-auto">{gateFailure}</p>
                        <div className="flex justify-center gap-3 mt-5">
                          <motion.button
                            onClick={handleRetry}
                            whileTap={{ scale: 0.96 }}
                            className="inline-flex items-center gap-2 bg-[#1d3933] text-white text-sm font-medium rounded-full px-5 py-2.5"
                          >
                            Try again
                          </motion.button>
                          {currentFailedAttempts >= MAX_GATE_RETRIES && (
                            <motion.button
                              onClick={handleRecordAnyway}
                              whileTap={{ scale: 0.96 }}
                              className="inline-flex items-center gap-2 text-[#69766e] hover:text-[#1d3933] text-sm border border-[#233b35]/15 rounded-full px-5 py-2.5"
                            >
                              Record anyway
                            </motion.button>
                          )}
                        </div>
                        {currentFailedAttempts >= MAX_GATE_RETRIES && (
                          <p className="text-[11px] text-[#8a948d] mt-3 max-w-xs mx-auto">
                            These checks are a starting guess, not perfectly tuned to every setup —
                            if lighting or camera angle keeps tripping it up, go ahead and record
                            anyway.
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
            <div className="mt-5">
              <PrivacyPanel>
                <strong className="font-semibold text-[#356459]">Private by default.</strong> These recordings never
                leave your device — only labeled landmark feature vectors are sent to your own local backend.
              </PrivacyPanel>
            </div>
          </div>

          <div className="space-y-5">
            <Panel className="p-5">
              <SectionLabel detail={`step ${phaseStepIndex + 1} of ${PHASE_ORDER.length}`}>Recording progress</SectionLabel>
              <div className="mb-1 flex gap-1">
                {PHASE_ORDER.map((p, index) => (
                  <span
                    key={p}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${index <= phaseStepIndex ? 'bg-[#4e8a7c]' : 'bg-[#dce3da]'}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#7a877f]">
                Each rep moves through a countdown, a burst of the habit, a neutral burst, then a
                quality check before it's saved — automatic once you press record, no manual
                steps to click through.
              </p>
            </Panel>

            <Panel className="p-5">
              <SectionLabel detail={`${habits.length} habits`}>Choose a habit</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {habits.map((h, i) => (
                  <button
                    key={h}
                    onClick={() => setHabitIndex(i)}
                    className={`min-h-10 rounded-lg border px-3 py-2 text-left text-[11px] transition ${
                      habitIndex === i
                        ? 'border-[#4e8a7c] bg-[#e5f0e8] font-semibold text-[#32675c]'
                        : 'border-[#233b35]/10 bg-white/45 text-[#69776e] hover:bg-white/75'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[h] }} />
                      {HABIT_COPY[h].label}
                    </span>
                    {(repCounts[h] || 0) > 0 && (
                      <span className="block mt-0.5 font-mono text-[10px] text-[#8a948d]">{repCounts[h]} rep{repCounts[h] === 1 ? '' : 's'}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-[#233b35]/10 pt-4">
                <span className="text-xs text-[#68766e]">Reps for {HABIT_COPY[currentHabit].label}</span>
                <span className="font-mono text-sm text-[#3f695e]">{currentReps} / {REP_SUGGESTED}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dce3da]">
                <div
                  className="h-full rounded-full bg-[#71a99b]"
                  style={{ width: `${Math.min(100, Math.round((currentReps / REP_SUGGESTED) * 100))}%` }}
                />
              </div>
            </Panel>

            <Panel className="p-5">
              <SectionLabel>Samples recorded</SectionLabel>
              {!summary || summary.total === 0 ? (
                <p className="text-sm text-[#8a948d]">None yet — record at least one habit to start.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {Object.entries(summary.by_habit).map(([habit, count]) => (
                    <li key={habit}>
                      <div className="flex justify-between">
                        <span className="text-[#4e6158]">{HABIT_COPY[habit]?.label || habit}</span>
                        <span className="font-mono text-[#7c8880]">{count}</span>
                      </div>
                      {summary.by_variant?.[habit] && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(summary.by_variant[habit]).map(([v, n]) => (
                            <span
                              key={v}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#233b35]/[0.05] text-[#8a948d]"
                            >
                              {v.replace('_', ' ')} · {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {modelInfo?.per_habit && (
              <Panel className="p-5">
                <SectionLabel>Personalization</SectionLabel>
                <ul className="space-y-2 text-sm">
                  {Object.entries(modelInfo.per_habit)
                    .filter(([h]) => h !== 'none')
                    .map(([habit, info]) => (
                      <li key={habit} className="flex justify-between">
                        <span className="text-[#4e6158]">{HABIT_COPY[habit]?.label || habit}</span>
                        <span className="font-mono text-[#7c8880] text-xs">
                          {Math.round(info.blend_weight * 100)}% personal · {info.real_samples} samples
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="text-[11px] text-[#8a948d] mt-3 leading-relaxed">
                  Each habit blends the shared geometric prior with a model trained only on your
                  own samples once there are enough of them (8+). 0% personal means it's still
                  running on the general prior.
                </p>
              </Panel>
            )}

            <Panel className="p-5">
              <SectionLabel>Retrain</SectionLabel>
              <motion.button
                onClick={handleRetrain}
                disabled={retraining || !summary?.total}
                whileTap={{ scale: 0.97 }}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#6f9db7]/15 text-[#3d6480] border border-[#6f9db7]/30 text-sm font-medium rounded-full px-4 py-2.5 disabled:opacity-40"
              >
                {retraining ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {retraining ? 'Retraining…' : 'Retrain classifier'}
              </motion.button>

              <AnimatePresence>
                {retrainResult && !retrainResult.error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 text-sm space-y-1.5"
                  >
                    <div className="flex items-center gap-2 text-[#3f7a6d]">
                      <CheckCircle2 size={14} /> Model retrained
                    </div>
                    <div className="flex justify-between text-[#7c8880] text-xs">
                      <span>Real samples used</span>
                      <span className="font-mono">{retrainResult.n_real_samples}</span>
                    </div>
                    <div className="flex justify-between text-[#7c8880] text-xs">
                      <span>Cross-val accuracy</span>
                      <span className="font-mono">
                        {retrainResult.cv_accuracy != null ? `${Math.round(retrainResult.cv_accuracy * 100)}%` : '—'}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={handleClear}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 text-[#9aa39c] hover:text-[#69766e] text-xs"
              >
                <RotateCcw size={12} /> Clear my calibration data
              </button>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantChips({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap justify-center">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            value === opt.value
              ? 'bg-[#4e8a7c]/15 border-[#4e8a7c]/40 text-[#3d6459]'
              : 'border-[#233b35]/15 text-[#8a948d] hover:text-[#4e6158]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
