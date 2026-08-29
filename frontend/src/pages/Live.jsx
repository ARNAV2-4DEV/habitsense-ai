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
import Panel from '../components/ui/Panel'
import SectionLabel from '../components/ui/SectionLabel'
import StatusBadge from '../components/ui/StatusBadge'
import PaperAmbientField from '../components/ui/PaperAmbientField'
import PrivacyPanel from '../components/ui/PrivacyPanel'
import { STATUS_COLOR, ORB_PALETTE, LABELS } from '../lib/paperTheme'

function formatElapsed(totalSec) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function liveCopy(label) {
  if (label === 'none') return 'No sustained pattern right now.'
  return `A ${(LABELS[label] || label).toLowerCase()} pattern is showing up.`
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

  const [tab, setTab] = useState('live') // mobile-only: 'live' | 'details'
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!isDetecting) {
      setElapsedSec(0)
      return
    }
    const startedAt = Date.now()
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [isDetecting])

  useEffect(() => {
    return () => {
      if (useStore.getState().isDetecting) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const color = STATUS_COLOR[currentLabel] || STATUS_COLOR.none
  const badgeTone = !isDetecting ? 'neutral' : currentLabel === 'none' ? 'clear' : 'watch'
  const badgeKicker = !isDetecting ? 'Session not running' : currentLabel === 'none' ? 'No pattern observed' : 'Top observation'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
      <PaperAmbientField />
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">
              Personal sensing · local view
            </p>
            <h1 className="font-display text-4xl tracking-[-.03em] text-[#1c3731] sm:text-5xl">
              Notice, don't judge.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#68756d]">
              A quiet, local read of your current body language — nothing leaves this device.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-[#233b35]/10 bg-white/40 p-1 lg:hidden">
              <button
                onClick={() => setTab('live')}
                className={`flex-1 rounded-full px-4 py-2 text-xs transition-colors ${tab === 'live' ? 'bg-[#1d3933] text-white' : 'text-[#65746d]'}`}
              >
                Live
              </button>
              <button
                onClick={() => setTab('details')}
                className={`flex-1 rounded-full px-4 py-2 text-xs transition-colors ${tab === 'details' ? 'bg-[#1d3933] text-white' : 'text-[#65746d]'}`}
              >
                Details
              </button>
            </div>
            {!isDetecting ? (
              <MagneticButton
                onClick={start}
                disabled={!!loadingMsg}
                strength={12}
                className="inline-flex items-center gap-2 bg-[#1d3933] text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-[#274943] transition-colors disabled:opacity-60 disabled:pointer-events-none"
              >
                {loadingMsg ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
                {loadingMsg || 'Start session'}
              </MagneticButton>
            ) : (
              <button
                onClick={stop}
                className="relative inline-flex items-center gap-2 bg-[#8b553f]/10 text-[#8b553f] border border-[#8b553f]/25 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-[#8b553f]/15 transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8b553f]/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8b553f]" />
                </span>
                <Square size={14} /> End session
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-[#c2685f]/30 bg-[#f8e4e1]/70 px-4 py-3 text-sm text-[#8b3f34]">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Couldn't start the session</div>
              <div className="text-[#8b3f34]/80 mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {backendOnline === false && (
          <div className="mb-6 rounded-xl border border-[#bd9d58]/35 bg-[#f4edda]/70 px-4 py-3 text-sm text-[#7a632d]">
            Backend not reachable — running on the local geometric heuristic only (still works,
            just not personalized). Start it with <code className="font-mono">uvicorn app.main:app</code> in{' '}
            <code className="font-mono">/backend</code>.
          </div>
        )}

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(330px,.9fr)]">
          <div className={tab === 'details' ? 'hidden lg:block' : ''}>
            <SectionLabel detail={isDetecting ? `${fps} fps` : 'idle'}>Camera workspace</SectionLabel>
            <Panel className="p-3 sm:p-5">
              <CameraStage
                videoRef={videoRef}
                faceRef={lastFaceRef}
                handsRef={lastHandsRef}
                poseRef={lastPoseRef}
                statusColor={color}
                light
                fps={isDetecting ? fps : null}
              />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#233b35]/10 pt-4">
                <span className="flex items-center gap-2 text-xs text-[#67746d]">
                  <span className={`h-2 w-2 rounded-full ${isDetecting ? 'bg-[#70a999]' : 'bg-[#b8c2ba]'}`} />
                  {isDetecting ? `Session running · ${formatElapsed(elapsedSec)}` : 'Camera idle'}
                </span>
              </div>
            </Panel>
            <div className="mt-5">
              <PrivacyPanel>
                <strong className="font-semibold text-[#356459]">Private by default.</strong> Video frames never leave
                your browser tab — only small numeric landmark coordinates are sent to the backend running on your own
                machine, never an image or frame.
              </PrivacyPanel>
            </div>
          </div>

          <aside className={`${tab === 'details' ? '' : 'hidden lg:block'} space-y-5`}>
            <SectionLabel detail="top signal only">Current state</SectionLabel>
            <Panel className="flex flex-col items-center p-5 sm:p-7">
              <div className="flex items-center gap-2">
                <StatusBadge tone={badgeTone}>{badgeKicker}</StatusBadge>
                {isDetecting && (
                  <span className="font-mono text-[10px] text-[#859089]">
                    {Math.round(currentConfidence * 100)}% confidence
                  </span>
                )}
              </div>
              <div className="relative h-52 w-52 sm:h-60 sm:w-60 my-4">
                <AuraOrb className="w-full h-full" palette={ORB_PALETTE} particleColor="#8fb6ab" />
              </div>
              <motion.div key={currentLabel} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="-mt-1 text-center">
                <h2 className="font-display text-2xl tracking-[-.03em] text-[#1c3731]">
                  {LABELS[currentLabel] || 'Watching…'}
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-[#718078]">
                  {isDetecting ? liveCopy(currentLabel) : 'Start a session to begin a local, private read of your patterns.'}
                </p>
              </motion.div>
              <div className="mt-5 grid w-full grid-cols-2 gap-2 border-t border-[#233b35]/10 pt-4 text-center">
                <div>
                  <span className="block font-mono text-lg text-[#315c51]">
                    {isDetecting ? `${Math.round(currentConfidence * 100)}%` : '—'}
                  </span>
                  <span className="text-[10px] text-[#859089]">confidence</span>
                </div>
                <div>
                  <span className="block font-mono text-lg text-[#315c51]">{formatElapsed(elapsedSec)}</span>
                  <span className="text-[10px] text-[#859089]">session time</span>
                </div>
              </div>
            </Panel>

            {modelInfo?.per_habit && (
              <Panel className="p-4">
                <SectionLabel detail="today">Model blend</SectionLabel>
                <div className="space-y-3">
                  {Object.entries(modelInfo.per_habit)
                    .filter(([h]) => h !== 'none')
                    .map(([habit, info]) => {
                      const pct = Math.round(info.blend_weight * 100)
                      return (
                        <div key={habit}>
                          <div className="mb-1 flex justify-between text-[11px] text-[#64736b]">
                            <span>{LABELS[habit] || habit}</span>
                            <span className="font-mono">{pct}% · {info.real_samples} samples</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#e0e6dd]">
                            <div className="h-full rounded-full bg-[#6da497]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
                <p className="text-[11px] text-[#8a948d] mt-3 leading-relaxed">
                  Each habit blends a shared geometric prior with a model trained only on your own
                  calibration samples once you have enough of them (8+). 0% means it's running on
                  the general prior only — head to Calibrate to change that.
                </p>
              </Panel>
            )}

            {(posture.enabled || audio.enabled) && isDetecting && (
              <Panel className="p-4 space-y-3">
                <SectionLabel>Posture & audio (experimental)</SectionLabel>
                {posture.enabled && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <PersonStanding size={15} className={postureStatus?.isSlouching ? 'text-[#c2685f]' : 'text-[#6f9db7]'} />
                    <span className="text-[#4e6158]">
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
                    <Ear size={15} className="text-[#6f9db7] shrink-0" />
                    <span className="text-[#4e6158]">Listening for grinding/cracking sounds</span>
                    <Waveform bars={audioBars} color="#6f9db7" className="ml-auto" />
                  </div>
                )}
              </Panel>
            )}
          </aside>
        </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(330px,.9fr)]">
          <div className="hidden lg:block" />
          <div className={tab === 'details' ? '' : 'hidden lg:block'}>
            <Panel className="p-4">
              <SectionLabel detail={`${sessionEvents.length} logged`}>Session events</SectionLabel>
              {sessionEvents.length === 0 ? (
                <p className="py-5 text-center text-xs text-[#7b877f]">No sustained detections yet.</p>
              ) : (
                <ul className="divide-y divide-[#233b35]/8 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {sessionEvents.map((ev) => (
                    <li key={ev.id} className="py-3 first:pt-1 last:pb-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-[#8a948d]">
                          {new Date(ev.startedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[ev.habit] || STATUS_COLOR.none }} />
                        <span className="flex-1 text-xs text-[#4e6158]">{LABELS[ev.habit] || ev.habit}</span>
                        <span className="font-mono text-[10px] text-[#8b958f]">{ev.durationSec.toFixed(1)}s</span>
                      </div>
                      <TriggerNote event={ev} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
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
        className="text-left text-xs text-[#7c8880] hover:text-[#47796e] mt-1 leading-relaxed"
      >
        “{event.notes}”
      </button>
    ) : (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-[11px] text-[#9aa39c] hover:text-[#47796e] mt-1"
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
        className="flex-1 bg-white/60 border border-[#233b35]/15 rounded-lg px-2.5 py-1 text-xs text-[#33453f] placeholder:text-[#9aa39c] focus:outline-none focus:border-[#5b988b]/50"
      />
      <button
        onClick={save}
        disabled={saving}
        className="text-[11px] text-[#3f7a6d] hover:text-[#3f7a6d]/80 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  )
}
