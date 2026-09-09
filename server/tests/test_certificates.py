import re

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Certificate, Event, Participant
from app.services import certificates as cert_svc
from app.services import events as event_svc
from app.services import participants as participant_svc

from tests.conftest import make_event_in, make_participant_in


async def _event_with_sessions(db):
    event = await event_svc.create_event(db, make_event_in(n_sessions=2), sub="u")
    stmt = select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
    return (await db.execute(stmt)).scalar_one()


async def _reload_event_with_template(db, event_id):
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.sessions), selectinload(Event.template))
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one()


async def _event_with_template(db):
    event = await _event_with_sessions(db)
    return await _reload_event_with_template(db, event.id)


async def _add_participant(db, event):
    p = await participant_svc.add_participant(db, event, make_participant_in(), sub="u")
    stmt = (
        select(Participant)
        .where(Participant.id == p.id)
        .options(selectinload(Participant.attendance))
    )
    return (await db.execute(stmt)).scalar_one()


async def _set_attendance(db, participant, sessions):
    for s in sessions:
        a = next(x for x in participant.attendance if x.session_id == s.id)
        a.attended = True
        a.joined_by = "manual"
        await db.flush()


async def _add_template(db, event, key="events/e1/tpl.png", file_name="tpl.png"):
    return await cert_svc.create_template(
        db, event, r2_key=key, file_name=file_name, file_type="image/png", file_size=1024, actor_sub="u"
    )


# ---------- pure helpers ----------


def test_template_key_slugifies():
    key = cert_svc._template_key("evt-1", "My Certificate (Final).png")
    assert key.startswith("events/evt-1/templates/")
    assert key.endswith("my-certificate-final-png")
    assert re.fullmatch(r"events/[^/]+/templates/\d{4}-\d{2}-\d{2}/[a-z0-9-]+", key)


def test_template_key_empty_name_falls_back():
    key = cert_svc._template_key("evt-1", "!!!")
    assert key.endswith("template")


async def test_next_cert_no_format(db):
    no = await cert_svc.next_cert_no(db)
    assert re.fullmatch(r"MU-\d{4}-\d{4}", no)


async def test_next_cert_no_increments(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    first = await cert_svc.next_cert_no(db)
    assert first.endswith("0001")
    await cert_svc.issue_certificate(db, p, event, "u")
    second = await cert_svc.next_cert_no(db)
    assert second.endswith("0002")


async def test_all_sessions_attended_true(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    assert await cert_svc.all_sessions_attended(db, p) is True


async def test_all_sessions_attended_false_when_missing(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    assert await cert_svc.all_sessions_attended(db, p) is False


async def test_all_sessions_attended_false_when_empty(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    assert await cert_svc.all_sessions_attended(db, p) is False


# ---------- issue / revoke ----------


async def test_issue_requires_template(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    with pytest.raises(ValueError, match="template"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_requires_full_attendance(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    with pytest.raises(ValueError, match="every session"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_prevents_duplicate(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    await cert_svc.issue_certificate(db, p, event, "u")
    with pytest.raises(ValueError, match="already has a certificate"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_success(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.cert_no.startswith("MU-")
    assert cert.participant_id == p.id
    assert cert.event_id == event.id
    assert cert.template_key == "events/e1/tpl.png"
    assert cert.issued_at
    assert cert.revoked_at is None


async def test_revoke_certificate(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.revoked_at is None
    await cert_svc.revoke_certificate(db, cert, "u")
    assert cert.revoked_at is not None


# ---------- templates ----------


async def test_create_template(db):
    event = await _event_with_template(db)
    tpl = await _add_template(db, event)
    assert tpl.event_id == event.id
    assert tpl.file_name == "tpl.png"
    assert tpl.file_type == "image/png"
    assert tpl.file_size == 1024
    assert tpl.uploaded_by == "u"


async def test_create_template_replaces_old_and_deletes_r2(db, monkeypatch):
    event = await _event_with_template(db)
    deleted = []
    monkeypatch.setattr(cert_svc.r2, "delete_object", lambda key: deleted.append(key))

    await _add_template(db, event, key="old-key.png")
    event = await _reload_event_with_template(db, event.id)
    assert event.template.r2_key == "old-key.png"

    await _add_template(db, event, key="new-key.png")
    assert deleted == ["old-key.png"]

    event = await _reload_event_with_template(db, event.id)
    assert event.template.r2_key == "new-key.png"
