"""End-to-end verification of the gated check-in flow against live Neon + R2.
Creates an isolated TEST event, exercises every path, then deletes it."""

import asyncio

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_factory
from app.models import Attendance, Event
from app.schemas import EventIn, ParticipantIn, SessionIn
from app.services import certificates as cert_svc
from app.services import checkin as checkin_svc
from app.services import events as event_svc
from app.services import participants as participant_svc
from app.services import r2

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), "-", name, f"({detail})" if detail else "")


async def main() -> None:
    async with async_session_factory() as db:
        event = await event_svc.create_event(
            db,
            EventIn(
                title="VERIFY 2-day",
                category="Fitness",
                description="verify",
                capacity=10,
                sessions=[
                    SessionIn(label="Day 1", date="2026-10-01", start_time="09:00",
                              end_time="10:00", location="Hall"),
                    SessionIn(label="Day 2", date="2026-10-02", start_time="09:00",
                              end_time="10:00", location="Hall"),
                ],
            ),
            "verify",
        )
        await db.flush()
        event = (await db.execute(
            select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
        )).scalar_one()
        sessions = sorted(event.sessions, key=lambda s: s.ordinal)

        p = await participant_svc.add_participant(
            db, event, ParticipantIn(name="Verify Person", student_id="SU99999",
                                     email="v@example.com"), "verify",
        )
        await db.commit()

        async def token_for(session_idx: int) -> str | None:
            stmt = select(Attendance.qr_token).where(
                Attendance.session_id == sessions[session_idx].id,
                Attendance.participant_id == p.id,
            )
            return (await db.execute(stmt)).scalar_one_or_none()

        t1 = await token_for(0)
        t2_before = await token_for(1)
        check("session-1 token issued at registration", bool(t1))
        check("session-2 token locked at registration", t2_before is None)

        # 1. gate test: forge a session-2 token manually, scan must be rejected
        forged = "forged-token-verify-1234567890"
        stmt = select(Attendance).where(
            Attendance.session_id == sessions[1].id, Attendance.participant_id == p.id
        )
        att2 = (await db.execute(stmt)).scalar_one()
        att2.qr_token = forged
        await db.commit()
        try:
            await checkin_svc.checkin(db, forged, "verify")
            check("skip-ahead rejected (hard gate)", False, "no error raised")
        except checkin_svc.CheckinError as e:
            check("skip-ahead rejected (hard gate)", e.status_code == 409, e.detail)
        att2.qr_token = None
        await db.commit()

        # 2. scan session 1 -> success + unlocks session 2
        assert t1 is not None
        out = await checkin_svc.checkin(db, t1, "verify")
        check("session-1 scan succeeds", out["session"].label == "Day 1")
        check("session-2 unlocked after session-1", out["next_unlocked"] is True)
        t2 = await token_for(1)
        check("session-2 token generated", bool(t2))

        # 3. double scan session 1 -> 409
        try:
            await checkin_svc.checkin(db, t1, "verify")
            check("double-scan rejected", False, "no error raised")
        except checkin_svc.CheckinError as e:
            check("double-scan rejected", e.status_code == 409, e.detail)

        # 4. scan session 2 -> success, no next to unlock
        assert t2 is not None
        out2 = await checkin_svc.checkin(db, t2, "verify")
        check("session-2 scan succeeds", out2["session"].label == "Day 2")
        check("no further unlock", out2["next_unlocked"] is False)

        # 5. unknown token -> 404
        try:
            await checkin_svc.checkin(db, "nope-not-a-real-token-xyz", "verify")
            check("unknown token 404", False, "no error raised")
        except checkin_svc.CheckinError as e:
            check("unknown token 404", e.status_code == 404, e.detail)

        # 6. cert eligibility: all sessions attended -> issuable (template missing -> 409 path)
        try:
            await cert_svc.issue_certificate(db, p, event, "verify")
            check("issue blocked without template", False, "issued without template")
        except ValueError as e:
            check("issue blocked without template", "template" in str(e).lower(), str(e))

        # 7. R2 presign (offline, uses creds only)
        put_url = r2.presign_put("events/verify/test.txt", "text/plain")
        check("R2 presign PUT", "motionu-certs" in put_url and "X-Amz-Signature" in put_url)

        # cleanup
        await db.delete(event)
        await db.commit()
        print("cleanup: test event deleted")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
