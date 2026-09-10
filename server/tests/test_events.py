from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import ActivityLog, Event, Session
from app.schemas import EventIn, EventUpdateIn
from app.services import events as event_svc

from tests.conftest import make_event_in, make_session_in


async def _load_event(db, event_id):
    stmt = select(Event).where(Event.id == event_id).options(selectinload(Event.sessions))
    return (await db.execute(stmt)).scalar_one()


async def _sessions(db, event_id):
    stmt = select(Session).where(Session.event_id == event_id).order_by(Session.ordinal)
    return list((await db.execute(stmt)).scalars().all())


async def _logs(db, event_id=None):
    stmt = select(ActivityLog)
    if event_id is not None:
        stmt = stmt.where(ActivityLog.event_id == event_id)
    return list((await db.execute(stmt)).scalars().all())


def test_now_iso_format():
    value = event_svc._now_iso()
    datetime.strptime(value, "%Y-%m-%d")


async def test_create_event_basic_fields(db):
    data = make_event_in(n_sessions=2, title="Kickoff")
    event = await event_svc.create_event(db, data, sub="user-1")
    assert event.id
    assert event.title == "Kickoff"
    assert event.category == "General"
    assert event.description == "desc"
    assert event.capacity == 100
    assert event.created_by == "user-1"


async def test_create_event_creates_sessions_in_order(db):
    data = make_event_in(n_sessions=3)
    event = await event_svc.create_event(db, data, sub="user-1")
    sessions = await _sessions(db, event.id)
    assert [s.ordinal for s in sessions] == [1, 2, 3]
    assert [s.label for s in sessions] == ["Session 1", "Session 2", "Session 3"]
    assert all(s.event_id == event.id for s in sessions)


async def test_create_event_logs_activity(db):
    event = await event_svc.create_event(db, make_event_in(title="Log Me"), sub="user-1")
    logs = await _logs(db, event.id)
    assert len(logs) == 1
    assert logs[0].type == "event"
    assert "Log Me" in logs[0].text
    assert logs[0].actor_sub == "user-1"


async def test_update_event_partial_fields(db):
    event = await event_svc.create_event(db, make_event_in(), sub="user-1")
    updated = await event_svc.update_event(
        db, event, {"title": "Renamed", "description": None}, sub="user-1"
    )
    assert updated.title == "Renamed"
    assert updated.description == "desc"


async def test_update_event_replaces_sessions(db):
    event = await event_svc.create_event(db, make_event_in(n_sessions=2), sub="user-1")
    new_sessions = [make_session_in(1, label="A"), make_session_in(2, label="B")]
    await event_svc.update_event(
        db, event, {"title": "T", "sessions": new_sessions}, sub="user-1"
    )
    sessions = await _sessions(db, event.id)
    assert [s.label for s in sessions] == ["A", "B"]
    assert [s.ordinal for s in sessions] == [1, 2]


async def test_update_event_logs_activity(db):
    event = await event_svc.create_event(db, make_event_in(), sub="user-1")
    await event_svc.update_event(db, event, {"title": "Updated"}, sub="user-1")
    logs = await _logs(db, event.id)
    assert logs[-1].type == "event"
    assert "Updated" in logs[-1].text


async def test_log_activity_creates_row(db):
    await event_svc.log_activity(db, "join", "hello", None, "actor-1")
    logs = await _logs(db)
    assert len(logs) == 1
    assert logs[0].type == "join"
    assert logs[0].text == "hello"
    assert logs[0].actor_sub == "actor-1"


async def test_list_events_orders_by_created_desc(db):
    await event_svc.create_event(db, make_event_in(title="First"), sub="u")
    await event_svc.create_event(db, make_event_in(title="Second"), sub="u")
    events = await event_svc.list_events(db)
    assert [e.title for e in events] == ["Second", "First"]


async def test_to_session_out(db):
    event = await event_svc.create_event(db, make_event_in(n_sessions=1), sub="u")
    session = (await _sessions(db, event.id))[0]
    out = event_svc.to_session_out(session)
    assert out.id == session.id
    assert out.ordinal == 1
    assert out.label == "Session 1"
    assert out.location == "Main Hall"


async def test_to_event_out(db):
    event = await event_svc.create_event(db, make_event_in(n_sessions=2), sub="u")
    loaded = await _load_event(db, event.id)
    out = event_svc.to_event_out(loaded)
    assert out.id == loaded.id
    assert out.total_sessions == 2
    assert [s.ordinal for s in out.sessions] == [1, 2]
    assert out.created_at == loaded.created_at


async def test_create_event_cert_min_sessions(db):
    event = await event_svc.create_event(
        db, make_event_in(n_sessions=3, cert_min_sessions=2), sub="u"
    )
    loaded = await _load_event(db, event.id)
    assert loaded.cert_min_sessions == 2
    assert event_svc.to_event_out(loaded).cert_min_sessions == 2


async def test_update_event_cert_min_sessions_clamped(db):
    event = await event_svc.create_event(db, make_event_in(n_sessions=2), sub="u")
    await event_svc.update_event(db, event, {"cert_min_sessions": 5}, sub="u")
    loaded = await _load_event(db, event.id)
    assert loaded.cert_min_sessions == 2


async def test_update_event_clears_cert_min_sessions(db):
    event = await event_svc.create_event(
        db, make_event_in(n_sessions=2, cert_min_sessions=1), sub="u"
    )
    await event_svc.update_event(db, event, {"cert_min_sessions": None}, sub="u")
    loaded = await _load_event(db, event.id)
    assert loaded.cert_min_sessions is None
