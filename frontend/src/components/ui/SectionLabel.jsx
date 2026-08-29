// Paper-theme mono uppercase section heading, ported from the design
// reference's visuals.jsx SectionLabel.
export default function SectionLabel({ children, detail }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#748079]">
        {children}
      </h2>
      {detail && <span className="text-[11px] text-[#8a948d]">{detail}</span>}
    </div>
  )
}
