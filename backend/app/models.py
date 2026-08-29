import uuid
import time
from sqlalchemy import Column, String, Float, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


def _uuid():
    return str(uuid.uuid4())


class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, default="default")
    created_at = Column(Float, default=time.time)

    sessions = relationship("DetectionSession", back_populates="profile")
    calibration_samples = relationship("CalibrationSample", back_populates="profile")


class DetectionSession(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, default=_uuid)
    profile_id = Column(String, ForeignKey("profiles.id"))
    started_at = Column(Float, default=time.time)
    ended_at = Column(Float, nullable=True)
    habits_enabled = Column(JSON, default=list)

    profile = relationship("Profile", back_populates="sessions")
    events = relationship("DetectionEvent", back_populates="session")


class DetectionEvent(Base):
    __tablename__ = "events"
    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, ForeignKey("sessions.id"))
    habit = Column(String, index=True)
    confidence = Column(Float)
    started_at = Column(Float)
    ended_at = Column(Float, nullable=True)
    duration_sec = Column(Float, nullable=True)
    dismissed = Column(Boolean, default=False)  # user marked "not actually me"
    notes = Column(String, nullable=True)  # Phase 6: "what was happening right before this"

    session = relationship("DetectionSession", back_populates="events")


class CalibrationSample(Base):
    __tablename__ = "calibration_samples"
    id = Column(String, primary_key=True, default=_uuid)
    profile_id = Column(String, ForeignKey("profiles.id"))
    habit = Column(String, index=True)  # one of HABITS, including "none"
    feature_vector = Column(JSON)  # list[float], schema = ml.features.FEATURE_NAMES
    variant = Column(String, nullable=True)  # e.g. "left_thumb" -- UI review tag only, not used in training
    created_at = Column(Float, default=time.time)

    profile = relationship("Profile", back_populates="calibration_samples")
