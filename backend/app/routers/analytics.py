import datetime
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import DetectionEvent, DetectionSession

router = APIRouter(prefix="/analytics", tags=["analytics"])


# Timestamps this old aren't real -- see EventCreate's validator in
# schemas.py. New rows can no longer get in, but a database written by an
# older build can still hold them, and a single one is enough to invent a
# "1970-01-01" day bucket that then wins "quietest day" outright. Aggregation
# skips them rather than trusting the data.
EPOCH_FLOOR = 946684800.0  # 2000-01-01


def _is_real_timestamp(ts) -> bool:
    return isinstance(ts, (int, float)) and ts >= EPOCH_FLOOR


def _day_key(ts: float) -> str:
    return datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def _events_for_profile(db: Session, profile_id: str):
    session_ids = [s.id for s in db.query(DetectionSession).filter_by(profile_id=profile_id).all()]
    if not session_ids:
        return []
    return (
        db.query(DetectionEvent)
        .filter(DetectionEvent.session_id.in_(session_ids), DetectionEvent.dismissed == False)  # noqa: E712
        .all()
    )


@router.get("/summary/{profile_id}")
def summary(profile_id: str, db: Session = Depends(get_db)):
    events = _events_for_profile(db, profile_id)

    by_habit = defaultdict(int)
    by_day = defaultdict(lambda: defaultdict(int))
    by_hour = defaultdict(int)
    total_duration = defaultdict(float)

    for e in events:
        by_habit[e.habit] += 1
        if e.duration_sec:
            total_duration[e.habit] += e.duration_sec
        # Habit totals and durations stay honest even for a row with a broken
        # timestamp; only the time-bucketed views have to drop it, because
        # there's no defensible day or hour to file it under.
        if not _is_real_timestamp(e.started_at):
            continue
        day = _day_key(e.started_at)
        by_day[day][e.habit] += 1
        hour = datetime.datetime.fromtimestamp(e.started_at).hour
        by_hour[hour] += 1

    days_sorted = sorted(by_day.keys())
    daily_series = [
        {"date": d, **{h: by_day[d].get(h, 0) for h in by_habit.keys()}}
        for d in days_sorted
    ]

    # streak = consecutive days ending today with at least one detection
    streak = 0
    cursor = datetime.date.today()
    day_set = set(by_day.keys())
    while cursor.strftime("%Y-%m-%d") in day_set:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    # "clean streak" = consecutive days with a session logged but zero events
    all_sessions = db.query(DetectionSession).filter_by(profile_id=profile_id).all()
    session_days = defaultdict(int)
    for s in all_sessions:
        if not _is_real_timestamp(s.started_at):
            continue
        session_days[_day_key(s.started_at)] += 1
    clean_streak = 0
    cursor = datetime.date.today()
    while True:
        key = cursor.strftime("%Y-%m-%d")
        if key in session_days and key not in day_set:
            clean_streak += 1
            cursor -= datetime.timedelta(days=1)
        elif key in session_days and key in day_set:
            break
        else:
            break

    return {
        "total_events": len(events),
        "by_habit": dict(by_habit),
        "by_hour": {str(h): by_hour.get(h, 0) for h in range(24)},
        "daily_series": daily_series,
        "total_duration_sec": dict(total_duration),
        "current_detection_streak_days": streak,
        "current_clean_streak_days": clean_streak,
        "n_sessions": len(all_sessions),
    }
