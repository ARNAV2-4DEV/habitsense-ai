import { motion } from 'framer-motion'
import { useStore, HABITS, HABIT_CATEGORY } from '../state/store'
import { Volume2, VolumeX, Fingerprint, PersonStanding, Ear, Download } from 'lucide-react'
import { requestConsent, revokeConsent } from '../lib/consent'
import { api } from '../lib/api'
import Toggle from '../components/ui/Toggle'
import AmbientGlow from '../components/ui/AmbientGlow'

const HABIT_LABELS = {
  nail_biting: 'Nail biting',
  hair_pulling: 'Hair pulling',
  face_touching: 'Face touching',
  lip_biting: 'Lip biting',
  nose_picking: 'Nose picking',
  eye_rubbing: 'Eye rubbing',
  skin_picking: 'Skin picking',
  chewing: 'Chewing on objects',
  chin_resting: 'Chin/cheek resting',
}

export default function Settings() {
  const profileId = useStore((s) => s.profileId)
  const enabledHabits = useStore((s) => s.enabledHabits)
  const thresholds = useStore((s) => s.thresholds)
  const minDwellSeconds = useStore((s) => s.minDwellSeconds)
  const toggleHabit = useStore((s) => s.toggleHabit)
  const setThreshold = useStore((s) => s.setThreshold)
  const setMinDwell = useStore((s) => s.setMinDwell)
  const soundEnabled = useStore((s) => s.soundEnabled)
  const setSoundEnabled = useStore((s) => s.setSoundEnabled)
  const gentleMode = useStore((s) => s.gentleMode)
  const setGentleMode = useStore((s) => s.setGentleMode)
  const posture = useStore((s) => s.posture)
  const setPostureEnabled = useStore((s) => s.setPostureEnabled)
  const setPostureSensitivity = useStore((s) => s.setPostureSensitivity)
  const audio = useStore((s) => s.audio)
  const setAudioEnabled = useStore((s) => s.setAudioEnabled)
  const setAudioThreshold = useStore((s) => s.setAudioThreshold)

  const handleTogglePosture = async () => {
    if (posture.enabled) {
      setPostureEnabled(false)
      return
    }
    setPostureEnabled(true)
  }

  const handleToggleAudio = async () => {
    if (audio.enabled) {
      setAudioEnabled(false)
      revokeConsent('mic')
      return
    }
    const ok = await requestConsent('mic')
    if (ok) setAudioEnabled(true)
  }

  return (
    <div className="relative overflow-hidden">
      <AmbientGlow />
      <div className="relative max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <h1 className="font-display text-3xl tracking-tight mb-1">Settings</h1>
        <p className="text-white/45 text-sm mb-10">
          Sensitivity and dwell time are per habit — a lower confidence threshold fires sooner,
          a longer minimum dwell time means only truly sustained contact counts.
        </p>

        <div className="space-y-4 mb-10">
          {HABITS.map((habit, i) => (
            <motion.div
              key={habit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Fingerprint size={16} className="text-aura-calm" strokeWidth={1.75} />
                  <span className="font-medium">{HABIT_LABELS[habit]}</span>
                  {HABIT_CATEGORY[habit] === 'posture' && (
                    <span className="text-[10px] uppercase tracking-wide text-aura-watch/80 border border-aura-watch/25 rounded-full px-2 py-0.5">
                      posture
                    </span>
                  )}
                </div>
                <Toggle checked={enabledHabits[habit]} onChange={() => toggleHabit(habit)} />
              </div>

              <div className={`grid sm:grid-cols-2 gap-6 ${!enabledHabits[habit] ? 'opacity-40 pointer-events-none' : ''}`}>
                <div>
                  <div className="flex justify-between text-xs text-white/45 mb-2">
                    <span>Sensitivity</span>
                    <span className="font-mono">{Math.round(thresholds[habit] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.9}
                    step={0.01}
                    value={thresholds[habit]}
                    onChange={(e) => setThreshold(habit, parseFloat(e.target.value))}
                    className="w-full accent-aura-calm"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-white/45 mb-2">
                    <span>Minimum sustained time</span>
                    <span className="font-mono">{minDwellSeconds[habit].toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.1}
                    value={minDwellSeconds[habit]}
                    onChange={(e) => setMinDwell(habit, parseFloat(e.target.value))}
                    className="w-full accent-aura-calm"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <PersonStanding size={16} className="text-aura-watch" strokeWidth={1.75} />
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  Posture
                  <span className="text-[10px] uppercase tracking-wide text-aura-watch/80 border border-aura-watch/25 rounded-full px-2 py-0.5">
                    experimental
                  </span>
                </div>
                <div className="text-xs text-white/40 max-w-sm">
                  Not a compulsive habit — a rule-based check against how you were sitting a few
                  seconds ago, using MediaPipe's body pose model. Also draws the full 33-point
                  skeleton overlay on Live/Calibrate while it's on. Off by default.
                </div>
              </div>
            </div>
            <Toggle checked={posture.enabled} onChange={handleTogglePosture} activeClassName="bg-aura-watch" />
          </div>
          {posture.enabled && (
            <div className="mt-4 grid sm:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-xs text-white/45 mb-2">
                  <span>Sensitivity</span>
                  <span className="font-mono">{Math.round(posture.sensitivity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={posture.sensitivity}
                  onChange={(e) => setPostureSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-aura-watch"
                />
              </div>
              <p className="text-[11px] text-white/35 self-end leading-relaxed">
                A short baseline is captured at the start of each Live session (sit normally for a
                few seconds) — detection compares against that, not an absolute standard.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 mb-10">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <Ear size={16} className="text-aura-watch" strokeWidth={1.75} />
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  Audio habits
                  <span className="text-[10px] uppercase tracking-wide text-aura-watch/80 border border-aura-watch/25 rounded-full px-2 py-0.5">
                    experimental · mic
                  </span>
                </div>
                <div className="text-xs text-white/40 max-w-sm">
                  Teeth grinding and knuckle cracking, detected from sound alone via the Web Audio
                  API — a rule-based signal check, not a trained model. Requires microphone access.
                </div>
              </div>
            </div>
            <Toggle checked={audio.enabled} onChange={handleToggleAudio} activeClassName="bg-aura-watch" />
          </div>
          {audio.enabled && (
            <div className="mt-4 grid sm:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-xs text-white/45 mb-2">
                  <span>Grinding sensitivity</span>
                  <span className="font-mono">{Math.round(audio.thresholds.teeth_grinding * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.05}
                  value={audio.thresholds.teeth_grinding}
                  onChange={(e) => setAudioThreshold('teeth_grinding', parseFloat(e.target.value))}
                  className="w-full accent-aura-watch"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/45 mb-2">
                  <span>Cracking sensitivity</span>
                  <span className="font-mono">{Math.round(audio.thresholds.knuckle_cracking * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.05}
                  value={audio.thresholds.knuckle_cracking}
                  onChange={(e) => setAudioThreshold('knuckle_cracking', parseFloat(e.target.value))}
                  className="w-full accent-aura-watch"
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {soundEnabled ? <Volume2 size={16} className="text-aura-calm" /> : <VolumeX size={16} className="text-white/40" />}
              <div>
                <div className="text-sm font-medium">Sound on reminders</div>
                <div className="text-xs text-white/40">A soft two-note chime, not an alarm.</div>
              </div>
            </div>
            <Toggle checked={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
            <div>
              <div className="text-sm font-medium">Gentle mode</div>
              <div className="text-xs text-white/40">Softer toast styling. Turn off for a more visually assertive reminder.</div>
            </div>
            <Toggle checked={gentleMode} onChange={() => setGentleMode(!gentleMode)} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 mt-4">
          <div className="text-sm font-medium mb-1">Export your data</div>
          <p className="text-xs text-white/40 mb-4 max-w-sm">
            Every session, event, and calibration sample for this profile, straight from your local
            database — no account, no server-side gating.
          </p>
          <div className="flex items-center gap-3">
            <motion.a
              whileTap={{ scale: 0.96 }}
              whileHover={{ y: -1 }}
              href={api.exportUrl(profileId, 'json')}
              className="inline-flex items-center gap-2 text-sm border border-white/15 rounded-full px-4 py-2 text-white/70 hover:text-white hover:border-white/30 transition-colors"
            >
              <Download size={14} /> Download JSON
            </motion.a>
            <motion.a
              whileTap={{ scale: 0.96 }}
              whileHover={{ y: -1 }}
              href={api.exportUrl(profileId, 'csv')}
              className="inline-flex items-center gap-2 text-sm border border-white/15 rounded-full px-4 py-2 text-white/70 hover:text-white hover:border-white/30 transition-colors"
            >
              <Download size={14} /> Download CSV (.zip)
            </motion.a>
          </div>
        </div>
      </div>
    </div>
  )
}
