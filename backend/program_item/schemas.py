from typing import Optional, Literal
from pydantic import BaseModel, Field

class ProgramItemCreate(BaseModel):
    task_id: Optional[int] = None
    class_letter: Optional[Literal['a', 'b', 'c', 'd']] = None
    custom_label: Optional[str] = Field(default=None, max_length=100)
    custom_description: Optional[str] = Field(default=None, max_length=2000)
    # ha None, a végére kerül; a service tölti ki
    order_index: Optional[int] = None

class ProgramBreakModify(BaseModel):
    custom_label: Optional[str] = Field(default=None, max_length=100)
    custom_description: Optional[str] = Field(default=None, max_length=2000)

class ProgramItemReorderEntry(BaseModel):
    id: int
    order_index: int

class ProgramItemReorder(BaseModel):
    items: list[ProgramItemReorderEntry]

class TaskSummary(BaseModel):
    id: int
    name: str
    scoring_type: str
    previously_public: bool
    details: Optional[str]
    max_points: Optional[int] = None
    placement_points: Optional[dict] = None

    class Config: from_attributes = True

class ProgramItemResponse(BaseModel):
    id: int
    order_index: int
    task_id: Optional[int]
    class_letter: Optional[str]
    custom_label: Optional[str]
    custom_description: Optional[str]
    task: Optional[TaskSummary] = None

    class Config: from_attributes = True

class ProgramItemBulkGenerate(BaseModel):
    task_id: int