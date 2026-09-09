"""Seed the database with sample data mirroring sample/js/data.js,
including one 2-day (multi-session) event to exercise the gated
sequential-unlock flow. Safe to re-run: skips when events exist."""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.database import async_session_factory
from app.models import Attendance, Event, Participant
from app.schemas import EventIn, ParticipantIn, SessionIn
from app.services import checkin as checkin_svc
from app.services import events as event_svc
from app.services import participants as participant_svc

SUB = "seed"

PEOPLE = [
    ("Nur Aisyah Binti Ahmad", "SU21001", "aisyah.ahmad@student.edu.my"),
    ("Tan Wei Jian", "SU21014", "weijian.tan@student.edu.my"),
    ("Priya A/P Raman", "SU21027", "priya.raman@student.edu.my"),
    ("Muhammad Haziq Bin Zulkifli", "SU21033", "haziq.zulkifli@student.edu.my"),
    ("Chong Mei Ling", "SU21048", "meiling.chong@student.edu.my"),
    ("Arjun Kumar", "SU21052", "arjun.kumar@student.edu.my"),
]

EVENTS = [
    {
        "title": "Sunrise Yoga & Mobility Flow",
        "category": "Wellness",
        "description": "A gentle morning flow to open up tight hips and shoulders.",
        "capacity": 40,
        "sessions": [
            {"label": "Day 1", "date": "2026-09-10", "start_time": "07:00",
             "end_time": "08:30", "location": "Dewan Serbaguna, Block A"},
        ],
        "people": [3, 4, 0],
    },
    {
        "title": "Street Dance Fundamentals: Hip-Hop Level 1",
        "category": "Dance",
        "description": "Groove basics, isolations and an 8-count combo for first-timers.",
        "capacity": 30,
        "sessions": [
            {"label": "Day 1", "date": "2026-09-13", "start_time": "14:00",
             "end_time": "16:00", "location": "Studio 2, Activity Centre"},
            {"label": "Day 2", "date": "2026-09-14", "start_time": "14:00",
             "end_time": "16:00", "location": "Studio 2, Activity Centre"},
        ],
        "people": [0, 2, 5],
    },
    {
        "title": "Zumba Night: Latin Beats",
        "category": "Fitness",
        "description": "An hour of salsa, reggaeton and cumbia-inspired cardio.",
        "capacity": 60,
        "sessions": [
            {"label": "Day 1", "date": "2026-08-22", "start_time": "19:30",
             "end_time": "20:30", "location": "Main Hall"},
        ],
        "people": [0, 1, 2, 3],
    },
]


async def main() -> None:
    async with async_session_factory() as db:
        existing = (await db.execute(select(func.count()).select_from(Event))).scalar_one()
        if existing:
            print(f"seed skipped: {existing} event(s) already present")
            return

        for e in EVENTS:
            created = await event_svc.create_event(
                db,
                EventIn(
                    title=e["title"],
                    category=e["category"],
                    description=e["description"],
                    capacity=e["capacity"],
                    sessions=[SessionIn(**s) for s in e["sessions"]],
                ),
                SUB,
            )
            await db.flush()
            event = (
                await db.execute(
                    select(Event)
                    .where(Event.id == created.id)
                    .options(selectinload(Event.sessions))
                )
            ).scalar_one()
            sessions = sorted(event.sessions, key=lambda s: s.ordinal)
            for i, pi in enumerate(e["people"]):
                name, sid, email = PEOPLE[pi]
                p = await participant_svc.add_participant(
                    db, event, ParticipantIn(name=name, student_id=sid, email=email), SUB
                )
                await db.flush()
                # mark: first person attends session 1 (unlocks session 2 token),
                # second person attends nothing (pending)
                if i == 0:
                    stmt = select(Attendance).where(
                        Attendance.session_id == sessions[0].id,
                        Attendance.participant_id == p.id,
                    )
                    att = (await db.execute(stmt)).scalar_one()
                    att.attended = True
                    att.joined_by = "qr"
                    att.joined_at = datetime.now(timezone.utc)
                    await participant_svc.unlock_next_pass(db, p, event, sessions[0])
                    await db.flush()
            await db.commit()
            print(f"seeded: {event.title} ({len(sessions)} session(s))")


if __name__ == "__main__":
    asyncio.run(main())
