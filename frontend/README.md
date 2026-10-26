# HabitSense AI — Frontend

React + Vite app. Runs Google's MediaPipe FaceLandmarker and HandLandmarker
live in the browser (WebAssembly), draws a reactive Three.js aura that
tracks detection state, and talks to the local FastAPI backend for
personalized classification, calibration, and analytics.

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:5173. Make sure the backend is running at
`http://127.0.0.1:8000` first (see `../backend/README.md`) — the app still
works with the backend offline (it falls back to a local geometric
heuristic), but personalization and analytics need it.

To point at a different backend URL, create a `.env` file:

```
VITE_API_URL=http://127.0.0.1:8000
```

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```

## Structure

```
src/
  lib/
    mediapipeSetup.js      # loads Google's real pretrained CV models
    detectionWorkerClient.js # runs face + hand models in two parallel Web Workers
    featureExtraction.js   # JS mirror of the backend's 28 geometric features
    qualityGates.js        # rejects bad calibration reps before upload
    oneEuroFilter.js       # smooths the on-screen skeleton (display only)
    postureFeatures.js     # opt-in slouch detection (rule-based)
    audioDetection.js      # opt-in teeth grinding / knuckle cracking (rule-based)
    consent.js             # explicit camera/mic consent gate
    api.js                 # backend client
    chime.js               # Web Audio gentle notification sound
  workers/
    mediapipeWorker.js     # one MediaPipe model per worker thread
  hooks/
    useDetectionEngine.js  # webcam → landmarks → backend → smoothing + dwell → events
    useCalibrationCapture.js
  state/store.js           # Zustand: settings + live session state
  components/
    three/AuraOrb.jsx      # reactive shader orb (react-three-fiber)
    detection/              # camera stage + landmark HUD + reminder toast
    layout/                 # sidebar + mobile nav
  pages/                   # Home, Live, Calibrate, Dashboard, Settings, About
```

## Browser requirements

- A webcam and permission to use it.
- WebGL (for the Three.js orb) and WebAssembly (for MediaPipe) — any modern
  Chrome, Edge, Firefox, or Safari works.
- On first launch, MediaPipe downloads its model weight files (a few MB)
  from Google's public model CDN; they're cached by the browser afterward.
