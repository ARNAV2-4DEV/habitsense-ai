import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Pulls itself a few px toward the cursor within a padded hit-zone, and
 * relaxes back on leave. Disabled under prefers-reduced-motion since the
 * pull itself (not just its transition) is the motion that matters here.
 */
export default function MagneticButton({ as: Component = motion.button, className = '', children, strength = 18, ...props }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const handleMove = (e) => {
    if (reduceMotion || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const relX = e.clientX - (rect.left + rect.width / 2)
    const relY = e.clientY - (rect.top + rect.height / 2)
    setPos({ x: (relX / rect.width) * strength, y: (relY / rect.height) * strength })
  }

  const handleLeave = () => setPos({ x: 0, y: 0 })

  return (
    <Component
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 0.5 }}
      whileTap={{ scale: 0.96 }}
      className={className}
      {...props}
    >
      <motion.span
        animate={{ x: pos.x * 0.4, y: pos.y * 0.4 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 0.5 }}
        className="inline-flex items-center gap-2"
      >
        {children}
      </motion.span>
    </Component>
  )
}
