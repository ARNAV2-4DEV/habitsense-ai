# HabitSense AI

A real-time, privacy-first computer vision system that notices body-focused
repetitive behaviors — nail biting, hair pulling, face touching, lip biting —
as they're happening, and gives a gentle nudge.

This is a working project with a genuine trainable ML pipeline behind it,
not a mockup. See **"What's real and what's honestly a proxy"** below before
anything else — it matters for a tool like this.

## Quickstart

You need two terminals (backend + frontend) and Node 18+ / Python 3.10+.

```bash
# Terminal 1 — backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**, grant camera access, and go to **Live
detection**. For the model to personalize to you, run **Calibrate** first —
it takes about two minutes per habit.

## Architecture

```
 Webcam ──▶ MediaPipe FaceLandmarker + HandLandmarker  (in-browser, WASM)
              │
              ▼
        478 face points + 21×N hand points  (never leaves the browser as video)
              │
              ▼
   Geometric feature engine (14 numbers: distances, dwell time, finger curl…)
              │
              ├──▶ instant local heuristic (zero latency, always available)
              │
              ▼
     FastAPI backend (localhost) ──▶ scikit-learn RandomForest classifier
              │                         (bootstrapped from a documented
              ▼                          synthetic prior, retrained on your
   SQLite (sessions, events,             real calibration samples)
   calibration samples)
              │
              ▼
      Analytics dashboard (Recharts) — real aggregation of your own data
```

The frontend is React + Vite + Tailwind + Framer Motion, with a Three.js
(`@react-three/fiber`) shader-driven orb as the live-state centerpiece.

## What's real, and what's honestly a proxy

- **The computer vision is 100% real**: Google's production MediaPipe
  FaceLandmarker and HandLandmarker models, run live, unmodified.
- **The geometric features are real, documented signal**: e.g. nail biting
  = a fingertip sustained at the mouth with the other fingers curled into a
  fist. These are the same descriptions a clinician would use.
- **The classifier is a real, retrainable scikit-learn model** — not a
  static ruleset dressed up to look like ML. It ships with a synthetic
  bootstrap dataset (openly documented in `backend/app/ml/seed_data.py`)
  because no ethically-sourced labeled video dataset of these behaviors was
  available to train on, and this project has no camera/GPU to record one.
  The Calibrate flow replaces that synthetic prior with your own real,
  labeled examples, and the model is genuinely refit — you can watch the
  cross-validated accuracy change.
- **Lip biting is disclosed as a weaker signal** than the other three,
  because it has no hand-to-face geometry to anchor on — it's inferred from
  mouth shape alone. The UI says so rather than presenting all four as
  equally confident.
- **Privacy**: video frames never leave the browser tab. Only small numeric
  vectors (feature values or raw landmark coordinates — never pixels) are
  sent to the backend, which runs on your own machine. The only outbound
  network call to a third party is the one-time download of MediaPipe's
  model weight files from Google's public CDN.

## This is a self-awareness tool, not a medical device

Body-focused repetitive behaviors (nail biting, hair pulling/trichotillomania,
skin/lip picking, compulsive touching) are common and often happen outside
conscious awareness. HabitSense is built to increase awareness of your own
patterns. It does not diagnose or treat anything, and isn't a substitute for
a therapist or clinician if these behaviors are causing distress or harm.

## Repo layout

```
backend/    FastAPI + SQLite + scikit-learn — see backend/README.md
frontend/   React + Vite + Three.js + MediaPipe — see frontend/README.md
```
