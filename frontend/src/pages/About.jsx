import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Sparkles, LockKeyhole, HeartHandshake } from 'lucide-react'
import Panel from '../components/ui/Panel'
import SectionLabel from '../components/ui/SectionLabel'
import PaperAmbientField from '../components/ui/PaperAmbientField'

gsap.registerPlugin(ScrollTrigger)

const FEATURES = [
  'min_fingertip_to_mouth_dist', 'min_fingertip_to_hairline_dist', 'min_fingertip_to_face_dist',
  'hand_above_forehead', 'hand_height_norm', 'mouth_compression_ratio', 'mouth_asymmetry',
  'finger_curl_score', 'thumb_or_index_isolated', 'pinch_grip_score', 'hand_velocity_norm',
  'dwell_time_norm', 'head_tilt_norm', 'num_hands_present', 'hand_face_overlap',
  'nearest_region_mouth', 'nearest_region_cheek', 'nearest_region_jaw',
  'nearest_region_eyebrow_forehead', 'nearest_region_scalp', 'nearest_region_nose',
  'nearest_region_eye', 'nearest_region_dist', 'closest_finger_is_thumb',
  'closest_finger_is_index', 'closest_finger_is_middle', 'closest_finger_is_ring',
  'closest_finger_is_pinky',
]

export default function About() {
  const containerRef = useRef(null)

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        gsap.utils.toArray('.about-section').forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 24,
            duration: 0.55,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
          })
        })
      }, containerRef)
      return () => ctx.revert()
    })
    return () => mm.revert()
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
      <PaperAmbientField />
      <div ref={containerRef} className="relative max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-16">
        <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">
          <Sparkles size={13} /> About HabitSense
        </p>
        <h1 className="font-display text-5xl tracking-[-.03em] text-[#1c3731]">Curiosity over correction.</h1>
        <p className="mt-5 text-base leading-relaxed text-[#68756d]">
          HabitSense is a calm self-awareness tool for noticing body-focused habits — every
          claim below is about what this specific app actually does, not a generic pitch.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Panel className="p-6">
            <LockKeyhole className="text-[#65988c]" size={20} />
            <h2 className="mt-5 font-display text-2xl text-[#31554b]">Private by design</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#718078]">
              Video frames never leave your browser tab. Only numeric landmark coordinates reach
              the backend running on your own machine.
            </p>
          </Panel>
          <Panel className="p-6">
            <HeartHandshake className="text-[#bc8c6b]" size={20} />
            <h2 className="mt-5 font-display text-2xl text-[#31554b]">Neutral by default</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#718078]">
              Every signal is an observation to consider, never a score to chase or a label to
              carry — see "self-awareness, not diagnosis" below.
            </p>
          </Panel>
        </div>

        <div className="mt-10">
          <SectionLabel>How it actually works</SectionLabel>
        </div>

        <Section title="The tracking is real, pretrained, and from Google">
          <p>
            HabitSense runs Google's MediaPipe FaceLandmarker and HandLandmarker directly in your
            browser via WebAssembly. These are the same production-grade models used across
            MediaPipe Solutions — 478 face points, 21 points per hand, up to two hands, all
            running locally. Nothing about the tracking layer is a placeholder or a mock.
          </p>
        </Section>

        <Section title="The features are documented geometry, not magic">
          <p className="mb-3">
            Every frame is reduced to 28 numbers — distances, angles, curl, a pinch-grip shape,
            dwell time, and a region/finger contact map — each with a plain-language meaning:
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-[#8a948d]">
            {FEATURES.map((f) => (
              <div key={f}>· {f}</div>
            ))}
          </div>
        </Section>

        <Section title="The classifier is real and honestly bootstrapped">
          <p className="mb-3">
            There's no ethically-sourced public dataset of people biting their nails or pulling
            their hair on video, and this project has no GPU or camera to record and label one.
            Rather than pretend otherwise, the classifier ships with a synthetic prior: feature
            vectors sampled from the same documented geometric rules above (e.g. "nail biting
            looks like one fingertip sustained at the mouth with the other fingers curled"),
            with randomized noise, so the app works reasonably on first launch.
          </p>
          <p>
            The moment you run <span className="text-[#1c3731] font-medium">Calibrate</span>, your own real,
            labeled feature vectors are stored and the model is retrained — a real scikit-learn
            RandomForest, refit from scratch — with your samples weighted heavily enough to
            meaningfully personalize the result. You can watch the cross-validated accuracy
            change when you do this.
          </p>
        </Section>

        <Section title="Every frame tracks which finger touched which region">
          <p>
            Beyond raw distances, HabitSense computes roughly 125 points across named face
            regions — mouth, left/right cheek, left/right jaw, eyebrows, forehead sides, nose,
            left/right eye, and an extrapolated scalp/temple area — and on every frame identifies
            the single closest fingertip-to-region pair: which finger, which region, how close.
            That specific pairing (e.g. "index finger, mouth, very close" vs. "middle finger,
            cheek, very close") is what actually separates nail-biting from face-touching, rather
            than just a blur of "something is near something."
          </p>
        </Section>

        <Section title="Not every habit has an equally strong signal, on purpose disclosed">
          <p>
            Most habits here have a hand you can measure against the face — a strong, direct
            geometric signal. Lip biting has no hand involved at all, so it's inferred purely from
            mouth-compression geometry, a much softer signal. Chewing on objects is hand-based but
            coarser still: it deliberately skips the crisp isolated-finger shape nail-biting relies
            on, since a held pen is gripped differently than a bitten fingernail. The app labels
            both "moderate confidence" rather than presenting every habit as equally certain.
          </p>
        </Section>

        <Section title="What actually leaves your device">
          <p>
            Video frames never leave your browser tab. What does get sent, over your own local
            network to the backend running on your own machine, is the small numeric feature
            vector (14 floats) or, for the full pipeline, the raw landmark coordinates (a few
            hundred x/y/z numbers) — never an image or video frame. That backend is code you're
            running yourself; nothing is sent to Anthropic, Google, or any third-party server
            except the one-time download of the pretrained model weight files from Google's
            public model CDN.
          </p>
        </Section>

        <Section title="Posture and audio habits are heuristics, not trained models, and off by default">
          <p className="mb-3">
            Chin/cheek-resting still runs through the same classifier as every habit above. But
            full posture-slouching and the two audio habits (teeth grinding, knuckle cracking) are
            different in kind, and the app is upfront about that difference rather than blurring
            it:
          </p>
          <ul className="space-y-2 list-disc list-inside">
            <li>
              <span className="text-[#1c3731] font-medium">Posture</span> uses MediaPipe's body pose model to
              compare your current shoulder/neck geometry against a short baseline captured at the
              start of your own session — not an absolute "correct posture" standard, since that
              depends entirely on your camera distance and body proportions. It's also flagged
              throughout the app as posture, not a compulsive or self-injurious behavior like the
              BFRBs above.
            </li>
            <li>
              <span className="text-[#1c3731] font-medium">Audio habits</span> analyze microphone input with
              plain signal processing (sustained energy in a friction-noise band for grinding, a
              sharp isolated transient for cracking) — there's no labeled audio dataset for these
              sounds any more than there's a video one, so this doesn't pretend to be a trained
              classifier. Raw audio is never recorded or uploaded, only the detection result.
            </li>
          </ul>
          <p className="mt-3">
            Both require an explicit consent screen the first time you turn them on, and both stay
            off until you opt in from Settings — camera-based BFRB detection is the app's core
            purpose; these are secondary, clearly-labeled additions.
          </p>
        </Section>

        <Section title="This is a self-awareness tool, not a diagnosis">
          <p>
            Body-focused repetitive behaviors like nail biting, hair pulling (trichotillomania),
            skin/lip picking, and compulsive face touching are common and often outside conscious
            awareness. This tool is meant to build awareness of your own patterns — it does not
            diagnose, treat, or replace care from a therapist or clinician, and if these behaviors
            are causing you distress or physical harm, a professional can help far more than an
            app can.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="about-section mb-9 pb-9 border-b border-[#233b35]/10 last:border-0">
      <h2 className="text-lg font-semibold text-[#28453c] mb-3">{title}</h2>
      <div className="text-[#5f6d65] text-sm leading-relaxed">{children}</div>
    </div>
  )
}
