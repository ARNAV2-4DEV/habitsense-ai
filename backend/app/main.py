from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, engine
from . import models  # noqa: F401  (registers tables on Base.metadata)
from .routers import detect, calibration, sessions, analytics, export
from .ml.classifier import get_classifier, get_prior_model

Base.metadata.create_all(bind=engine)


def _ensure_calibration_variant_column():
    # create_all() only creates missing TABLES, not missing columns on
    # existing ones. calibration_samples predates the "variant" tag, so add
    # it in place rather than dropping/recreating the table and losing
    # anyone's already-recorded sessions/events.
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("calibration_samples")]
    if "variant" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE calibration_samples ADD COLUMN variant VARCHAR"))


def _ensure_events_notes_column():
    # events predates the Phase 6 trigger-notes field -- add it in place for
    # the same reason as the variant column above (don't drop/recreate and
    # lose anyone's already-logged sessions/events).
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("events")]
    if "notes" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE events ADD COLUMN notes VARCHAR"))


_ensure_calibration_variant_column()
_ensure_events_notes_column()

app = FastAPI(
    title="HabitSense AI Backend",
    description=(
        "Local-first backend for HabitSense AI. Receives numeric landmark "
        "coordinates (never raw video/images) from the browser, extracts "
        "geometric features, and runs a real, retrainable scikit-learn "
        "classifier that personalizes to each user via the Calibration flow."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
app.include_router(calibration.router)
app.include_router(sessions.router)
app.include_router(analytics.router)
app.include_router(export.router)


@app.on_event("startup")
def prewarm_classifiers():
    # Training/loading takes ~1-1.5s. Doing it here, once, while the server
    # is starting up, means the frontend's first real request never has to
    # wait on it. The prior model is a shared singleton across all profiles
    # -- fit once here, never per-profile, never per-request.
    get_prior_model()
    get_classifier("default")


@app.get("/")
def root():
    return {
        "service": "HabitSense AI Backend",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
