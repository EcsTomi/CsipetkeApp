from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo
from pydantic import BaseModel, computed_field

from schemas import AuditUser

HUNGARIAN_MONTHS = {
    1: "január", 2: "február", 3: "március", 4: "április",
    5: "május", 6: "június", 7: "július", 8: "augusztus",
    9: "szeptember", 10: "október", 11: "november", 12: "december",
}

HUNGARIAN_WEEKDAYS_SHORT = {
    0: "H", 1: "K", 2: "Sze", 3: "Cs", 4: "P", 5: "Szo", 6: "V",
}
HUNGARIAN_WEEKDAYS_LONG = {
    0: "Hétfő", 1: "Kedd", 2: "Szerda", 3: "Csütörtök", 4: "Péntek", 5: "Szombat", 6: "Vasárnap",
}

def format_datetime_human(dt: datetime, type: str = "normal") -> str:
    datePart = dt.strftime("%Y. %m. %d.")
    timePart = dt.strftime("%H:%M:%S")
    now = datetime.now(ZoneInfo("Europe/Budapest")).replace(tzinfo=None)
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo("Europe/Budapest")).replace(tzinfo=None)
    if(dt.date() == now.date()):
        datePart = "Ma"
    elif(dt.date() == now.date() - timedelta(days=1)):
        datePart = "Tegnap"
    elif(dt.date() > now.date() - timedelta(days=7)):
        datePart = HUNGARIAN_WEEKDAYS_LONG[dt.weekday()]
    elif(dt.year == now.year):
        month_name = HUNGARIAN_MONTHS[dt.month]
        weekday_name = HUNGARIAN_WEEKDAYS_SHORT[dt.weekday()]
        datePart = f"{month_name} {dt.day:02d}. ({weekday_name})"
    
    if(dt.minute == 0):
        timePart = dt.strftime("%H óra")
    else:
        timePart = dt.strftime("%H:%M")
    return f"{datePart} {timePart}"


class AuditLogResponse(BaseModel):
    id: int
    action: str
    target_id: Optional[int]
    target_name: Optional[str]
    return_code: Optional[int]
    meta: Optional[dict[str, Any]]
    created_at: datetime
    user: Optional[AuditUser]

    @computed_field
    @property
    def created_at_human(self) -> str:
        return format_datetime_human(self.created_at)

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    limit: int
    offset: int