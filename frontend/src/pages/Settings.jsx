import { Volume2, VolumeX, PersonStanding, Ear, Download, Clock3, Bell } from 'lucide-react'
import { useStore, HABITS, HABIT_CATEGORY } from '../state/store'
import { requestConsent, revokeConsent } from '../lib/consent'
import { api } from '../lib/api'
import Toggle from '../components/ui/Toggle'
import Panel from '../components/ui/Panel'
import SectionLabel from '../components/ui/SectionLabel'
import StatusBadge from '../components/ui/StatusBadge'
import PaperAmbientField from '../components/ui/PaperAmbientField'
import { STATUS_COLOR, LABELS } from '../lib/paperTheme'

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
    <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
      <PaperAmbientField />
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">Personal preferences</p>
            <h1 className="font-display text-4xl tracking-[-.03em] text-[#1c3731] sm:text-5xl">Tune the noticing.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#68756d]">
              A lower sensitivity fires sooner; a longer minimum sustained time means only truly
              sustained contact counts.
            </p>
          </div>
          <StatusBadge tone="neutral">Saved locally</StatusBadge>
        </div>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1.5fr)_360px]">
          <div>
            <SectionLabel detail="touch-friendly controls">Habit sensitivity</SectionLabel>
            <Panel className="overflow-hidden">
              <div className="hidden grid-cols-[1.25fr_1fr_1fr_70px] gap-5 border-b border-[#233b35]/10 bg-white/30 px-5 py-3 font-mono text-[9px] uppercase tracking-[.14em] text-[#87918a] sm:grid">
                <span>Habit</span>
                <span>Sensitivity</span>
                <span>Minimum sustained time</span>
                <span className="text-right">Active</span>
              </div>
              <div className="divide-y divide-[#233b35]/8">
                {HABITS.map((habit) => (
                  <div key={habit} className="grid gap-4 px-4 py-4 sm:grid-cols-[1.25fr_1fr_1fr_70px] sm:items-center sm:gap-5 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[habit] }} />
                      <div>
                        <p className="text-xs font-semibold text-[#43584f] flex items-center gap-1.5">
                          {LABELS[habit]}
                          {HABIT_CATEGORY[habit] === 'posture' && (
                            <span className="text-[9px] uppercase tracking-wide text-[#6f9db7] border border-[#6f9db7]/30 rounded-full px-1.5 py-0.5">
                              posture
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.1em] text-[#909992]">local signal</p>
                      </div>
                    </div>

                    <label className={`block ${!enabledHabits[habit] ? 'opacity-40 pointer-events-none' : ''}`}>
                      <span className="mb-1.5 flex items-center justify-between text-[11px] text-[#7d8981]">
                        <span className="sm:hidden">Sensitivity</span>
                        <span className="font-mono">{Math.round(thresholds[habit] * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min={0.15}
                        max={0.9}
                        step={0.01}
                        value={thresholds[habit]}
                        onChange={(e) => setThreshold(habit, parseFloat(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9e0d7] accent-[#39766b]"
                      />
                    </label>

                    <label className={`block ${!enabledHabits[habit] ? 'opacity-40 pointer-events-none' : ''}`}>
                      <span className="mb-1.5 flex items-center justify-between text-[11px] text-[#7d8981]">
                        <span className="sm:hidden">Minimum sustained time</span>
                        <span className="font-mono">{minDwellSeconds[habit].toFixed(1)}s</span>
                      </span>
                      <input
                        type="range"
                        min={0.5}
                        max={4}
                        step={0.1}
                        value={minDwellSeconds[habit]}
                        onChange={(e) => setMinDwell(habit, parseFloat(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9e0d7] accent-[#39766b]"
                      />
                    </label>

                    <Toggle
                      checked={enabledHabits[habit]}
                      onChange={() => toggleHabit(habit)}
                      activeClassName="bg-[#4c897c]"
                      offClassName="bg-[#c5cec5]"
                      className="justify-self-start sm:justify-self-end"
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <aside className="space-y-5">
            <div>
              <SectionLabel>Quiet preferences</SectionLabel>
              <Panel className="divide-y divide-[#233b35]/8">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="flex min-h-16 w-full items-center gap-3 px-5 text-left"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7eee5] text-[#4c8276] shrink-0">
                    {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-xs font-semibold text-[#43584f]">Sound on reminders</span>
                    <span className="mt-1 block text-[11px] text-[#7b877f]">A soft two-note chime, not an alarm.</span>
                  </span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${soundEnabled ? 'bg-[#6ca294]' : 'bg-[#c4cbc3]'}`} />
                </button>
                <button
                  onClick={() => setGentleMode(!gentleMode)}
                  className="flex min-h-16 w-full items-center gap-3 px-5 text-left"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7eee5] text-[#4c8276] shrink-0">
                    <Bell size={15} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-xs font-semibold text-[#43584f]">Gentle mode</span>
                    <span className="mt-1 block text-[11px] text-[#7b877f]">Softer toast styling, less visually assertive.</span>
                  </span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${gentleMode ? 'bg-[#6ca294]' : 'bg-[#c4cbc3]'}`} />
                </button>
              </Panel>
            </div>

            <Panel className="p-5">
              <SectionLabel>Export your data</SectionLabel>
              <p className="text-xs leading-relaxed text-[#748178] mb-4">
                Every session, event, and calibration sample for this profile, straight from your
                local database — no account, no server-side gating.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={api.exportUrl(profileId, 'json')}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#233b35]/15 bg-white/50 px-3.5 text-xs font-medium text-[#48645b] hover:bg-white/80 transition-colors"
                >
                  <Download size={13} /> JSON
                </a>
                <a
                  href={api.exportUrl(profileId, 'csv')}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#233b35]/15 bg-white/50 px-3.5 text-xs font-medium text-[#48645b] hover:bg-white/80 transition-colors"
                >
                  <Download size={13} /> CSV (.zip)
                </a>
              </div>
            </Panel>

            <div className="flex items-start gap-3 rounded-xl border border-[#233b35]/10 bg-white/30 p-4 text-[11px] leading-relaxed text-[#77847c]">
              <Clock3 size={15} className="mt-0.5 shrink-0 text-[#769c91]" />
              Minimum sustained time is how long a pattern must remain present before it becomes a
              logged event.
            </div>
          </aside>
        </div>

        <div className="mt-7">
          <SectionLabel detail="off by default">Experimental</SectionLabel>
          <div className="grid gap-5 sm:grid-cols-2">
            <Panel className="p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <PersonStanding size={16} className="text-[#6f9db7]" strokeWidth={1.75} />
                  <div className="text-sm font-semibold text-[#28453c]">Posture</div>
                </div>
                <Toggle checked={posture.enabled} onChange={handleTogglePosture} activeClassName="bg-[#6f9db7]" offClassName="bg-[#c5cec5]" />
              </div>
              <p className="text-xs text-[#7b877f] leading-relaxed">
                Not a compulsive habit — a rule-based check against how you were sitting a few
                seconds ago, using MediaPipe's body pose model.
              </p>
              {posture.enabled && (
                <div className="mt-4 pt-4 border-t border-[#233b35]/10">
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] text-[#7d8981]">
                      <span>Sensitivity</span>
                      <span className="font-mono">{Math.round(posture.sensitivity * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      value={posture.sensitivity}
                      onChange={(e) => setPostureSensitivity(parseFloat(e.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9e0d7] accent-[#6f9db7]"
                    />
                  </label>
                  <p className="text-[11px] text-[#8a948d] mt-3 leading-relaxed">
                    A short baseline is captured at the start of each Live session — detection
                    compares against that, not an absolute standard.
                  </p>
                </div>
              )}
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <Ear size={16} className="text-[#6f9db7]" strokeWidth={1.75} />
                  <div className="text-sm font-semibold text-[#28453c]">Audio habits</div>
                </div>
                <Toggle checked={audio.enabled} onChange={handleToggleAudio} activeClassName="bg-[#6f9db7]" offClassName="bg-[#c5cec5]" />
              </div>
              <p className="text-xs text-[#7b877f] leading-relaxed">
                Teeth grinding and knuckle cracking, detected from sound alone via the Web Audio
                API. Requires microphone access.
              </p>
              {audio.enabled && (
                <div className="mt-4 pt-4 border-t border-[#233b35]/10 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] text-[#7d8981]">
                      <span>Grinding sensitivity</span>
                      <span className="font-mono">{Math.round(audio.thresholds.teeth_grinding * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.9}
                      step={0.05}
                      value={audio.thresholds.teeth_grinding}
                      onChange={(e) => setAudioThreshold('teeth_grinding', parseFloat(e.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9e0d7] accent-[#6f9db7]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] text-[#7d8981]">
                      <span>Cracking sensitivity</span>
                      <span className="font-mono">{Math.round(audio.thresholds.knuckle_cracking * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.9}
                      step={0.05}
                      value={audio.thresholds.knuckle_cracking}
                      onChange={(e) => setAudioThreshold('knuckle_cracking', parseFloat(e.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9e0d7] accent-[#6f9db7]"
                    />
                  </label>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
