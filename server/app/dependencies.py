import time

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKSet, get_unverified_header
from pydantic import BaseModel

from app.config import get_settings

JWKS_CACHE: dict = {"keys": None, "fetched_at": 0.0}
JWKS_TTL = 300  # seconds
_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"]

bearer_scheme = HTTPBearer(auto_error=False)


class UserPrincipal(BaseModel):
    sub: str
    name: str = ""
    email: str = ""
    roles: list[str] = []

    @property
    def is_admin(self) -> bool:
        return bool(set(self.roles) & set(get_settings().admin_roles))


def _fetch_jwks() -> dict:
    settings = get_settings()
    now = time.time()
    cached = JWKS_CACHE["keys"]
    if cached is not None and now - JWKS_CACHE["fetched_at"] < JWKS_TTL:
        return cached
    try:
        resp = httpx.get(settings.jwks_uri, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise jwt.InvalidTokenError(f"Could not fetch JWKS: {exc}") from exc
    JWKS_CACHE["keys"] = data
    JWKS_CACHE["fetched_at"] = now
    return data


def _resolve_signing_key(jwks: PyJWKSet, token: str):
    header = get_unverified_header(token)
    kid = header.get("kid")
    if kid:
        for key in jwks:
            if key.key_id == kid:
                return key
        raise jwt.InvalidTokenError(f"No key in JWKS matches kid {kid!r}")
    return next(iter(jwks))


def _extract_roles(claims: dict) -> list[str]:
    roles: set[str] = set()
    for claim_name in ("urn:zitadel:iam:org:project:roles", "urn:zitadel:iam:org:roles"):
        mappings = claims.get(claim_name) or {}
        for role, mapping in mappings.items():
            if isinstance(mapping, dict) and mapping:
                roles.add(role)
    return sorted(roles)


def verify_token(token: str) -> UserPrincipal:
    settings = get_settings()
    jwks = PyJWKSet.from_dict(_fetch_jwks())
    payload = jwt.decode(
        token,
        _resolve_signing_key(jwks, token),
        algorithms=_ALGORITHMS,
        issuer=settings.issuer,
        audience=settings.zitadel_audience,
        options={"verify_exp": True},
    )
    roles = _extract_roles(payload)
    if not (set(roles) & set(settings.required_roles)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Valid token but missing a required role",
        )
    return UserPrincipal(
        sub=payload.get("sub", ""),
        name=payload.get("name") or payload.get("preferred_username") or "",
        email=payload.get("email", ""),
        roles=roles,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserPrincipal:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    try:
        return verify_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        import os

        if os.environ.get("DEBUG_AUTH"):
            t = credentials.credentials
            segs = [f"{len(s) % 4}:{len(s)}" for s in t.split(".")]
            print(
                f"[authdbg] reject len={len(t)} head={t[:24]!r} segs=[{' '.join(segs)}]"
                f" hasPad={'=' in t} err={exc}"
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        ) from exc


def require_admin(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user
