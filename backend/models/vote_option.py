from typing import Optional
from sqlalchemy import ForeignKey, String, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class VoteOption(Base):
    __tablename__ = "vote_option"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vote_id: Mapped[int] = mapped_column(Integer, ForeignKey("vote.id"))
    name: Mapped[str] = mapped_column(String(100))
    image_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    vote = relationship("Vote", back_populates="options")