from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional
from enum import Enum as PythonEnum

from sqlalchemy import DateTime, ForeignKey, String, Integer, Boolean, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.hybrid import hybrid_property
from database import Base

class FileUpload(str, PythonEnum):
    file_upload_not = "file_upload_not"
    file_upload_vid = "file_upload_vid"
    file_upload_doc = "file_upload_doc"
    file_upload_img = "file_upload_img"
    file_upload_any = "file_upload_any"

class ScoringType(str, PythonEnum):
    none = "none"           # előzetes, nem helyszíni (pl. Tabló) — nincs ProgramItem-je
    jury = "jury"            # zsűri által pontozott, átlagolt
    organizer = "organizer"  # helyszíni, szervező által, helyezés-alapú

class Task(Base):
    __tablename__ = "task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String(100))
    details: Mapped[str] = mapped_column(Text)

    previously_public: Mapped[bool] = mapped_column(Boolean, default=True)

    visible_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    
    file_upload: Mapped[FileUpload] = mapped_column(SQLEnum(FileUpload), nullable=False, default=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    scoring_type: Mapped[ScoringType] = mapped_column(
        SQLEnum(ScoringType), nullable=False, default=ScoringType.none
    )
    # pl. {"1": 8, "2": 5, "3": 3, "4": 1} -- csak scoring_type == organizer esetén releváns
    placement_points: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    max_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    modified_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id"), nullable=True)
    modified_by = relationship("User")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    submissions = relationship("TaskSubmission", back_populates="task")
    program_items = relationship("ProgramItem", back_populates="task")

    @hybrid_property
    def is_visible(self) -> bool:
        if self.is_deleted == True:
            return False
        if not self.previously_public:
            return False
        now_local = datetime.now(ZoneInfo("Europe/Budapest"))
        return self.visible_from < now_local

    @hybrid_property
    def modified_by_name(self) -> str:
        return self.modified_by.name

    @hybrid_property
    def modified_by_picture(self) -> str:
        return self.modified_by.picture