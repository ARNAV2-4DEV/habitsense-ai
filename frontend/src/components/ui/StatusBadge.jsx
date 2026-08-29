// Paper-theme pill badge, ported from the design reference's visuals.jsx
// StatusBadge.
const TONES = {
  clear: 'border-[#72a89c]/30 bg-[#e4f0e8] text-[#31675c]',
  watch: 'border-[#d39a72]/30 bg-[#f8e9dd] text-[#8b553f]',
  uncertain: 'border-[#bd9d58]/35 bg-[#f4edda] text-[#7a632d]',
  neutral: 'border-[#233b35]/15 bg-white/60 text-[#69766e]',
}

export default function StatusBadge({ tone = 'clear', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.1em] ${TONES[tone] || TONES.neutral}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
