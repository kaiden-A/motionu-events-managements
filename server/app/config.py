from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    # --- Zitadel ---
    zitadel_issuer: str
    zitadel_jwks_uri: str
    zitadel_audience: str
    required_roles: Annotated[list[str], NoDecode] = ["member"]
    admin_roles: Annotated[list[str], NoDecode] = ["admin"]

    @field_validator("required_roles", "admin_roles", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # --- Neon ---
    database_url: str

    # --- Cloudflare R2 ---
    r2_account_id: str
    access_key_id: str
    secret_access_key: str
    bucket_names: str = "motionu-certs"
    r2_endpoint: str | None = None  # derived from account id when unset

    # --- Email provider ---
    email_api: str | None = None   # base URL of the email API (EMAIL_API)
    api_key: str | None = None     # provider key sent as `motionu-api-key` (API_KEY)
    email_from: str = "info@motionukict.com"

    # --- Public links ---
    public_app_url: str = "http://localhost:3000"  # frontend origin used in emails
    download_secret: str | None = None  # HMAC key for cert links; falls back to R2 secret

    # --- Public form API (Google Apps Script webhook) ---
    form_api_key: str | None = None  # shared secret sent as X-Form-Key

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def issuer(self) -> str:
        return self.zitadel_issuer.rstrip("/")

    @property
    def jwks_uri(self) -> str:
        return self.zitadel_jwks_uri or f"{self.issuer}/oidc/v1/keys"

    @property
    def bucket(self) -> str:
        return self.bucket_names.split(",")[0].strip()

    @property
    def s3_endpoint(self) -> str:
        if self.r2_endpoint:
            return self.r2_endpoint.rstrip("/")
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def email_enabled(self) -> bool:
        return bool(self.email_api and self.api_key)

    @property
    def cert_link_secret(self) -> str:
        return self.download_secret or self.secret_access_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
