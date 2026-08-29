from pydantic import BaseModel, Field
from typing import Optional, List, Dict


class LandmarkPoint(BaseModel):
    x: float
    y: float
    z: float = 0.0


class InferRequest(BaseModel):
    profile_id: str = "default"
    session_id: Optional[str] = None
    face: Optional[List[LandmarkPoint]] = None
    hands: List[List[LandmarkPoint]] = Field(default_factory=list)
    timestamp: float


class FeatureVectorRequest(BaseModel):
    """Alternative to InferRequest for clients that already computed the
    feature vector locally (e.g. the browser's own heuristic engine)."""
    profile_id: str = "default"
    feature_vector: List[float]


class CalibrationSampleIn(BaseModel):
    profile_id: str = "default"
    habit: str
    feature_vector: List[float]
    variant: Optional[str] = None  # e.g. "left_thumb" -- user-facing review tag only


class RetrainRequest(BaseModel):
    profile_id: str = "default"


class SessionCreate(BaseModel):
    profile_id: str = "default"
    habits_enabled: List[str] = Field(default_factory=lambda: [
        "nail_biting", "hair_pulling", "face_touching", "lip_biting"
    ])


class SessionEnd(BaseModel):
    session_id: str


class EventCreate(BaseModel):
    session_id: str
    habit: str
    confidence: float
    started_at: float
    ended_at: Optional[float] = None


class EventDismiss(BaseModel):
    event_id: str


class EventNoteUpdate(BaseModel):
    event_id: str
    notes: str
