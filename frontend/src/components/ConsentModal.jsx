import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../state/store'
import { CONSENT_COPY, grantConsent } from '../lib/consent'

/**
 * Blocks the actual getUserMedia() call until the person has explicitly seen
 * and accepted what a given sensor (camera/mic) does -- see lib/consent.js.
 * Rendered once at the app root; components request consent via
 * store.setPendingConsent({ kind, resolve }) and await the resolved boolean.
 */
export default function ConsentModal() {
  const pending = useStore((s) => s.pendingConsent)
  const setPendingConsent = useStore((s) => s.setPendingConsent)

  const copy = pending ? CONSENT_COPY[pending.kind] : null

  const respond = (accepted) => {
    if (!pending) return
    if (accepted) grantConsent(pending.kind)
    pending.resolve(accepted)
    setPendingConsent(null)
  }

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 backdrop-blur-sm px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-ink-850 p-7"
          >
            <div className="w-10 h-10 rounded-full bg-aura-calm/15 flex items-center justify-center mb-5">
              <ShieldCheck size={18} className="text-aura-calm" strokeWidth={1.75} />
            </div>
            <h2 className="font-display text-xl tracking-tight mb-3">{copy.title}</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-7">{copy.body}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => respond(true)}
                className="inline-flex items-center gap-2 bg-white text-ink-950 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-aura-calm transition-colors"
              >
                {copy.confirmLabel}
              </button>
              <button
                onClick={() => respond(false)}
                className="text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
