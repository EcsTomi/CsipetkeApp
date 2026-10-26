from datetime import datetime
from pydantic import BaseModel

class EventSettingsResponse(BaseModel):
    points_frozen_at: datetime | None
    jury_window_start: datetime | None
    jury_window_end: datetime | None
    winning_class: str | None

class PointsPauseResponse(BaseModel):
    points_frozen_at: datetime

class JuryWindowResponse(BaseModel):
    is_open: bool
    window_start: datetime | None
    window_end: datetime | None