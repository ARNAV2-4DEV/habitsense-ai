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
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-3xl tracking-tight mb-8">How this actually works</h1>

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
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-white/50">
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
          The moment you run <span className="text-white/80">Calibrate</span>, your own real,
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
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-9 pb-9 border-b border-white/[0.06] last:border-0">
      <h2 className="text-lg font-medium mb-3">{title}</h2>
      <div className="text-white/55 text-sm leading-relaxed">{children}</div>
    </div>
  )
}
