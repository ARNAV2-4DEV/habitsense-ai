import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HandMetal, ScanFace, Hand, Smile, X } from 'lucide-react'
import { useStore } from '../../state/store'
import { playGentleChime } from '../../lib/chime'

const COPY = {
  nail_biting: { icon: HandMetal, text: "Noticed your hand's been at your mouth for a bit." },
  hair_pulling: { icon: ScanFace, text: 'Your hand has been near your hairline for a while.' },
  face_touching: { icon: Hand, text: "You've been touching your face for a moment." },
  lip_biting: { icon: Smile, text: 'Looks like your lips have been pressed/bitten for a bit.' },
  nose_picking: { icon: HandMetal, text: "Noticed your hand's been at your nose for a bit." },
  eye_rubbing: { icon: ScanFace, text: 'Your hand has been at your eye for a while.' },
  skin_picking: { icon: Hand, text: "Looks like you've been picking at your skin for a bit." },
  chewing: { icon: HandMetal, text: "Looks like you've been chewing on something for a while." },
}

export default function ReminderToast() {
  const activeReminder = useStore((s) => s.activeReminder)
  const clearActiveReminder = useStore((s) => s.clearActiveReminder)
  const soundEnabled = useStore((s) => s.soundEnabled)
  const gentleMode = useStore((s) => s.gentleMode)
  const lastPlayed = useRef(null)

  useEffect(() => {
    if (activeReminder && soundEnabled && lastPlayed.current !== activeReminder) {
      playGentleChime()
      lastPlayed.current = activeReminder
    }
    if (!activeReminder) lastPlayed.current = null
  }, [activeReminder, soundEnabled])

  const content = activeReminder ? COPY[activeReminder] : null
  const Icon = content?.icon || Hand

  return (
    <AnimatePresence>
      {activeReminder && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed z-50 bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm rounded-2xl border backdrop-blur-xl px-5 py-4 flex items-start gap-3 shadow-2xl ${
            gentleMode
              ? 'border-aura-calm/25 bg-ink-850/90'
              : 'border-aura-alert/40 bg-ink-850/95'
          }`}
        >
          <div className="mt-0.5 w-8 h-8 rounded-full bg-aura-alert/15 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-aura-alert" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/90 leading-snug">{content.text}</div>
            <div className="text-[11px] text-white/40 mt-1">
              Just noticing — no judgment. It'll clear on its own once your hand moves away.
            </div>
          </div>
          <button
            onClick={clearActiveReminder}
            className="text-white/30 hover:text-white/70 transition-colors mt-0.5"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
