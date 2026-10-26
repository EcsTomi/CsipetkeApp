from typing import Optional
from sqlalchemy import ForeignKey, String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class ProgramItem(Base):
    __tablename__ = "program_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("task.id"), nullable=True)
    # null = minden osztály együtt fut (pl. Zsákbanfutás), 'a'/'b'/'c'/'d' = osztály-variáns (pl. FilmA)
    class_letter: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    # csak akkor kell, ha task_id null (pl. "Ebédszünet")
    custom_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custom_description: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    task = relationship("Task", back_populates="program_items")