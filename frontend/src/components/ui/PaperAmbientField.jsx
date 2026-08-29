// Light "paper" theme ambient background, ported from the design
// reference's visuals.jsx AmbientField -- same look (thin drifting outline
// shapes, a soft two-tone radial wash, a faint grid texture), but the drift
// is CSS keyframes (.paper-field-a/b in index.css) instead of framer-motion.
// Used on every paper-themed page (Live, Calibrate, Dashboard, Settings,
// About); CSS-only matters most on Live and Calibrate, which run MediaPipe
// inference continuously, so the background must never compete with that
// loop for CPU/GPU -- kept the same everywhere for one consistent look.
export default function PaperAmbientField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-70">
      <div className="paper-field-a absolute -left-24 top-20 h-72 w-[70%] rounded-full border border-[#8bb9ad]/15" />
      <div className="paper-field-b absolute -right-40 top-1/3 h-96 w-[65%] rounded-full border border-[#b6a9d1]/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(121,174,161,.08),transparent_28%),radial-gradient(circle_at_82%_64%,rgba(159,139,197,.07),transparent_26%)]" />
      <div className="absolute inset-0 opacity-[.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:54px_54px]" />
    </div>
  )
}
