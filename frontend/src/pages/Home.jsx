import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowUpRight, ScanFace, Hand, Sparkle, ShieldCheck, Timer, BrainCircuit } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import AuraOrb from '../components/three/AuraOrb'
import MagneticButton from '../components/ui/MagneticButton'
import TiltCard from '../components/ui/TiltCard'
import Marquee from '../components/ui/Marquee'
import CountUp from '../components/ui/CountUp'

gsap.registerPlugin(ScrollTrigger)

const MotionLink = motion(Link)

const HABITS = [
  { label: 'Nail biting', icon: Hand, confidence: 'high signal' },
  { label: 'Hair pulling', icon: ScanFace, confidence: 'high signal' },
  { label: 'Face touching', icon: Hand, confidence: 'high signal' },
  { label: 'Lip biting', icon: ScanFace, confidence: 'moderate signal' },
  { label: 'Nose picking', icon: Hand, confidence: 'high signal' },
  { label: 'Eye rubbing', icon: ScanFace, confidence: 'high signal' },
  { label: 'Skin picking', icon: Hand, confidence: 'high signal' },
  { label: 'Chewing on objects', icon: ScanFace, confidence: 'moderate signal' },
  { label: 'Chin/cheek resting', icon: Hand, confidence: 'posture, not a BFRB' },
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
  const heroRef = useRef(null)
  const stepsRef = useRef(null)

  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const orbY = useTransform(heroProgress, [0, 1], [0, -60])
  const blobsY = useTransform(heroProgress, [0, 1], [0, 90])

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        gsap.utils.toArray('.how-step').forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 32,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' },
          })
          gsap.to(el.querySelector('.how-step-num'), {
            color: '#5ee7c8',
            scrollTrigger: { trigger: el, start: 'top 60%', end: 'bottom 40%', scrub: 0.6 },
          })
        })
      }, stepsRef)
      return () => ctx.revert()
    })
    return () => mm.revert()
  }, [])

  return (
    <div className="relative overflow-hidden">
      {/* ambient backdrop glow, not a stock gradient mesh */}
      <motion.div style={{ y: blobsY }} className="pointer-events-none absolute -top-40 left-1/3 w-[600px] h-[600px] rounded-full bg-aura-calm/10 blur-[140px]" />
      <motion.div style={{ y: blobsY }} className="pointer-events-none absolute top-96 -right-20 w-[400px] h-[400px] rounded-full bg-aura-watch/10 blur-[120px]" />

      <div ref={heroRef} className="relative max-w-6xl mx-auto px-6 md:px-10 pt-14 md:pt-20">
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
              <MagneticButton
                as={MotionLink}
                to="/live"
                className="group cursor-pointer inline-flex items-center gap-2 bg-white text-ink-950 font-medium text-sm rounded-full pl-5 pr-4 py-3 shadow-[0_0_0_0_rgba(94,231,200,0)] hover:shadow-[0_0_32px_-4px_rgba(94,231,200,0.55)] hover:bg-aura-calm transition-[background-color,box-shadow] duration-300"
              >
                Start a live session
                <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </MagneticButton>
              <Link
                to="/about"
                className="text-sm text-white/60 hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
              >
                Read how the detection actually works
              </Link>
            </div>
          </motion.div>

          <motion.div
            style={{ y: orbY }}
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
      </div>

      {/* habit marquee - two rows, opposite directions, pauses on hover */}
      <div className="mt-16 md:mt-20 space-y-3">
        <Marquee speed={34}>
          {HABITS.slice(0, 5).map(({ label, icon: Icon, confidence }) => (
            <HabitChip key={label} label={label} Icon={Icon} confidence={confidence} />
          ))}
        </Marquee>
        <Marquee speed={38} reverse>
          {HABITS.slice(4).map(({ label, icon: Icon, confidence }) => (
            <HabitChip key={label} label={label} Icon={Icon} confidence={confidence} />
          ))}
        </Marquee>
      </div>

      {/* how it works - editorial numbered list, staggered offsets */}
      <div ref={stepsRef} className="relative max-w-6xl mx-auto px-6 md:px-10 mt-28 md:mt-36">
        <h2 className="font-display text-2xl md:text-3xl tracking-tight mb-12 max-w-md">
          Not a black box. Here's exactly what's computing.
        </h2>
        <div className="space-y-10">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={`how-step grid md:grid-cols-[80px_1fr] gap-4 md:gap-8 pb-10 border-b border-white/[0.06] ${
                i % 2 === 1 ? 'md:pl-16' : ''
              }`}
            >
              <div className="how-step-num font-mono text-white/25 text-sm transition-colors">{step.n}</div>
              <div className="max-w-xl">
                <h3 className="text-lg md:text-xl font-medium mb-2">{step.title}</h3>
                <p className="text-white/55 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* trust bento - one big stat tile anchors the grid instead of three
          uniform cards, mixed tile sizes read as considered, not templated */}
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 mt-16 mb-28">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4 lg:auto-rows-[150px]">
          <BentoTile className="lg:col-span-2 lg:row-span-2" glowColor="#5ee7c8">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-5">Watching, live</div>
            <div className="space-y-4">
              <Stat value={478} label="face points tracked" />
              <Stat value={21} label="points per hand" />
              <Stat value={14} label="engineered signals per frame" />
            </div>
          </BentoTile>
          <BentoTile className="lg:col-span-2" glowColor="#7c9cf5">
            <ShieldCheck size={20} className="text-aura-calm mb-3" strokeWidth={1.6} />
            <h4 className="font-medium mb-1.5">Video never leaves your device</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              Landmark tracking runs in-browser via WebAssembly. Only small numeric feature
              vectors — never frames or images — reach your own local backend.
            </p>
          </BentoTile>
          <BentoTile glowColor="#f5a35e">
            <BrainCircuit size={20} className="text-aura-calm mb-3" strokeWidth={1.6} />
            <h4 className="font-medium mb-1.5">Actually retrainable</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              Watch cross-validated accuracy change as you calibrate.
            </p>
          </BentoTile>
          <BentoTile glowColor="#f5647c">
            <Timer size={20} className="text-aura-calm mb-3" strokeWidth={1.6} />
            <h4 className="font-medium mb-1.5">Dwell-based, not twitchy</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              A passing touch won't trigger anything.
            </p>
          </BentoTile>
        </div>
      </div>
    </div>
  )
}

function HabitChip({ label, Icon, confidence }) {
  return (
    <div className="shrink-0 flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 whitespace-nowrap">
      <Icon size={16} className="text-aura-calm" strokeWidth={1.75} />
      <span className="text-sm">{label}</span>
      <span className="text-[10px] uppercase tracking-wide text-white/35">{confidence}</span>
    </div>
  )
}

function BentoTile({ children, className = '', glowColor }) {
  return (
    <TiltCard
      glowColor={glowColor}
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 overflow-hidden hover:border-white/[0.14] transition-colors flex flex-col justify-center ${className}`}
    >
      {children}
    </TiltCard>
  )
}

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display text-3xl text-white tabular-nums">
        <CountUp value={value} />
      </span>
      <span className="text-sm text-white/50">{label}</span>
    </div>
  )
}
