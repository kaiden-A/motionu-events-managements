from app.config import Settings, get_settings
from app.database import normalize_asyncpg_url


def _settings(**overrides) -> Settings:
    base = {
        "zitadel_issuer": "https://issuer.example.com/",
        "zitadel_jwks_uri": "",
        "zitadel_audience": "aud",
        "database_url": "postgresql://user:pass@host/db",
        "r2_account_id": "acct",
        "access_key_id": "key",
        "secret_access_key": "secret",
    }
    base.update(overrides)
    return Settings(**base)


def test_normalize_asyncpg_url_driver():
    url = "postgresql://user:pass@localhost:5432/db?sslmode=require&channel_binding=require"
    out = normalize_asyncpg_url(url)
    assert out.startswith("postgresql+asyncpg://")
    assert "sslmode=" not in out
    assert "ssl=require" in out
    assert "channel_binding" not in out


def test_normalize_asyncpg_url_non_postgres_passthrough():
    url = "sqlite+aiosqlite:///:memory:"
    assert normalize_asyncpg_url(url) == url


def test_normalize_asyncpg_url_keeps_other_params():
    out = normalize_asyncpg_url("postgresql://u:p@h/db?application_name=api&ssl=prefer")
    assert "application_name=api" in out
    assert "ssl=prefer" in out


def test_issuer_strips_trailing_slash():
    assert _settings().issuer == "https://issuer.example.com"


def test_jwks_uri_falls_back_to_issuer():
    s = _settings(zitadel_jwks_uri="")
    assert s.jwks_uri == "https://issuer.example.com/oidc/v1/keys"


def test_jwks_uri_custom():
    s = _settings(zitadel_jwks_uri="https://keys.example.com/jwks")
    assert s.jwks_uri == "https://keys.example.com/jwks"


def test_bucket_takes_first_comma_separated():
    s = _settings(bucket_names="motionu-certs,backup")
    assert s.bucket == "motionu-certs"


def test_s3_endpoint_default():
    s = _settings(r2_endpoint=None)
    assert s.s3_endpoint == "https://acct.r2.cloudflarestorage.com"


def test_s3_endpoint_override_strips_slash():
    s = _settings(r2_endpoint="https://custom.example.com/")
    assert s.s3_endpoint == "https://custom.example.com"


def test_csv_roles_split():
    s = _settings(required_roles="member,editor", admin_roles="admin,superadmin")
    assert s.required_roles == ["member", "editor"]
    assert s.admin_roles == ["admin", "superadmin"]


def test_get_settings_cached():
    get_settings.cache_clear()
    assert get_settings() is get_settings()
    get_settings.cache_clear()
