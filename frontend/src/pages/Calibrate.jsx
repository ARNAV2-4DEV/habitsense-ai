import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Loader2, CheckCircle2, RotateCcw, Sparkles, AlertCircle } from 'lucide-react'
import { useCalibrationCapture } from '../hooks/useCalibrationCapture'
import { useStore } from '../state/store'
import { api } from '../lib/api'
import { runQualityGates, MAX_GATE_RETRIES } from '../lib/qualityGates'
import CameraStage from '../components/detection/CameraStage'

const HABIT_COPY = {
  nail_biting: { label: 'Nail biting', prompt: 'Bring a fingertip to your mouth as if biting your nail.' },
  hair_pulling: { label: 'Hair pulling', prompt: 'Bring your hand up near your hairline/temple, like reaching for a strand.' },
  face_touching: { label: 'Face touching', prompt: 'Rest your hand on your cheek, chin, or forehead.' },
  lip_biting: { label: 'Lip biting', prompt: 'Press or bite your lips together, hands away from your face.' },
  nose_picking: { label: 'Nose picking', prompt: 'Bring a fingertip to your nose as if picking it.' },
  eye_rubbing: { label: 'Eye rubbing', prompt: 'Bring your hand up to rub or touch your eye.' },
  skin_picking: { label: 'Skin picking', prompt: 'Pinch your thumb and index finger together against your cheek or jaw, as if picking at skin.' },
  chewing: { label: 'Chewing on objects', prompt: 'Hold a pen or similar object steady between your teeth, hand relaxed near your mouth.' },
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
const HAND_ONLY_VARIANT_HABITS = ['hair_pulling', 'face_touching', 'eye_rubbing', 'skin_picking', 'chewing']

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
  const { videoRef, start, stop, recordBurst, ready, loadingMsg, error, lastFace, lastHands } =
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

  const recordColor = phase === 'recording-habit' ? '#f5647c' : phase === 'recording-neutral' ? '#5ee7c8' : '#7c9cf5'
  const currentReps = repCounts[currentHabit] || 0
  const currentFailedAttempts = failedAttempts[currentHabit] || 0

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">Calibrate to you</h1>
        <p className="text-white/50 mt-1 text-sm max-w-xl">
          A short guided recording per habit — a burst of the behavior, then a neutral burst —
          gives the classifier real, labeled examples of your specific movements and hand
          shape. This is genuine retraining: you'll see the cross-validated accuracy change.
          Recording 3+ reps per habit gets a model going; 10-15 across a few sessions gets it
          well personalized.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <CameraStage videoRef={videoRef} face={lastFace} hands={lastHands} statusColor={recordColor} />

          {!ready && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleBegin}
                disabled={!!loadingMsg}
                className="inline-flex items-center gap-2 bg-white text-ink-950 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-aura-calm transition-colors disabled:opacity-60"
              >
                {loadingMsg ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
                {loadingMsg || 'Turn on camera'}
              </button>
            </div>
          )}

          {error && <p className="text-aura-flag text-sm text-center mt-4">{error}</p>}

          <AnimatePresence mode="wait">
            {ready && (
              <motion.div
                key={phase + habitIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-center"
              >
                {phase === 'idle' && (
                  <>
                    <div className="text-xs uppercase tracking-wide text-white/40 mb-2">
                      Step {habitIndex + 1} of {habits.length}
                    </div>
                    <h3 className="text-lg font-medium mb-2">{HABIT_COPY[currentHabit].label}</h3>
                    <p className="text-sm text-white/55 max-w-sm mx-auto mb-4">
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

                    <button
                      onClick={() => runStepForHabit(currentHabit)}
                      className="inline-flex items-center gap-2 bg-aura-calm text-ink-950 text-sm font-medium rounded-full px-5 py-2.5"
                    >
                      {currentReps > 0 ? 'Record another rep' : 'Record this habit'}
                    </button>

                    <p className="text-xs text-white/40 mt-3">
                      {currentReps} rep{currentReps === 1 ? '' : 's'} recorded so far
                      {currentReps < REP_MINIMUM
                        ? ` — record at least ${REP_MINIMUM} to get a personal model going`
                        : ` — keep going toward ${REP_SUGGESTED}+ across sessions for the best personalization, or move on whenever you're ready`}
                    </p>

                    <div className="flex justify-center gap-2 mt-5">
                      {habits.map((h, i) => (
                        <button
                          key={h}
                          onClick={() => setHabitIndex(i)}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            i === habitIndex ? 'bg-aura-calm' : 'bg-white/15'
                          }`}
                          aria-label={HABIT_COPY[h].label}
                        />
                      ))}
                    </div>
                    {habitIndex < habits.length - 1 && (
                      <button
                        onClick={() => setHabitIndex((i) => i + 1)}
                        className="block mx-auto mt-4 text-xs text-white/40 hover:text-white/70"
                      >
                        Skip to next habit →
                      </button>
                    )}
                  </>
                )}

                {phase === 'countdown' && (
                  <div className="py-6">
                    <div className="text-5xl font-display">{countdownN > 0 ? countdownN : '···'}</div>
                    <p className="text-white/40 text-sm mt-2">Get ready…</p>
                  </div>
                )}

                {phase === 'recording-habit' && (
                  <div className="py-6">
                    <div className="w-3 h-3 rounded-full bg-aura-flag mx-auto animate-pulse mb-3" />
                    <p className="font-medium">{HABIT_COPY[currentHabit].label} — go ahead</p>
                    <p className="text-white/40 text-sm mt-1">{HABIT_COPY[currentHabit].prompt}</p>
                  </div>
                )}

                {phase === 'recording-neutral' && (
                  <div className="py-6">
                    <div className="w-3 h-3 rounded-full bg-aura-calm mx-auto animate-pulse mb-3" />
                    <p className="font-medium">Now relax — hands away from your face</p>
                  </div>
                )}

                {phase === 'uploading' && (
                  <div className="py-6 flex flex-col items-center gap-2 text-white/50 text-sm">
                    <Loader2 size={18} className="animate-spin" />
                    Saving samples…
                  </div>
                )}

                {phase === 'gate-failed' && (
                  <div className="py-6">
                    <AlertCircle size={22} className="mx-auto text-aura-flag mb-2" />
                    <p className="font-medium text-aura-flag">That didn't quite capture it</p>
                    <p className="text-white/50 text-sm mt-1.5 max-w-sm mx-auto">{gateFailure}</p>
                    <div className="flex justify-center gap-3 mt-5">
                      <button
                        onClick={handleRetry}
                        className="inline-flex items-center gap-2 bg-aura-calm text-ink-950 text-sm font-medium rounded-full px-5 py-2.5"
                      >
                        Try again
                      </button>
                      {currentFailedAttempts >= MAX_GATE_RETRIES && (
                        <button
                          onClick={handleRecordAnyway}
                          className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 text-sm border border-white/15 rounded-full px-5 py-2.5"
                        >
                          Record anyway
                        </button>
                      )}
                    </div>
                    {currentFailedAttempts >= MAX_GATE_RETRIES && (
                      <p className="text-[11px] text-white/35 mt-3 max-w-xs mx-auto">
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
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Samples recorded</div>
            {!summary || summary.total === 0 ? (
              <p className="text-sm text-white/35">None yet — record at least one habit to start.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {Object.entries(summary.by_habit).map(([habit, count]) => (
                  <li key={habit}>
                    <div className="flex justify-between">
                      <span>{HABIT_COPY[habit]?.label || habit}</span>
                      <span className="font-mono text-white/50">{count}</span>
                    </div>
                    {summary.by_variant?.[habit] && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(summary.by_variant[habit]).map(([v, n]) => (
                          <span
                            key={v}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.05] text-white/40"
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
          </div>

          {modelInfo?.per_habit && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Personalization</div>
              <ul className="space-y-2 text-sm">
                {Object.entries(modelInfo.per_habit)
                  .filter(([h]) => h !== 'none')
                  .map(([habit, info]) => (
                    <li key={habit} className="flex justify-between">
                      <span>{HABIT_COPY[habit]?.label || habit}</span>
                      <span className="font-mono text-white/50 text-xs">
                        {Math.round(info.blend_weight * 100)}% personal · {info.real_samples} samples
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
                Each habit blends the shared geometric prior with a model trained only on your
                own samples once there are enough of them (8+). 0% personal means it's still
                running on the general prior.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Retrain</div>
            <button
              onClick={handleRetrain}
              disabled={retraining || !summary?.total}
              className="w-full inline-flex items-center justify-center gap-2 bg-aura-watch/20 text-aura-watch border border-aura-watch/30 text-sm font-medium rounded-full px-4 py-2.5 disabled:opacity-40"
            >
              {retraining ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {retraining ? 'Retraining…' : 'Retrain classifier'}
            </button>

            <AnimatePresence>
              {retrainResult && !retrainResult.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 text-sm space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-aura-calm">
                    <CheckCircle2 size={14} /> Model retrained
                  </div>
                  <div className="flex justify-between text-white/50 text-xs">
                    <span>Real samples used</span>
                    <span className="font-mono">{retrainResult.n_real_samples}</span>
                  </div>
                  <div className="flex justify-between text-white/50 text-xs">
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
              className="w-full mt-3 inline-flex items-center justify-center gap-2 text-white/35 hover:text-white/70 text-xs"
            >
              <RotateCcw size={12} /> Clear my calibration data
            </button>
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
              ? 'bg-aura-calm/20 border-aura-calm/40 text-aura-calm'
              : 'border-white/15 text-white/40 hover:text-white/70'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
