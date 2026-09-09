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


@lru_cache
def get_settings() -> Settings:
    return Settings()
