"""
Phase 6: plain data export of a profile's own sessions/events/calibration
data. No server-side gating -- this is local-first data about one person's
own device, not a multi-tenant service with accounts to authorize against.
"""
import csv
import io
import json
import time
import zipfile
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DetectionSession, DetectionEvent, CalibrationSample

router = APIRouter(prefix="/export", tags=["export"])


def _session_dict(s):
    return {
        "id": s.id, "profile_id": s.profile_id, "started_at": s.started_at,
        "ended_at": s.ended_at, "habits_enabled": s.habits_enabled,
    }


def _event_dict(e):
    return {
        "id": e.id, "session_id": e.session_id, "habit": e.habit, "confidence": e.confidence,
        "started_at": e.started_at, "ended_at": e.ended_at, "duration_sec": e.duration_sec,
        "dismissed": e.dismissed, "notes": e.notes,
    }


def _sample_dict(c):
    return {
        "id": c.id, "profile_id": c.profile_id, "habit": c.habit, "variant": c.variant,
        "created_at": c.created_at, "feature_vector": c.feature_vector,
    }


def _to_csv(rows):
    if not rows:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for row in rows:
        row = dict(row)
        # Nested JSON-ish columns don't fit a flat CSV cell -- serialize them
        # rather than silently dropping the data.
        for key in ("feature_vector", "habits_enabled"):
            if isinstance(row.get(key), list):
                row[key] = json.dumps(row[key])
        writer.writerow(row)
    return output.getvalue()


@router.get("/{profile_id}")
def export_profile(profile_id: str, format: str = Query("json", pattern="^(json|csv)$"), db: Session = Depends(get_db)):
    sessions = db.query(DetectionSession).filter_by(profile_id=profile_id).all()
    session_ids = [s.id for s in sessions]
    events = (
        db.query(DetectionEvent).filter(DetectionEvent.session_id.in_(session_ids)).all()
        if session_ids else []
    )
    samples = db.query(CalibrationSample).filter_by(profile_id=profile_id).all()

    if format == "json":
        payload = {
            "profile_id": profile_id,
            "exported_at": time.time(),
            "sessions": [_session_dict(s) for s in sessions],
            "events": [_event_dict(e) for e in events],
            "calibration_samples": [_sample_dict(c) for c in samples],
        }
        return JSONResponse(
            content=payload,
            headers={"Content-Disposition": f'attachment; filename="habitsense_{profile_id}_export.json"'},
        )

    # Three tables with unrelated columns don't fit one flat CSV -- bundle as
    # a small zip of three CSVs instead of lossily flattening them together.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("sessions.csv", _to_csv([_session_dict(s) for s in sessions]))
        zf.writestr("events.csv", _to_csv([_event_dict(e) for e in events]))
        zf.writestr("calibration_samples.csv", _to_csv([_sample_dict(c) for c in samples]))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="habitsense_{profile_id}_export.zip"'},
    )
