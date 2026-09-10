import pytest
from fastapi import HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies import require_form_key
from app.models import Event, Participant
from app.routers.public import PUBLIC_ACTOR, add_public_participant
from app.services import events as event_svc
from app.services import participants as participant_svc

from tests.conftest import make_event_in, make_participant_in


async def _event(db, n_sessions=2):
    event = await event_svc.create_event(db, make_event_in(n_sessions=n_sessions), sub="u")
    stmt = select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
    return (await db.execute(stmt)).scalar_one()


async def _participant_count(db, event_id):
    return (
        await db.execute(
            select(func.count()).select_from(Participant).where(Participant.event_id == event_id)
        )
    ).scalar_one()


# ---------- form key dependency ----------


def test_require_form_key_unconfigured(monkeypatch):
    monkeypatch.setattr(get_settings(), "form_api_key", None)
    with pytest.raises(HTTPException) as exc:
        require_form_key(None)
    assert exc.value.status_code == 503


def test_require_form_key_missing(monkeypatch):
    monkeypatch.setattr(get_settings(), "form_api_key", "secret")
    with pytest.raises(HTTPException) as exc:
        require_form_key(None)
    assert exc.value.status_code == 401


def test_require_form_key_wrong(monkeypatch):
    monkeypatch.setattr(get_settings(), "form_api_key", "secret")
    with pytest.raises(HTTPException) as exc:
        require_form_key("nope")
    assert exc.value.status_code == 401


def test_require_form_key_ok(monkeypatch):
    monkeypatch.setattr(get_settings(), "form_api_key", "secret")
    assert require_form_key("secret") is None


# ---------- duplicate lookup ----------


async def test_find_duplicate_by_email_case_insensitive(db):
    event = await _event(db)
    await participant_svc.add_participant(
        db, event, make_participant_in(email="Alice@Example.com"), sub="u"
    )
    found = await participant_svc.find_duplicate(
        db, event.id, make_participant_in(name="Other", student_id="S9999", email="alice@example.com")
    )
    assert found is not None
    assert found.email == "Alice@Example.com"


async def test_find_duplicate_by_student_id(db):
    event = await _event(db)
    await participant_svc.add_participant(
        db, event, make_participant_in(student_id="S1234"), sub="u"
    )
    found = await participant_svc.find_duplicate(
        db, event.id, make_participant_in(email="other@example.com", student_id="s1234")
    )
    assert found is not None
    assert found.student_id == "S1234"


async def test_find_duplicate_none(db):
    event = await _event(db)
    assert (
        await participant_svc.find_duplicate(db, event.id, make_participant_in())
    ) is None


async def test_find_duplicate_ignores_other_events(db):
    event_a = await _event(db)
    event_b = await _event(db)
    await participant_svc.add_participant(db, event_a, make_participant_in(), sub="u")
    assert (
        await participant_svc.find_duplicate(db, event_b.id, make_participant_in())
    ) is None


# ---------- public endpoint ----------


async def test_add_public_participant_creates_rows(db):
    event = await _event(db, n_sessions=3)
    response = Response()
    out = await add_public_participant(
        event.id, make_participant_in(name="Alice", email="alice@example.com"), response, db, None
    )

    assert response.status_code == 201
    assert out.name == "Alice"
    assert len(out.attendance) == 3
    assert all(a.qr_token for a in out.attendance)

    stmt = select(Participant).where(Participant.event_id == event.id)
    saved = (await db.execute(stmt)).scalar_one()
    assert saved.created_by == PUBLIC_ACTOR


async def test_add_public_participant_duplicate_returns_existing(db):
    event = await _event(db)
    first_response = Response()
    first = await add_public_participant(
        event.id, make_participant_in(name="Alice", email="alice@example.com"), first_response, db, None
    )
    second_response = Response()
    second = await add_public_participant(
        event.id,
        make_participant_in(name="Alice Again", email="ALICE@EXAMPLE.COM"),
        second_response,
        db,
        None,
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 200
    assert second.id == first.id
    assert await _participant_count(db, event.id) == 1


async def test_add_public_participant_unknown_event(db):
    response = Response()
    with pytest.raises(HTTPException) as exc:
        await add_public_participant(
            "no-such-event", make_participant_in(), response, db, None
        )
    assert exc.value.status_code == 404
