from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Attendance, Event, Participant
from app.services import events as event_svc
from app.services import participants as participant_svc
from app.services import tokens

from tests.conftest import make_event_in, make_participant_in


async def _make_event_with_sessions(db, n_sessions=2, **kwargs):
    event = await event_svc.create_event(db, make_event_in(n_sessions=n_sessions, **kwargs), sub="u")
    stmt = select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
    return (await db.execute(stmt)).scalar_one()


async def _load_participant(db, participant_id):
    stmt = (
        select(Participant)
        .where(Participant.id == participant_id)
        .options(selectinload(Participant.attendance))
    )
    return (await db.execute(stmt)).scalar_one()


async def _add(db, event, **kwargs):
    participant = await participant_svc.add_participant(
        db, event, make_participant_in(**kwargs), sub="u"
    )
    return await _load_participant(db, participant.id)


async def test_add_participant_fields(db):
    event = await _make_event_with_sessions(db, n_sessions=2)
    p = await _add(db, event, name="Alice", email="alice@example.com")
    assert p.event_id == event.id
    assert p.name == "Alice"
    assert p.email == "alice@example.com"
    assert p.phone == "0123456789"
    assert p.created_by == "u"
    assert p.added_at


async def test_add_participant_creates_attendance_rows(db):
    event = await _make_event_with_sessions(db, n_sessions=3)
    p = await _add(db, event)
    assert len(p.attendance) == 3
    assert {a.session_id for a in p.attendance} == {s.id for s in event.sessions}


async def test_add_participant_first_session_gets_token_only(db):
    event = await _make_event_with_sessions(db, n_sessions=3)
    p = await _add(db, event)
    sessions = sorted(event.sessions, key=lambda s: s.ordinal)
    by_session = {a.session_id: a for a in p.attendance}
    assert by_session[sessions[0].id].qr_token is not None
    assert by_session[sessions[1].id].qr_token is None
    assert by_session[sessions[2].id].qr_token is None


async def test_add_participant_logs_activity(db):
    event = await _make_event_with_sessions(db, n_sessions=2)
    await _add(db, event, name="Bob")
    logs = (
        await db.execute(
            select(event_svc.ActivityLog).where(event_svc.ActivityLog.event_id == event.id)
        )
    ).scalars().all()
    assert any(log.type == "register" and "Bob" in log.text for log in logs)


async def test_find_attendance_by_token(db):
    event = await _make_event_with_sessions(db, n_sessions=1)
    p = await _add(db, event)
    token = p.attendance[0].qr_token
    found = await participant_svc.find_attendance_by_token(db, token)
    assert found is not None
    assert found.id == p.attendance[0].id


async def test_find_attendance_by_token_missing(db):
    assert await participant_svc.find_attendance_by_token(db, "no-such-token") is None


async def test_next_session_after(db):
    event = await _make_event_with_sessions(db, n_sessions=3)
    sessions = sorted(event.sessions, key=lambda s: s.ordinal)
    assert (await participant_svc.next_session_after(db, event, sessions[0])).id == sessions[1].id
    assert (await participant_svc.next_session_after(db, event, sessions[1])).id == sessions[2].id
    assert await participant_svc.next_session_after(db, event, sessions[2]) is None


async def test_unlock_next_pass_no_next_returns_none(db):
    event = await _make_event_with_sessions(db, n_sessions=1)
    p = await _add(db, event)
    session = event.sessions[0]
    assert await participant_svc.unlock_next_pass(db, p, event, session) is None


async def test_unlock_next_pass_generates_token(db):
    event = await _make_event_with_sessions(db, n_sessions=2)
    p = await _add(db, event)
    sessions = sorted(event.sessions, key=lambda s: s.ordinal)
    unlocked = await participant_svc.unlock_next_pass(db, p, event, sessions[0])
    assert unlocked is not None
    assert unlocked.qr_token is not None
    assert unlocked.qr_sent_at is None


async def test_unlock_next_pass_idempotent_when_token_exists(db):
    event = await _make_event_with_sessions(db, n_sessions=2)
    p = await _add(db, event)
    sessions = sorted(event.sessions, key=lambda s: s.ordinal)
    first = await participant_svc.unlock_next_pass(db, p, event, sessions[0])
    token = first.qr_token
    second = await participant_svc.unlock_next_pass(db, p, event, sessions[0])
    assert second.qr_token == token


async def test_deliver_qr_pass_simulated_when_email_unconfigured(db):
    event = await _make_event_with_sessions(db, n_sessions=2)
    p = await _add(db, event, name="Alice", email="alice@example.com")
    sessions = sorted(event.sessions, key=lambda s: s.ordinal)
    unlocked = await participant_svc.unlock_next_pass(db, p, event, sessions[0])
    assert unlocked.qr_sent_at is None
    mode = await participant_svc.deliver_qr_pass(db, event, p, unlocked)
    assert mode == "simulated"
    assert unlocked.qr_sent_at is not None


async def test_to_attendance_out(db):
    event = await _make_event_with_sessions(db, n_sessions=1)
    p = await _add(db, event)
    session = event.sessions[0]
    a = p.attendance[0]
    out = participant_svc.to_attendance_out(a, session)
    assert out.session_id == session.id
    assert out.ordinal == session.ordinal
    assert out.label == session.label
    assert out.attended is None
    assert out.qr_token == a.qr_token


async def test_to_participant_out_orders_by_ordinal(db):
    event = await _make_event_with_sessions(db, n_sessions=3)
    p = await _add(db, event)
    out = participant_svc.to_participant_out(p, event)
    assert out.id == p.id
    assert out.event_id == event.id
    assert [a.ordinal for a in out.attendance] == [1, 2, 3]
    assert out.attendance[0].qr_token is not None
