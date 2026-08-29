import { useEffect, useRef } from 'react'
import { useInView, useMotionValue, useSpring } from 'framer-motion'

/**
 * Animates a numeric value up from 0 when it scrolls into view. Non-numeric
 * values (e.g. "5d") pass straight through the numeric part and keep the
 * suffix static -- streak counters still read "5d", just the "5" counts up.
 */
export default function CountUp({ value, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  const numeric = match ? parseFloat(match[1]) : null
  const suffix = match ? match[2] : ''

  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { stiffness: 90, damping: 20 })
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (inView && numeric !== null && !reduceMotion) motionVal.set(numeric)
  }, [inView, numeric])

  if (numeric === null) return <span ref={ref} className={className}>{value}</span>

  if (reduceMotion) {
    return (
      <span ref={ref} className={className}>
        {numeric}
        {suffix}
      </span>
    )
  }

  return (
    <span ref={ref} className={className}>
      <Ticker spring={spring} />
      {suffix}
    </span>
  )
}

function Ticker({ spring }) {
  const spanRef = useRef(null)
  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      if (spanRef.current) spanRef.current.textContent = Math.round(v)
    })
    return unsub
  }, [spring])
  return <span ref={spanRef}>{Math.round(spring.get())}</span>
}
