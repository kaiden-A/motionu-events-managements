"""Delete ALL application data from the connected database.

Removes every event (cascading to sessions, participants, attendance rows,
certificate templates and certificates) plus the activity log. Run from the
server directory:

    uv run python clean_db.py          # prompts for confirmation
    uv run python clean_db.py --yes    # skip the prompt

WARNING: this is destructive and cannot be undone. Note that certificate
template files already uploaded to R2 are NOT removed by this script.
"""

import asyncio
import sys

from sqlalchemy import text

from app.database import engine

# events cascades to sessions/participants/attendance/certificate_templates/
# certificates (ondelete CASCADE); activity_log references events with
# ON DELETE SET NULL, so it is cleared explicitly first.
_TABLES = ("events", "activity_log")


async def _count(conn, table: str) -> int:
    return (await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()


async def main() -> None:
    wants_yes = "--yes" in sys.argv or "-y" in sys.argv

    async with engine.begin() as conn:
        before = {t: await _count(conn, t) for t in _TABLES}
        total = sum(before.values())

    print("Will delete from the connected database:")
    for table, n in before.items():
        print(f"  {table}: {n}")
    print(f"  (total {total} row(s))")

    if total and not wants_yes:
        answer = input("Type 'yes' to permanently delete all data: ").strip().lower()
        if answer != "yes":
            print("Aborted — nothing was deleted.")
            await engine.dispose()
            return

    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM activity_log"))
        await conn.execute(text("DELETE FROM events"))
        after = {t: await _count(conn, t) for t in _TABLES}

    await engine.dispose()

    remaining = sum(after.values())
    print("Database cleaned.")
    for table, n in after.items():
        print(f"  {table}: {n} remaining")
    if remaining:
        print("Warning: not all rows were removed — investigate before reusing the database.")


if __name__ == "__main__":
    asyncio.run(main())
