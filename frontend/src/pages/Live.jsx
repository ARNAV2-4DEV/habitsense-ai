import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Square, Loader2, AlertCircle, PersonStanding, Ear, MessageSquarePlus } from 'lucide-react'
import { useDetectionEngine } from '../hooks/useDetectionEngine'
import { useStore } from '../state/store'
import { api } from '../lib/api'
import CameraStage from '../components/detection/CameraStage'
import ReminderToast from '../components/detection/ReminderToast'
import AuraOrb from '../components/three/AuraOrb'
import MagneticButton from '../components/ui/MagneticButton'
import Waveform from '../components/ui/Waveform'
import AmbientGlow from '../components/ui/AmbientGlow'

const cardIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] },
})

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
  chin_resting: '#7c9cf5',
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
  chin_resting: 'Chin/cheek resting',
  posture_slouching: 'Posture drift',
  teeth_grinding: 'Teeth grinding',
  knuckle_cracking: 'Knuckle cracking',
}

export default function Live() {
  const { videoRef, start, stop, loadingMsg, error, lastFaceRef, lastHandsRef, lastPoseRef, postureStatus, audioBars, fps } =
    useDetectionEngine()
  const isDetecting = useStore((s) => s.isDetecting)
  const currentLabel = useStore((s) => s.currentLabel)
  const currentConfidence = useStore((s) => s.currentConfidence)
  const sessionEvents = useStore((s) => s.sessionEvents)
  const modelInfo = useStore((s) => s.modelInfo)
  const backendOnline = useStore((s) => s.backendOnline)
  const posture = useStore((s) => s.posture)
  const audio = useStore((s) => s.audio)

  useEffect(() => {
    return () => {
      if (useStore.getState().isDetecting) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const color = STATUS_COLOR[currentLabel] || STATUS_COLOR.none

  return (
    <div className="relative overflow-hidden">
      <AmbientGlow />
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Live detection</h1>
            <p className="text-white/50 mt-1 text-sm max-w-md">
              Camera + models run entirely in this browser tab. Landmark coordinates only —
              never frames — are sent to your local backend for classification.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDetecting && (
              <span className="text-[11px] font-mono text-white/35" title="Real detection-loop fps, smoothed">
                {fps} fps
              </span>
            )}
            {!isDetecting ? (
              <MagneticButton
                onClick={start}
                disabled={!!loadingMsg}
                strength={12}
                className="inline-flex items-center gap-2 bg-white text-ink-950 text-sm font-medium rounded-full px-5 py-2.5 shadow-[0_0_0_0_rgba(94,231,200,0)] hover:shadow-[0_0_28px_-4px_rgba(94,231,200,0.5)] hover:bg-aura-calm transition-[background-color,box-shadow] duration-300 disabled:opacity-60 disabled:pointer-events-none"
              >
                {loadingMsg ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
                {loadingMsg || 'Start session'}
              </MagneticButton>
            ) : (
              <button
                onClick={stop}
                className="relative inline-flex items-center gap-2 bg-aura-flag/15 text-aura-flag border border-aura-flag/30 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-aura-flag/25 transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aura-flag/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-aura-flag" />
                </span>
                <Square size={14} /> End session
              </button>
            )}
          </div>
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
          <CameraStage
            videoRef={videoRef}
            faceRef={lastFaceRef}
            handsRef={lastHandsRef}
            poseRef={lastPoseRef}
            statusColor={color}
          />

          <div className="space-y-6">
            <motion.div {...cardIn()} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wide text-white/40 mb-3">Current state</div>
              <div className="relative h-32 -mx-2">
                {isDetecting && (
                  <div
                    className="absolute inset-8 rounded-full blur-2xl animate-pulse transition-colors duration-700"
                    style={{ backgroundColor: `${color}22` }}
                  />
                )}
                <AuraOrb className="relative w-full h-full" />
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
            </motion.div>

            {modelInfo?.per_habit && (
              <motion.div {...cardIn(0.06)} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
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
              </motion.div>
            )}

            {(posture.enabled || audio.enabled) && isDetecting && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="text-xs uppercase tracking-wide text-white/40">Posture & audio (experimental)</div>
                {posture.enabled && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <PersonStanding size={15} className={postureStatus?.isSlouching ? 'text-aura-alert' : 'text-aura-watch'} />
                    <span className="text-white/70">
                      {!postureStatus?.hasBaseline
                        ? 'Capturing your baseline posture…'
                        : postureStatus.isSlouching
                        ? 'Posture has drifted from your baseline'
                        : 'Posture looks close to your baseline'}
                    </span>
                  </div>
                )}
                {audio.enabled && (
                  <div className="flex items-center gap-3 text-sm">
                    <Ear size={15} className="text-aura-watch shrink-0" />
                    <span className="text-white/70">Listening for grinding/cracking sounds</span>
                    <Waveform bars={audioBars} className="ml-auto" />
                  </div>
                )}
              </div>
            )}

            <motion.div {...cardIn(0.1)} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wide text-white/40 mb-3">This session</div>
              {sessionEvents.length === 0 ? (
                <p className="text-sm text-white/35">No sustained detections yet.</p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {sessionEvents.map((ev) => (
                    <li key={ev.id} className="border-b border-white/[0.05] pb-2 last:border-0">
                      <div className="flex items-center justify-between text-sm">
                        <span>{LABELS[ev.habit] || ev.habit}</span>
                        <span className="text-white/40 text-xs">{ev.durationSec.toFixed(1)}s</span>
                      </div>
                      <TriggerNote event={ev} />
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </div>
        </div>

        <ReminderToast />
      </div>
    </div>
  )
}

/** Phase 6: per-event trigger note -- "what was happening right before this."
 * Only editable once the event has a server-assigned id (i.e. the backend
 * was online when it was logged); otherwise there's nothing to attach it to. */
function TriggerNote({ event }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(event.notes || '')
  const [saving, setSaving] = useState(false)
  const setSessionEventNote = useStore((s) => s.setSessionEventNote)

  if (!event.serverId) return null

  const save = async () => {
    setSaving(true)
    try {
      await api.setEventNote(event.serverId, draft)
      setSessionEventNote(event.id, draft)
      setEditing(false)
    } catch {
      /* offline -- leave the field open so the person can retry */
    }
    setSaving(false)
  }

  if (!editing) {
    return event.notes ? (
      <button
        onClick={() => setEditing(true)}
        className="text-left text-xs text-white/45 hover:text-white/70 mt-1 leading-relaxed"
      >
        “{event.notes}”
      </button>
    ) : (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 mt-1"
      >
        <MessageSquarePlus size={11} /> What was happening right before this?
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="e.g. stressed reading email"
        className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-aura-calm/40"
      />
      <button
        onClick={save}
        disabled={saving}
        className="text-[11px] text-aura-calm hover:text-aura-calm/80 disabled:opacity-50"
      >
        Save
      </button>
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
