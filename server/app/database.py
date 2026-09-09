from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_asyncpg_url(url: str) -> str:
    """Convert a generic Neon/Postgres URL into SQLAlchemy asyncpg form:
    asyncpg driver + `ssl=` instead of `sslmode=`, drop psycopg-only
    `channel_binding` (it is rejected as an unknown connect kwarg)."""
    if not url.startswith("postgresql://"):
        return url
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    parts = urlsplit(url)
    params = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" in params and "ssl" not in params:
        params["ssl"] = params.pop("sslmode")
    params.pop("channel_binding", None)
    return urlunsplit(parts._replace(query=urlencode(params)))


engine = create_async_engine(
    normalize_asyncpg_url(get_settings().database_url), pool_pre_ping=True
)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session_factory() as session:
        yield session
