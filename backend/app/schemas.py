import time
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict

# Anything before 2000-01-01 in a field that is supposed to hold a unix
# timestamp is not a clock skew -- it's the wrong clock entirely.
EPOCH_FLOOR = 946684800.0
EPOCH_FUTURE_SLACK_SEC = 86400.0  # tolerate a day of client clock drift


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

    @field_validator("started_at", "ended_at")
    @classmethod
    def _must_be_wall_clock(cls, v: Optional[float]) -> Optional[float]:
        """Reject anything that isn't a real unix timestamp.

        A pre-release build of the client sent event times straight from
        performance.now()/1000 -- seconds since page load, not since the
        epoch. Values like 16.87 or 4606.70 stored fine and only surfaced
        much later, as a "1970-01-01" bucket in the analytics day chart and
        a nonsense "quietest day". 22 rows had to be deleted by hand.
        Nothing downstream can distinguish a bogus timestamp from a real
        one, so the only place to catch it is on the way in.
        """
        if v is None:
            return v
        if v < EPOCH_FLOOR:
            raise ValueError(
                f"timestamp {v} is before {EPOCH_FLOOR} (2000-01-01) -- looks like a "
                "monotonic clock (performance.now) rather than a unix timestamp"
            )
        if v > time.time() + EPOCH_FUTURE_SLACK_SEC:
            raise ValueError(f"timestamp {v} is implausibly far in the future")
        return v


class EventDismiss(BaseModel):
    event_id: str


class EventNoteUpdate(BaseModel):
    event_id: str
    notes: str
