// Paper-theme card container, ported from the Emergent design reference's
// visuals.jsx Panel. Purely presentational -- used by the light-themed pages
// as they get redesigned (currently just Live).
export default function Panel({ children, className = '', as: Tag = 'section' }) {
  return (
    <Tag
      className={`rounded-2xl border border-[#233b35]/10 bg-white/48 shadow-[0_12px_32px_rgba(49,65,56,.045)] ${className}`}
    >
      {children}
    </Tag>
  )
}
