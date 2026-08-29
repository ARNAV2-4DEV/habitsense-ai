import { ShieldCheck } from 'lucide-react'

// Paper-theme privacy reassurance panel, ported from the design reference's
// visuals.jsx PrivacyNote -- but with our own accurate copy (the reference's
// was generic placeholder text for a fully-mocked demo).
export default function PrivacyPanel({ children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#70a999]/20 bg-[#e5f0e8]/60 p-3 text-[11px] leading-relaxed text-[#557269]">
      <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#559487]" />
      <span>{children}</span>
    </div>
  )
}
