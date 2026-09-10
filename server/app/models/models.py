import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text, default="")
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    cert_min_sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Session.ordinal"
    )
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    template: Mapped["CertificateTemplate | None"] = relationship(
        back_populates="event", cascade="all, delete-orphan", uselist=False
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(100))
    date: Mapped[str] = mapped_column(String(10))
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    location: Mapped[str] = mapped_column(String(200), default="")

    event: Mapped[Event] = relationship(back_populates="sessions")
    attendance: Mapped[list["Attendance"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("event_id", "ordinal", name="uq_session_event_ordinal"),)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    student_id: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50), default="")
    added_at: Mapped[str] = mapped_column(String(10))
    created_by: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    event: Mapped[Event] = relationship(back_populates="participants")
    attendance: Mapped[list["Attendance"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan"
    )
    certificates: Mapped[list["Certificate"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan"
    )


class Attendance(Base):
    __tablename__ = "attendance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), index=True
    )
    attended: Mapped[bool | None] = mapped_column(nullable=True, default=None)
    joined_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    qr_token: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    qr_sent_at: Mapped[str | None] = mapped_column(String(10), nullable=True)

    session: Mapped[Session] = relationship(back_populates="attendance")
    participant: Mapped[Participant] = relationship(back_populates="attendance")

    __table_args__ = (
        UniqueConstraint("session_id", "participant_id", name="uq_attendance_session_participant"),
    )


class CertificateTemplate(Base):
    __tablename__ = "certificate_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), unique=True, index=True
    )
    r2_key: Mapped[str] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(300))
    file_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[str] = mapped_column(String(200))
    uploaded_at: Mapped[str] = mapped_column(String(10))
    fields: Mapped[list | None] = mapped_column(JSON, nullable=True)

    event: Mapped[Event] = relationship(back_populates="template")


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    cert_no: Mapped[str] = mapped_column(String(50), unique=True)
    issued_at: Mapped[str] = mapped_column(String(10))
    revoked_at: Mapped[str | None] = mapped_column(String(10), nullable=True)
    template_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rendered_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    emailed_at: Mapped[str | None] = mapped_column(String(10), nullable=True)

    participant: Mapped[Participant] = relationship(back_populates="certificates")


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    type: Mapped[str] = mapped_column(String(30))
    text: Mapped[str] = mapped_column(Text)
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_sub: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )
