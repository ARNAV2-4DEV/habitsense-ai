import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, ScanFace, Hand, Sparkle, ShieldCheck, Timer, BrainCircuit } from 'lucide-react'
import AuraOrb from '../components/three/AuraOrb'

const HABITS = [
  { label: 'Nail biting', icon: Hand, confidence: 'high signal' },
  { label: 'Hair pulling', icon: ScanFace, confidence: 'high signal' },
  { label: 'Face touching', icon: Hand, confidence: 'high signal' },
  { label: 'Lip biting', icon: ScanFace, confidence: 'moderate signal' },
  { label: 'Nose picking', icon: Hand, confidence: 'high signal' },
  { label: 'Eye rubbing', icon: ScanFace, confidence: 'high signal' },
  { label: 'Skin picking', icon: Hand, confidence: 'high signal' },
  { label: 'Chewing on objects', icon: ScanFace, confidence: 'moderate signal' },
]

const STEPS = [
  {
    n: '01',
    title: 'Two pretrained models watch your hands and face',
    body: "Google's MediaPipe FaceLandmarker and HandLandmarker track 478 face points and 21 points per hand, live, at up to 30fps — entirely in your browser.",
  },
  {
    n: '02',
    title: 'A geometry engine turns points into meaning',
    body: 'Fingertip-to-mouth distance, dwell time, finger curl, hand height — fourteen engineered signals per frame, the same ones a clinician would describe out loud.',
  },
  {
    n: '03',
    title: 'A real classifier learns your specific movements',
    body: 'It ships with a sensible geometric prior and gets sharper every time you run the two-minute Calibration flow on your own webcam.',
  },
]

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* ambient backdrop glow, not a stock gradient mesh */}
      <div className="pointer-events-none absolute -top-40 left-1/3 w-[600px] h-[600px] rounded-full bg-aura-calm/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-96 -right-20 w-[400px] h-[400px] rounded-full bg-aura-watch/10 blur-[120px]" />

      <div className="relative max-w-6xl mx-auto px-6 md:px-10 pt-14 md:pt-20">
        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-aura-calm/90 border border-aura-calm/25 rounded-full px-3 py-1 mb-6">
              <Sparkle size={12} /> Real-time · on-device · trainable
            </div>
            <h1 className="font-display text-[2.6rem] leading-[1.05] md:text-[3.6rem] md:leading-[1.03] tracking-tight text-balance">
              A quiet witness for the habits you don't notice you're doing.
            </h1>
            <p className="mt-6 text-white/60 text-lg leading-relaxed max-w-lg">
              HabitSense watches your webcam feed the way a mirror does — never leaving your
              device — and gives you a gentle nudge the moment it notices a body-focused habit
              like nail biting, hair pulling, face touching, or eye rubbing settle into a
              sustained pattern.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/live"
                className="group inline-flex items-center gap-2 bg-white text-ink-950 font-medium text-sm rounded-full pl-5 pr-4 py-3 hover:bg-aura-calm transition-colors"
              >
                Start a live session
                <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                to="/about"
                className="text-sm text-white/60 hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
              >
                Read how the detection actually works
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative h-[340px] md:h-[440px]"
          >
            <AuraOrb className="w-full h-full" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/35 tracking-wide">
              idle — the orb calms when nothing's detected, warms when something is
            </div>
          </motion.div>
        </div>

        {/* habit chips - asymmetric row, not a uniform 3-card grid */}
        <div className="mt-16 md:mt-20 flex flex-wrap gap-3">
          {HABITS.map(({ label, icon: Icon, confidence }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
            >
              <Icon size={16} className="text-aura-calm" strokeWidth={1.75} />
              <span className="text-sm">{label}</span>
              <span className="text-[10px] uppercase tracking-wide text-white/35">{confidence}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* how it works - editorial numbered list, staggered offsets */}
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 mt-28 md:mt-36">
        <h2 className="font-display text-2xl md:text-3xl tracking-tight mb-12 max-w-md">
          Not a black box. Here's exactly what's computing.
        </h2>
        <div className="space-y-10">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={`grid md:grid-cols-[80px_1fr] gap-4 md:gap-8 pb-10 border-b border-white/[0.06] ${
                i % 2 === 1 ? 'md:pl-16' : ''
              }`}
            >
              <div className="font-mono text-aura-calm/70 text-sm">{step.n}</div>
              <div className="max-w-xl">
                <h3 className="text-lg md:text-xl font-medium mb-2">{step.title}</h3>
                <p className="text-white/55 leading-relaxed">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* trust strip */}
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 mt-16 mb-28">
        <div className="grid sm:grid-cols-3 gap-4">
          <TrustCard
            icon={ShieldCheck}
            title="Video never leaves your device"
            body="Landmark tracking runs in-browser via WebAssembly. Only small numeric feature vectors — never frames or images — reach your own local backend."
          />
          <TrustCard
            icon={BrainCircuit}
            title="A model you can actually retrain"
            body="Two minutes of calibration on your own movements meaningfully improves accuracy. You can see the training accuracy change, not just trust a claim."
          />
          <TrustCard
            icon={Timer}
            title="Dwell-based, not twitchy"
            body="A single passing touch won't trigger anything — detection requires a sustained posture, so reminders show up for patterns, not incidental movement."
          />
        </div>
      </div>
    </div>
  )
}

function TrustCard({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
      <Icon size={20} className="text-aura-calm mb-4" strokeWidth={1.6} />
      <h4 className="font-medium mb-2">{title}</h4>
      <p className="text-sm text-white/50 leading-relaxed">{body}</p>
    </div>
  )
}
