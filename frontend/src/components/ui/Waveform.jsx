import { motion } from 'framer-motion'

/**
 * Live bar visualizer for the real microphone spectrum computed in
 * lib/audioDetection.js (getBars()) -- not a decorative/random animation.
 * Renders idle flat bars when `bars` is null (mic not yet running).
 */
export default function Waveform({ bars, color = '#7c9cf5', barCount = 5, className = '' }) {
  const values = bars && bars.length === barCount ? bars : new Array(barCount).fill(0.05)

  return (
    <div className={`flex items-end gap-1 h-8 ${className}`} aria-hidden>
      {values.map((v, i) => (
        <motion.div
          key={i}
          animate={{ height: `${8 + Math.min(1, v) * 92}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-1 rounded-full"
          style={{ backgroundColor: color, minHeight: '8%' }}
        />
      ))}
    </div>
  )
}
