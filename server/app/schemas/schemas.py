from datetime import datetime

from pydantic import BaseModel, Field


# ---------------- Events / Sessions ----------------
class SessionIn(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    date: str
    start_time: str
    end_time: str
    location: str = ""


class SessionOut(SessionIn):
    id: str
    ordinal: int


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="General", max_length=50)
    description: str = ""
    capacity: int = Field(default=1, ge=1)
    sessions: list[SessionIn] = Field(min_length=1)


class EventUpdateIn(BaseModel):
    title: str | None = None
    category: str | None = None
    description: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    sessions: list[SessionIn] | None = None


class EventOut(BaseModel):
    id: str
    title: str
    category: str
    description: str
    capacity: int
    created_at: datetime
    sessions: list[SessionOut]
    total_sessions: int


# ---------------- Participants / Attendance ----------------
class ParticipantIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    student_id: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=1, max_length=200)
    phone: str = ""


class ParticipantUpdateIn(BaseModel):
    name: str | None = None
    student_id: str | None = None
    email: str | None = None
    phone: str | None = None


class AttendanceOut(BaseModel):
    session_id: str
    ordinal: int
    label: str
    date: str
    attended: bool | None
    joined_by: str | None
    joined_at: datetime | None
    qr_token: str | None
    qr_sent_at: str | None


class ParticipantOut(BaseModel):
    id: str
    event_id: str
    name: str
    student_id: str
    email: str
    phone: str
    added_at: str
    attendance: list[AttendanceOut]


# ---------------- Check-in ----------------
class CheckinIn(BaseModel):
    token: str = Field(min_length=8)


class CheckinOut(BaseModel):
    participant: ParticipantOut
    event: EventOut
    session: SessionOut
    next_unlocked: bool = False
    message: str | None = None
