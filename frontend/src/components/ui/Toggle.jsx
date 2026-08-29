import { motion } from 'framer-motion'

/**
 * Shared switch used across Settings -- was five hand-copied instances of
 * the same CSS-transition markup with different accent colors. Spring knob
 * instead of a CSS transition so it has a touch of overshoot, not a snap.
 */
export default function Toggle({ checked, onChange, activeClassName = 'bg-aura-calm', className = '' }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
        checked ? activeClassName : 'bg-white/10'
      } ${className}`}
    >
      <motion.span
        animate={{ left: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
      />
    </button>
  )
}
