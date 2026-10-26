from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field, computed_field

from schemas import UserPublic

HUNGARIAN_MONTHS = {
    1: "január", 2: "február", 3: "március", 4: "április",
    5: "május", 6: "június", 7: "július", 8: "augusztus",
    9: "szeptember", 10: "október", 11: "november", 12: "december",
}

HUNGARIAN_WEEKDAYS_SHORT = {
    0: "H", 1: "K", 2: "Sze", 3: "Cs", 4: "P", 5: "Szo", 6: "V",
}

def format_datetime_human(dt: datetime, type: str = "normal") -> str:
    datePart = dt.strftime("%Y. %m. %d.")
    timePart = dt.strftime("%H:%M:%S")
    now = datetime.now(ZoneInfo("Europe/Budapest")).replace(tzinfo=None)
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo("Europe/Budapest")).replace(tzinfo=None)
    if(dt.date() == now.date()):
        datePart = "Ma"
    elif(dt.date() == now.date() + timedelta(days=1)):
        datePart = "Holnap"
    elif(dt.year == now.year):
        month_name = HUNGARIAN_MONTHS[dt.month]
        weekday_name = HUNGARIAN_WEEKDAYS_SHORT[dt.weekday()]
        datePart = f"{month_name} {dt.day:02d}. ({weekday_name})"
    
    if(dt.hour == 23 and dt.minute == 59 and type == "deadline"):
        timePart = ""
    elif(dt.hour == 00 and dt.minute == 00 and type != "deadline"):
        timePart = ""
    elif(dt.minute == 0 and dt.second == 0):
        timePart = dt.strftime("%H óra")
    elif(dt.second == 0):
        timePart = dt.strftime("%H:%M")
    return f"{datePart} {timePart}"

class CreateVoteOption(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    details: str = ""


class CreateVote(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

    visible_from: datetime
    available_from: datetime
    deadline: Optional[datetime] = None

    options: list[CreateVoteOption] = Field(..., min_length=0)


class UpdateVote(BaseModel):
    """Az opciók listáját nem itt kezeljük - külön végpontok (kép/opció hozzáadás/törlés),
    mivel meglévő allokációk hivatkozhatnak rájuk."""
    name: str = Field(..., min_length=1, max_length=100)
    visible_from: datetime
    available_from: datetime
    deadline: Optional[datetime] = None
    is_deleted: Optional[bool]
    
class AddVoteOption(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class VoteOptionResponse(BaseModel):
    id: int
    vote_id: int
    name: str
    image_path: Optional[str]

    class Config: from_attributes = True


class VoteResponse(BaseModel):
    id: int
    name: str
    visible_from: datetime
    available_from: datetime
    deadline: Optional[datetime]
    is_open: bool
    options: list[VoteOptionResponse]

    is_deleted: bool

    my_allocation: Optional[int] = None

    modified_at: datetime
    modified_by: UserPublic

    @computed_field
    @property
    def visible_from_human(self) -> str:
        return format_datetime_human(self.visible_from, "visible_from")

    @computed_field
    @property
    def available_from_human(self) -> str:
        return format_datetime_human(self.available_from, "available_from")
    
    @computed_field
    @property
    def deadline_human(self) -> str:
        if self.deadline is None:
            return ""
        return format_datetime_human(self.deadline, "deadline")

    class Config: from_attributes = True


class MyAllocationResponse(BaseModel):
    """A saját leadott szavazatod - csak a beküldő láthatja a sajátját ilyen bontásban."""
    option_id: int

    class Config: from_attributes = True


class OptionResultResponse(BaseModel):
    """Élő, aggregált eredmény - egyéni allokációk soha nem szerepelnek itt."""
    option_id: int
    total: int


class SnapshotPoint(BaseModel):
    created_at: datetime
    total: int


class OptionHistoryResponse(BaseModel):
    option_id: int
    points: list[SnapshotPoint]