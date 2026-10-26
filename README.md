# HabitSense AI

A real-time, privacy-first computer vision system that notices body-focused
repetitive behaviors (BFRBs) as they're happening, and gives a gentle nudge.

It recognises **9 habits**: nail biting, hair pulling, face touching, lip
biting, nose picking, eye rubbing, skin picking, chewing on objects, and
chin/cheek resting (flagged as posture, not a BFRB). Three more are optional,
off by default and rule-based rather than learned: slouching (camera), teeth
grinding and knuckle cracking (microphone).

This is a working project with a genuine trainable ML pipeline behind it,
not a mockup. See **"What's real and what's honestly a proxy"** below before
anything else — it matters for a tool like this.

## Quickstart

You need two terminals (backend + frontend) and Node 18+ / Python 3.10+.

```bash
# Terminal 1 — backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in Chrome, grant camera access, and go to
**Live detection**. For the model to personalize to you, run **Calibrate**
first: one rep is 6 seconds of the habit plus 4.5 seconds of a neutral pose.
Record each habit twice so the accuracy score is measured honestly (see below).

Run the model tests from `backend/` with `python -m unittest discover tests`.

## Architecture

```
 Webcam ──▶ MediaPipe FaceLandmarker + HandLandmarker   (in the browser, two Web Workers)
              │
              ▼
        478 face points + 21 points per hand            (video never leaves the tab)
              │
              ├──▶ in-browser feature engine (28 numbers) ──▶ calibration samples,
              │                                              offline rule-based fallback
              ▼  ~5×/sec, numbers only
     FastAPI backend on 127.0.0.1
        28 geometric features ──▶ prior model (synthetic) ┐
                                  personal model (yours) ─┴▶ blended probabilities, 10 classes
              │
              ▼
     Browser: smoothing + threshold + dwell time ──▶ gentle reminder, logged event
              │
              ▼
     SQLite (sessions, events, calibration samples) ──▶ Dashboard, JSON/CSV export
```

The frontend is React + Vite + Tailwind + Framer Motion, with a Three.js
(`@react-three/fiber`) shader-driven orb as the live-state centerpiece.

## What's real, and what's honestly a proxy

- **The computer vision is 100% real**: Google's production MediaPipe
  FaceLandmarker and HandLandmarker models, run live, unmodified.
- **The geometric features are real, documented signal**: 28 numbers per
  frame, e.g. nail biting = a fingertip sustained at the mouth with the other
  fingers curled. The key part is a contact map: which fingertip is closest to
  which face region (mouth, cheek, jaw, eyebrow/forehead, nose, eye, scalp).
- **The classifier is a real, retrainable scikit-learn model** (StandardScaler
  + RandomForest). It ships with a synthetic prior (openly documented in
  `backend/app/ml/seed_data.py`), because no ethically-sourced labeled video
  dataset of these behaviors exists. Calibrating trains a second, personal
  model on your own recordings, and the two are blended — see
  `backend/app/ml/classifier.py`. Calibrating one habit improves that habit
  without hurting the ones you haven't calibrated yet.
- **Accuracy is reported honestly**: the cross-validated score after
  calibration is computed on your real samples only, and split by recording
  rep when you have recorded each habit at least twice. The prior scores 100%
  on its own synthetic data, which says nothing about real use.
- **Detection is smoothed over time**: the browser averages the last few
  predictions and only reminds you once a habit stays on top for its dwell
  time (1.2–2.5 s), so a hand brushing past your face doesn't trigger it.
- **Weaker signals are disclosed**: lip biting has no hand to measure against
  (it's inferred from mouth shape alone) and chewing is a coarser pattern, so
  the UI labels both "moderate confidence". MediaPipe has no hair points, so
  the scalp region is extrapolated from the forehead and temples.
- **Privacy**: video frames never leave the browser tab. Only numbers
  (landmark coordinates or feature vectors — never pixels) are sent to the
  backend, which runs on your own machine. The only outbound network call to
  a third party is the one-time download of MediaPipe's model weight files
  from Google's public CDN.

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
