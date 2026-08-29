import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import DetectionSession, DetectionEvent
from ..schemas import SessionCreate, SessionEnd, EventCreate, EventDismiss, EventNoteUpdate
from .detect import _SESSION_STATE

router = APIRouter(tags=["sessions"])


@router.post("/sessions")
def start_session(payload: SessionCreate, db: Session = Depends(get_db)):
    row = DetectionSession(
        profile_id=payload.profile_id,
        habits_enabled=payload.habits_enabled,
        started_at=time.time(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"session_id": row.id, "started_at": row.started_at}


@router.post("/sessions/end")
def end_session(payload: SessionEnd, db: Session = Depends(get_db)):
    row = db.query(DetectionSession).filter_by(id=payload.session_id).first()
    if not row:
        raise HTTPException(404, "session not found")
    row.ended_at = time.time()
    db.commit()
    _SESSION_STATE.pop(payload.session_id, None)
    duration = row.ended_at - row.started_at
    n_events = db.query(DetectionEvent).filter_by(session_id=row.id).count()
    return {"session_id": row.id, "duration_sec": duration, "n_events": n_events}


@router.get("/sessions/{profile_id}")
def list_sessions(profile_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(DetectionSession)
        .filter_by(profile_id=profile_id)
        .order_by(DetectionSession.started_at.desc())
        .limit(200)
        .all()
    )
    out = []
    for r in rows:
        n_events = db.query(DetectionEvent).filter_by(session_id=r.id).count()
        out.append({
            "id": r.id,
            "started_at": r.started_at,
            "ended_at": r.ended_at,
            "habits_enabled": r.habits_enabled,
            "n_events": n_events,
        })
    return out


@router.post("/events")
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    duration = None
    if payload.ended_at:
        duration = payload.ended_at - payload.started_at
    row = DetectionEvent(
        session_id=payload.session_id,
        habit=payload.habit,
        confidence=payload.confidence,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_sec=duration,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.post("/events/dismiss")
def dismiss_event(payload: EventDismiss, db: Session = Depends(get_db)):
    row = db.query(DetectionEvent).filter_by(id=payload.event_id).first()
    if not row:
        raise HTTPException(404, "event not found")
    row.dismissed = True
    db.commit()
    return {"ok": True}


@router.post("/events/note")
def set_event_note(payload: EventNoteUpdate, db: Session = Depends(get_db)):
    """Phase 6: attach a free-text trigger note -- 'what was happening right
    before this' -- to an already-logged event."""
    row = db.query(DetectionEvent).filter_by(id=payload.event_id).first()
    if not row:
        raise HTTPException(404, "event not found")
    row.notes = payload.notes
    db.commit()
    return {"ok": True}
