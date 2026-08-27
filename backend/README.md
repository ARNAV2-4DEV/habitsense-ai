# HabitSense AI — Backend

FastAPI service that receives numeric landmark/feature data from the frontend
(never raw video), extracts geometric features, and runs a real, retrainable
scikit-learn classifier.

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
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
- **The classifier** (`app/ml/classifier.py`): a genuine
  `StandardScaler + RandomForestClassifier` pipeline. It bootstraps from a
  synthetic dataset generated from the same documented geometric rules
  (`app/ml/seed_data.py` — openly documented as synthetic, not real recorded
  human data, because no such ethically-sourced dataset was available), and
  retrains for real when you record calibration samples in the frontend's
  Calibrate flow.
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
| GET    | `/detect/feature-schema`          | The 14 feature names, in order             |
| POST   | `/calibration/samples`            | Store one labeled calibration sample       |
| GET    | `/calibration/samples/{profile}`  | Sample counts by habit                     |
| DELETE | `/calibration/samples/{profile}`  | Clear calibration data                     |
| POST   | `/calibration/retrain`            | Retrain the classifier on stored samples   |
| GET    | `/calibration/status/{profile}`   | Model metadata (accuracy, sample count)    |
| POST   | `/events`                         | Log a detection event                      |
| POST   | `/events/dismiss`                 | Mark an event as a false positive          |
| GET    | `/analytics/summary/{profile}`    | Aggregated dashboard data                  |

## Testing it without the frontend

```bash
curl -X POST http://127.0.0.1:8000/sessions -H "Content-Type: application/json" -d '{"profile_id":"default"}'
curl http://127.0.0.1:8000/calibration/status/default
```
