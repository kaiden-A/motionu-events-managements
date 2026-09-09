import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Event, Participant
from app.services import checkin as checkin_svc
from app.services import events as event_svc
from app.services import participants as participant_svc

from tests.conftest import make_event_in, make_participant_in


async def _setup(db, n_sessions=2):
    event = await event_svc.create_event(db, make_event_in(n_sessions=n_sessions), sub="u")
    stmt = select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
    event = (await db.execute(stmt)).scalar_one()
    participant = await participant_svc.add_participant(
        db, event, make_participant_in(), sub="u"
    )
    stmt = (
        select(Participant)
        .where(Participant.id == participant.id)
        .options(selectinload(Participant.attendance))
    )
    participant = (await db.execute(stmt)).scalar_one()
    return event, participant


def _sorted_sessions(event):
    return sorted(event.sessions, key=lambda s: s.ordinal)


def _attendance_for(participant, session):
    return next(a for a in participant.attendance if a.session_id == session.id)


async def _mark_attended(db, participant, session):
    a = _attendance_for(participant, session)
    a.attended = True
    a.joined_by = "manual"
    await db.flush()


async def test_resolve_token_found(db):
    event, participant = await _setup(db)
    session = _sorted_sessions(event)[0]
    token = _attendance_for(participant, session).qr_token
    a, s, p, e = await checkin_svc.resolve_token(db, token)
    assert a.id == _attendance_for(participant, session).id
    assert s.id == session.id
    assert p.id == participant.id
    assert e.id == event.id


async def test_resolve_token_not_found(db):
    with pytest.raises(checkin_svc.CheckinError) as exc:
        await checkin_svc.resolve_token(db, "missing-token")
    assert exc.value.status_code == 404


async def test_check_gate_passes_when_prior_attended(db):
    event, participant = await _setup(db, n_sessions=2)
    sessions = _sorted_sessions(event)
    await _mark_attended(db, participant, sessions[0])
    await checkin_svc.check_gate(db, event, sessions[1], participant)


async def test_check_gate_blocks_when_prior_missing(db):
    event, participant = await _setup(db, n_sessions=2)
    sessions = _sorted_sessions(event)
    with pytest.raises(checkin_svc.CheckinError) as exc:
        await checkin_svc.check_gate(db, event, sessions[1], participant)
    assert exc.value.status_code == 409
    assert "Session 1" in exc.value.detail


async def test_check_gate_first_session_always_passes(db):
    event, participant = await _setup(db, n_sessions=3)
    sessions = _sorted_sessions(event)
    await checkin_svc.check_gate(db, event, sessions[0], participant)


async def test_mark_attended_idempotent(db):
    event, participant = await _setup(db, n_sessions=1)
    session = _sorted_sessions(event)[0]
    a = _attendance_for(participant, session)
    assert await checkin_svc.mark_attended(db, a, joined_by="qr") is True
    assert a.attended is True
    assert a.joined_by == "qr"
    assert await checkin_svc.mark_attended(db, a, joined_by="qr") is False


async def test_checkin_success_unlocks_next(db):
    event, participant = await _setup(db, n_sessions=2)
    sessions = _sorted_sessions(event)
    token = _attendance_for(participant, sessions[0]).qr_token
    result = await checkin_svc.checkin(db, token, actor_sub="scanner-1")

    assert result["next_unlocked"] is True
    assert result["participant"].attendance[0].attended is True
    assert result["participant"].attendance[0].joined_by == "qr"
    assert result["session"].id == sessions[0].id
    assert result["event"].id == event.id


async def test_checkin_already_attended_raises(db):
    event, participant = await _setup(db, n_sessions=1)
    session = _sorted_sessions(event)[0]
    token = _attendance_for(participant, session).qr_token
    await checkin_svc.checkin(db, token, actor_sub="scanner-1")
    with pytest.raises(checkin_svc.CheckinError) as exc:
        await checkin_svc.checkin(db, token, actor_sub="scanner-1")
    assert exc.value.status_code == 409
    assert "already attended" in exc.value.detail


async def test_checkin_gate_blocked(db):
    event, participant = await _setup(db, n_sessions=2)
    sessions = _sorted_sessions(event)
    unlocked = await participant_svc.unlock_next_pass(db, participant, event, sessions[0])
    token = unlocked.qr_token
    with pytest.raises(checkin_svc.CheckinError) as exc:
        await checkin_svc.checkin(db, token, actor_sub="scanner-1")
    assert exc.value.status_code == 409


async def test_checkin_not_found(db):
    with pytest.raises(checkin_svc.CheckinError) as exc:
        await checkin_svc.checkin(db, "no-such-token", actor_sub="scanner-1")
    assert exc.value.status_code == 404
