import { useStore, HABITS } from '../state/store'
import { Volume2, VolumeX, Fingerprint } from 'lucide-react'

const HABIT_LABELS = {
  nail_biting: 'Nail biting',
  hair_pulling: 'Hair pulling',
  face_touching: 'Face touching',
  lip_biting: 'Lip biting',
  nose_picking: 'Nose picking',
  eye_rubbing: 'Eye rubbing',
  skin_picking: 'Skin picking',
  chewing: 'Chewing on objects',
}

export default function Settings() {
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

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-3xl tracking-tight mb-1">Settings</h1>
      <p className="text-white/45 text-sm mb-10">
        Sensitivity and dwell time are per habit — a lower confidence threshold fires sooner,
        a longer minimum dwell time means only truly sustained contact counts.
      </p>

      <div className="space-y-4 mb-10">
        {HABITS.map((habit) => (
          <div key={habit} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Fingerprint size={16} className="text-aura-calm" strokeWidth={1.75} />
                <span className="font-medium">{HABIT_LABELS[habit]}</span>
              </div>
              <button
                onClick={() => toggleHabit(habit)}
                className={`w-11 h-6 rounded-full relative transition-colors ${
                  enabledHabits[habit] ? 'bg-aura-calm' : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    enabledHabits[habit] ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
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
          </div>
        ))}
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
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-11 h-6 rounded-full relative transition-colors ${soundEnabled ? 'bg-aura-calm' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
          <div>
            <div className="text-sm font-medium">Gentle mode</div>
            <div className="text-xs text-white/40">Softer toast styling. Turn off for a more visually assertive reminder.</div>
          </div>
          <button
            onClick={() => setGentleMode(!gentleMode)}
            className={`w-11 h-6 rounded-full relative transition-colors ${gentleMode ? 'bg-aura-calm' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${gentleMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
