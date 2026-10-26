# HabitSense AI — Backend

FastAPI service that receives numeric landmark/feature data from the frontend
(never raw video), extracts geometric features, and runs a real, retrainable
scikit-learn classifier.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --port 8000
```

- API docs (interactive): http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

On first run, `storage/` is created automatically with:
- `habitsense.db` — SQLite database (sessions, events, calibration samples)
- `models/default.joblib` — the trained classifier for the "default" profile

## What's real here

- **Feature extraction** (`app/ml/features.py`, `app/ml/landmarks.py`): every
  number is a documented geometric relationship between MediaPipe face/hand
  landmark points (distances, angles, dwell time). No raw pixels are ever
  processed server-side.
- **The classifier** (`app/ml/classifier.py`): two genuine
  `StandardScaler + RandomForestClassifier` pipelines (200 trees, depth 10)
  over 10 classes (9 habits + `none`).
  - The **prior** is trained once at startup on 2,200 synthetic vectors
    generated from the documented geometric rules (`app/ml/seed_data.py` —
    openly synthetic, because no ethically-sourced recorded dataset exists).
  - The **personal** model is trained on your real calibration samples. It
    also learns an extra `__other__` class (synthetic examples of habits you
    haven't calibrated) so it can say "not one of mine" instead of forcing
    every frame into the habits it knows.
  - At prediction time the personal model's `__other__` share is spread over
    the uncalibrated habits in the prior's proportions, then blended with the
    prior. The personal weight grows with your sample count: 0 below 8
    samples, 0.3 → 0.85 between 8 and 25, capped at 0.9.
  - Cross-validated accuracy is computed on real samples only, split by
    recording rep when every calibrated habit has at least two reps
    (`cv_method: "across reps"`); otherwise it's flagged
    `"within reps (optimistic)"`.
- **Analytics** (`app/routers/analytics.py`): plain aggregation over your own
  logged `DetectionEvent` rows — streaks, daily series, hour-of-day
  distribution. Nothing is precomputed or faked.

## API surface

| Method | Path                              | Purpose                                   |
|--------|-----------------------------------|--------------------------------------------|
| POST   | `/sessions`                       | Start a detection session                  |
| POST   | `/sessions/end`                   | End a session                              |
| GET    | `/sessions/{profile_id}`          | List past sessions                         |
| POST   | `/detect/infer`                   | Raw landmarks → habit probabilities        |
| POST   | `/detect/infer-from-features`     | Feature vector → habit probabilities       |
| GET    | `/detect/feature-schema`          | The 28 feature names, in order             |
| POST   | `/detect/reset-session-state/{id}`| Clear per-session dwell/velocity state     |
| POST   | `/calibration/samples`            | Store one labeled calibration sample       |
| POST   | `/calibration/samples/batch`      | Store one whole calibration rep at once    |
| GET    | `/calibration/samples/{profile}`  | Sample counts by habit                     |
| DELETE | `/calibration/samples/{profile}`  | Clear calibration data                     |
| POST   | `/calibration/retrain`            | Retrain the classifier on stored samples   |
| GET    | `/calibration/status/{profile}`   | Model metadata (accuracy, sample count)    |
| POST   | `/events`                         | Log a detection event                      |
| POST   | `/events/dismiss`                 | Mark an event as a false positive          |
| POST   | `/events/note`                    | Attach a trigger note to an event          |
| GET    | `/analytics/summary/{profile}`    | Aggregated dashboard data                  |
| GET    | `/export/{profile}?format=json\|csv` | Download all your data                  |

## Tests

```bash
python -m unittest discover tests
```

Covers the blend (calibrating one habit must not bury the others), honest
cross-validation, save/reload, no-face handling and input validation.

## Testing it without the frontend

```bash
curl -X POST http://127.0.0.1:8000/sessions -H "Content-Type: application/json" -d '{"profile_id":"default"}'
curl http://127.0.0.1:8000/calibration/status/default
```
