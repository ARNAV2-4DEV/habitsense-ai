import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Play, Square, Loader2, AlertCircle } from 'lucide-react'
import { useDetectionEngine } from '../hooks/useDetectionEngine'
import { useStore, HABITS } from '../state/store'
import CameraStage from '../components/detection/CameraStage'
import ReminderToast from '../components/detection/ReminderToast'
import AuraOrb from '../components/three/AuraOrb'

const STATUS_COLOR = {
  none: '#5ee7c8',
  nail_biting: '#f5647c',
  hair_pulling: '#f5647c',
  face_touching: '#f5a35e',
  lip_biting: '#f5a35e',
  nose_picking: '#f5647c',
  eye_rubbing: '#f5a35e',
  skin_picking: '#f5a35e',
  chewing: '#f5a35e',
}

const LABELS = {
  none: 'All clear',
  nail_biting: 'Nail biting',
  hair_pulling: 'Hair pulling',
  face_touching: 'Face touching',
  lip_biting: 'Lip biting',
  nose_picking: 'Nose picking',
  eye_rubbing: 'Eye rubbing',
  skin_picking: 'Skin picking',
  chewing: 'Chewing on objects',
}

export default function Live() {
  const { videoRef, start, stop, loadingMsg, error, lastFace, lastHands } = useDetectionEngine()
  const isDetecting = useStore((s) => s.isDetecting)
  const currentLabel = useStore((s) => s.currentLabel)
  const currentConfidence = useStore((s) => s.currentConfidence)
  const sessionEvents = useStore((s) => s.sessionEvents)
  const modelInfo = useStore((s) => s.modelInfo)
  const backendOnline = useStore((s) => s.backendOnline)

  useEffect(() => {
    return () => {
      if (useStore.getState().isDetecting) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const color = STATUS_COLOR[currentLabel] || STATUS_COLOR.none

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Live detection</h1>
          <p className="text-white/50 mt-1 text-sm max-w-md">
            Camera + models run entirely in this browser tab. Landmark coordinates only —
            never frames — are sent to your local backend for classification.
          </p>
        </div>
        {!isDetecting ? (
          <button
            onClick={start}
            disabled={!!loadingMsg}
            className="inline-flex items-center gap-2 bg-white text-ink-950 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-aura-calm transition-colors disabled:opacity-60"
          >
            {loadingMsg ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
            {loadingMsg || 'Start session'}
          </button>
        ) : (
          <button
            onClick={stop}
            className="inline-flex items-center gap-2 bg-aura-flag/15 text-aura-flag border border-aura-flag/30 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-aura-flag/25 transition-colors"
          >
            <Square size={14} /> End session
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-aura-flag/30 bg-aura-flag/10 px-4 py-3 text-sm text-aura-flag">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Couldn't start the session</div>
            <div className="text-aura-flag/80 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {backendOnline === false && (
        <div className="mb-6 rounded-xl border border-aura-alert/30 bg-aura-alert/10 px-4 py-3 text-sm text-aura-alert">
          Backend not reachable — running on the local geometric heuristic only (still works,
          just not personalized). Start it with <code className="font-mono">uvicorn app.main:app</code> in{' '}
          <code className="font-mono">/backend</code>.
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <CameraStage videoRef={videoRef} face={lastFace} hands={lastHands} statusColor={color} />

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Current state</div>
            <div className="h-32 -mx-2">
              <AuraOrb className="w-full h-full" />
            </div>
            <motion.div
              key={currentLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-center"
            >
              <div className="text-lg font-medium" style={{ color }}>
                {LABELS[currentLabel] || 'Watching…'}
              </div>
              <div className="text-xs text-white/40 mt-0.5">
                {isDetecting ? `${Math.round(currentConfidence * 100)}% confidence` : 'Session not running'}
              </div>
            </motion.div>
          </div>

          {modelInfo?.per_habit && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
              <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Model status</div>
              {Object.entries(modelInfo.per_habit)
                .filter(([h]) => h !== 'none')
                .map(([habit, info]) => (
                  <Row
                    key={habit}
                    label={LABELS[habit] || habit}
                    value={`${Math.round(info.blend_weight * 100)}% personal, ${info.real_samples} samples`}
                  />
                ))}
              <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
                Each habit blends a shared geometric prior with a model trained only on your own
                calibration samples once you have enough of them (8+). 0% personal means it's
                running on the general prior only — head to Calibrate to change that.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-3">This session</div>
            {sessionEvents.length === 0 ? (
              <p className="text-sm text-white/35">No sustained detections yet.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                {sessionEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-center justify-between text-sm border-b border-white/[0.05] pb-2 last:border-0"
                  >
                    <span>{LABELS[ev.habit] || ev.habit}</span>
                    <span className="text-white/40 text-xs">{ev.durationSec.toFixed(1)}s</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ReminderToast />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-white/50 text-xs">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  )
}
