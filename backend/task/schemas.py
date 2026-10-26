from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field, computed_field
from fastapi.param_functions import Form
from models.task import FileUpload, ScoringType
from schemas.user import UserPublic
from task_submission.schemas import SubmissionResponse

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

class TaskResponse(BaseModel):
    id: int
    name: str
    details: str
    previously_public: bool
    visible_from: datetime
    available_from: Optional[datetime]
    file_upload: FileUpload
    deadline: Optional[datetime]

    scoring_type: ScoringType
    max_points: Optional[int]
    placement_points: Optional[dict]

    is_visible: bool
    submissions: Optional[list[SubmissionResponse]] = None

    modified_at: datetime
    modified_by: UserPublic
    is_deleted: bool = False

    class Config: from_attributes = True

    @computed_field
    @property
    def visible_from_human(self) -> str:
        return format_datetime_human(self.visible_from, "visible_from")

    @computed_field
    @property
    def available_from_human(self) -> str:
        if self.available_from is None:
            return ""
        return format_datetime_human(self.available_from, "available_from")
    
    @computed_field
    @property
    def deadline_human(self) -> str:
        if self.deadline is None:
            return ""
        return format_datetime_human(self.deadline, "deadline")

class CreateTask(BaseModel):
    name: str = Field(
        title="Név",
        description="A feladat neve",
        min_length=2,
        max_length=100
    )
    details: str = Field(
        title="Leírás",
        description="A feladat leírása",
        min_length=0,
        max_length=5000
    )
    previously_public: bool = Field(
        title="Előzetes, látható feladat",
        description="A feladat látható-e a CsIpEtKe előtt, vagy csak a zsűri számára."
    )
    visible_from: datetime = Field(
        title="Megjelenés időpontja",
        description="A feladat megjelenésének időpontja"
    )
    available_from: Optional[datetime] = Field(
        default=None,
        title="Elérhetőség időpontja",
        description="A feladat pontozásának vagy beküldésének kezdete"
    )
    file_upload: FileUpload = Field(
        title="Fájlfeltöltés",
        description="A feladathoz elérhető-e fájlfeltöltés az osztályokból"
    )
    deadline: Optional[datetime] = Field(
        default=None,
        title="Lezárás időpontja",
        description="A feladat lezárásának időpontja"
    )
    scoring_type: ScoringType = Field(
        title="Pontozás típusa",
        description="A feladat pontozás típusa"
    )
    max_points: Optional[int] = Field(
        default=None,
        title="Maximum pontok",
        description="A feladat maximum pontjai"
    )
    placement_points: Optional[dict] = Field(
        default=None,
        title="Pontozás helyezések",
        description="A feladat pontozás helyezések"
    )

    class Config:
        from_attributes = True

class UpdateTask(BaseModel):
    name: Optional[str]
    details: Optional[str]
    previously_public: Optional[bool]
    visible_from: Optional[datetime]
    available_from: Optional[datetime]
    file_upload: Optional[FileUpload]
    deadline: Optional[datetime]

    scoring_type: Optional[ScoringType]
    max_points: Optional[int]
    placement_points: Optional[dict]

    is_deleted: Optional[bool]