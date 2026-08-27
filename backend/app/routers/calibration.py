from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CalibrationSample
from ..schemas import CalibrationSampleIn, RetrainRequest
from ..ml.classifier import get_classifier

router = APIRouter(prefix="/calibration", tags=["calibration"])


@router.post("/samples")
def add_sample(sample: CalibrationSampleIn, db: Session = Depends(get_db)):
    row = CalibrationSample(
        profile_id=sample.profile_id,
        habit=sample.habit,
        feature_vector=sample.feature_vector,
        variant=sample.variant,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    count = db.query(CalibrationSample).filter_by(profile_id=sample.profile_id).count()
    return {"id": row.id, "total_samples_for_profile": count}


@router.get("/samples/{profile_id}")
def list_samples(profile_id: str, db: Session = Depends(get_db)):
    rows = db.query(CalibrationSample).filter_by(profile_id=profile_id).all()
    by_habit = {}
    by_variant = {}
    for r in rows:
        by_habit[r.habit] = by_habit.get(r.habit, 0) + 1
        if r.variant:
            by_variant.setdefault(r.habit, {})
            by_variant[r.habit][r.variant] = by_variant[r.habit].get(r.variant, 0) + 1
    return {"total": len(rows), "by_habit": by_habit, "by_variant": by_variant}


@router.delete("/samples/{profile_id}")
def clear_samples(profile_id: str, db: Session = Depends(get_db)):
    n = db.query(CalibrationSample).filter_by(profile_id=profile_id).delete()
    db.commit()
    return {"deleted": n}


@router.post("/retrain")
def retrain(req: RetrainRequest, db: Session = Depends(get_db)):
    rows = db.query(CalibrationSample).filter_by(profile_id=req.profile_id).all()
    real_samples = [(r.feature_vector, r.habit) for r in rows]
    clf = get_classifier(req.profile_id)
    clf.retrain(real_samples)
    return clf.status()


@router.get("/status/{profile_id}")
def status(profile_id: str):
    clf = get_classifier(profile_id)
    return clf.status()
