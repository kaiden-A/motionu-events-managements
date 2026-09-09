# Zitadel Integration with FastAPI — A General Guide

This guide explains how to integrate **Zitadel** (an open-source OIDC identity provider) with a
**FastAPI** backend for authentication and authorization. The concepts and flow are standard
OIDC and apply to any backend stack — only the code snippets are FastAPI-specific. Throughout
the guide we use a simple **todo app** as the running example, where:

- signed-in users can view and manage **their own** todos,
- admins can view and manage **everyone's** todos,
- some endpoints are fully public.

## 1. What Zitadel provides (and what your backend does)

Zitadel is the identity provider (IdP). It owns:

- **Users, orgs, projects, and roles** — roles are granted to users at the project or org level.
- **Token issuance** — the client (web app, mobile app, etc.) obtains an access token (JWT)
  after the user signs in.
- **JWKS endpoint** — public keys used by the backend to verify token signatures.

The backend never talks to Zitadel per-request to "ask" who the user is. It **validates the
access token locally** using the issuer's public keys and reads **roles directly from the JWT
claims**. This is the standard OIDC "RS256 + JWKS" pattern.

```
User signs in (browser/app → Zitadel)
        │
        ▼  returns access token (JWT)
Backend receives   Authorization: Bearer <token>
        │
        ├─ 1. Fetch JWKS (cached)            GET {issuer}/oidc/v1/keys
        ├─ 2. Verify signature (via kid)
        ├─ 3. Verify issuer, audience, exp
        ├─ 4. Extract roles from claims
        ├─ 5. Enforce the endpoint's access level → 401/403 or proceed
        └─ 6. Optionally call userinfo for extra profile data (cached)
```

## 2. Configuration

Zitadel settings are read from environment variables. In FastAPI, `pydantic-settings` maps
them automatically (`ZITADEL_ISSUER` → `zitadel_issuer`). In any other stack, these are plain
env vars or secrets.

| Env var | Purpose | Example |
| --- | --- | --- |
| `ZITADEL_ISSUER` | Base URL of the Zitadel instance. All OIDC endpoint URLs derive from it. | `https://todo-app.zitadel.cloud` |
| `ZITADEL_JWKS_URI` | Full URL of the JWKS (JSON Web Key Set) endpoint. | `https://todo-app.zitadel.cloud/oidc/v1/keys` |
| `ZITADEL_AUDIENCE` | Expected `aud` claim of the token (the Zitadel project / client id). Tokens with a different audience are rejected. | `292528700918845518@todoapp` |
| `ZITADEL_REQUIRED_ROLE` | Roles allowed to use the API at all. A valid token without any of these roles → 403. | `member,admin` |
| `ADMIN_ROLES` | Roles that unlock admin-only endpoints. | `admin` |

> **Good practice:** store the list-valued settings as either comma-separated strings or JSON
> arrays, and normalize them once at load time so both `.env` files and secret managers work.
>
> **Good practice:** treat `ZITADEL_ISSUER` as the single source of truth and derive
> `jwks_uri` and `userinfo` from it (`{issuer}/oidc/v1/keys`, `{issuer}/oidc/v1/userinfo`)
> instead of hard-coding URLs.

Example FastAPI settings:

```python
from functools import lru_cache
from typing import Annotated

from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    zitadel_issuer: str
    zitadel_jwks_uri: str
    zitadel_audience: str
    zitadel_required_role: Annotated[list[str], NoDecode] = ["member", "admin"]
    admin_roles: Annotated[list[str], NoDecode] = ["admin"]

    model_config = {"env_file": ".env"}

    @property
    def issuer(self) -> str:
        return self.zitadel_issuer.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## 3. The authorization model

Build **three levels of access** and expose them as reusable FastAPI dependencies (the
equivalent in other frameworks is middleware, decorators, or guards).

### 3.1 Public endpoints

No token required — e.g. a todo app's `GET /healthz` or a signup form endpoint. If it needs
any credential at all, use a dedicated mechanism (e.g. a shared static API key), **not** user
tokens.

### 3.2 Any authenticated user — `get_current_user`

The core dependency. It:

1. Reads the `Authorization: Bearer <token>` header (missing → **401**).
2. Verifies the JWT (signature, issuer, audience, expiry) — invalid → **401**.
3. Extracts roles from claims.
4. Checks roles against `zitadel_required_role` — no overlap → **403**.
5. Returns a typed `UserPrincipal` injected into the route.

Used by endpoints any member may call — e.g. in the todo app: `GET /todos`, `POST /todos`.

### 3.3 Admin only — `require_admin`

Composes `get_current_user` and additionally requires at least one role from `admin_roles`
via `UserPrincipal.is_admin` → otherwise **403**.

Used by administrative endpoints — e.g. in the todo app: `GET /admin/todos` (everyone's
todos), deleting users' todos.

### 3.4 Fine-grained checks inside a handler

Sometimes the endpoint-level check is not enough. The `UserPrincipal` is injected into the
handler so business logic can branch on identity or roles. In a todo app: any member lists
their own todos (`WHERE owner_sub = user.sub`), but only admins may pass `?all=true`:

```python
@router.get("/todos", response_model=list[TodoOut])
def list_todos(
    all: bool = False,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    if all and not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin role required")
    stmt = select(Todo).order_by(Todo.created_at.desc())
    if not (all and user.is_admin):
        stmt = stmt.where(Todo.owner_sub == user.sub)
    return db.scalars(stmt).all()
```

### 3.5 User identity is persisted with business data

Store the user's **`sub`** (stable, never reused across IdPs) — not email or username — on
every record the user creates, for ownership and auditability:

```python
todo = Todo(title=payload.title, owner_sub=user.sub)
```

## 4. Token verification (the core)

This is where security lives. Steps, in order:

### 4.1 Fetch and cache the JWKS

Fetch the JWKS from `{issuer}/oidc/v1/keys` once and cache it in memory for a few minutes
(e.g. **300 s**) to avoid a network call per request. Any backend should do this; use a
distributed cache when running multiple instances.

```python
import time
import httpx

JWKS_CACHE: dict = {"keys": None, "fetched_at": 0.0}
JWKS_TTL = 300  # seconds

def _fetch_jwks() -> dict:
    settings = get_settings()
    now = time.time()
    cached = JWKS_CACHE["keys"]
    if cached is not None and now - JWKS_CACHE["fetched_at"] < JWKS_TTL:
        return cached
    resp = httpx.get(settings.zitadel_jwks_uri, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    JWKS_CACHE["keys"] = data
    JWKS_CACHE["fetched_at"] = now
    return data
```

### 4.2 Pick the right signing key

JWT headers contain a `kid` (key id). Match it against the JWKS. This makes **key rotation**
work: Zitadel rotates signing keys and tokens stay valid until `exp` as long as the old keys
remain in the JWKS. If the `kid` is unknown, either re-fetch the JWKS once (stale cache) or
reject the token.

### 4.3 Verify the JWT

Use a mature JWT library (PyJWT, `python-jose`, etc.):

```python
from jwt import PyJWKSet, get_unverified_header

def _resolve_signing_key(jwks: PyJWKSet, token: str):
    header = get_unverified_header(token)
    kid = header.get("kid")
    if kid:
        for key in jwks:
            if key.key_id == kid:
                return key
        raise jwt.InvalidTokenError(f"No key in JWKS matches kid {kid!r}")
    return next(iter(jwks))

def verify_token(token: str) -> UserPrincipal:
    settings = get_settings()
    jwks = PyJWKSet.from_dict(_fetch_jwks())
    payload = jwt.decode(
        token,
        _resolve_signing_key(jwks, token),
        algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"],
        issuer=settings.issuer,
        audience=settings.zitadel_audience,
        options={"verify_exp": True},
    )
    ...
```

Verified on every request: **signature** (using a key from the issuer's JWKS — never accept a
key supplied in the token), **issuer**, **audience**, **expiry**. Any failure → **401**.

### 4.4 Extract roles from claims

Zitadel embeds roles in the access token as namespaced claims. Handle both shapes:

- Project roles: `urn:zitadel:iam:org:project:roles` — `{ "role_name": { "<project-id>": true } }`
- Org roles: `urn:zitadel:iam:org:roles` — `{ "role_name": { "<org-id>": true } }`

```python
def _extract_roles(claims: dict) -> list[str]:
    roles: set[str] = set()
    for claim_name in ("urn:zitadel:iam:org:project:roles", "urn:zitadel:iam:org:roles"):
        mappings = claims.get(claim_name) or {}
        for role, mapping in mappings.items():
            # an EMPTY mapping means the role is not actually granted in that context
            if isinstance(mapping, dict) and mapping:
                roles.add(role)
    return sorted(roles)
```

> **Gotcha:** Zitadel emits role mappings that may be **empty objects** for roles that are not
> actually granted in that context. Only treat non-empty mappings as granted.
>
> **Gotcha:** access tokens are small, and Zitadel may omit role claims if they'd make the
> token too large. If your role model is large, resolve roles via the userinfo endpoint
> (`{issuer}/oidc/v1/userinfo`) or token introspection, and **cache the result** by `sub`
> (e.g. 900 s) to avoid a round-trip per request.

### 4.5 Enforce the role gate

- `get_current_user`: `roles ∩ zitadel_required_role ≠ ∅`, otherwise **403**.
- `require_admin`: additionally `roles ∩ admin_roles ≠ ∅`, otherwise **403**.

Maintain this contract everywhere: **401 = unauthenticated** (bad/missing/expired token),
**403 = authenticated but not allowed** (valid token, missing role).

## 5. The user principal object

A typed view of the authenticated user injected into handlers (in other stacks: a struct /
DTO / `ClaimsPrincipal`):

```python
from pydantic import BaseModel


class UserPrincipal(BaseModel):
    sub: str              # stable user id
    name: str             # display name, if known
    email: str
    roles: list[str]

    @property
    def is_admin(self) -> bool:
        return bool(set(self.roles) & set(get_settings().admin_roles))
```

Keep the admin definition in **one place** (here: the `is_admin` property driven by config) so
the admin role set only ever changes in config, never in route code.

## 6. The dependencies

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer_scheme = HTTPBearer(auto_error=False)


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
```

## 7. Wiring it into routes

Because dependencies compose, every route declares exactly the access level it needs:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import UserPrincipal, get_current_user, require_admin

router = APIRouter(prefix="/todos", tags=["todos"])


# any authenticated user — their own todos only
@router.get("", response_model=list[TodoOut])
def list_my_todos(
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    return db.scalars(select(Todo).where(Todo.owner_sub == user.sub)).all()


# admins only — any todo, can delete anything
@router.delete("/{todo_id}", status_code=204)
def delete_any_todo(
    todo_id: str,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(require_admin),
):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
```

## 8. Equivalent patterns in other frameworks

| Framework | Equivalent to `get_current_user` / `require_admin` |
| --- | --- |
| Express / Fastify | Auth middleware on the router + `req.user` set by middleware |
| Django / DRF | `IsAuthenticated` / custom permission classes |
| ASP.NET Core | `[Authorize]` + policy-based authorization with `ClaimsPrincipal` |
| Go (chi / gin) | Middleware validating the token and setting a user in context |

The rules stay the same everywhere: **validate once in a shared dependency/middleware, expose
a typed principal, and let each route declare its required level.**

## 9. Caching & performance summary

| Cache | Key | TTL | Why |
| --- | --- | --- | --- |
| JWKS | global | 300 s | Avoid an HTTP call to Zitadel per request |
| Userinfo / roles | `sub` | 900 s | Avoid userinfo round-trip per request |

## 10. Security checklist

- [ ] Verify the token **signature with the issuer's JWKS key**, matched by `kid`. Never
      accept a key from the token itself.
- [ ] Verify `iss`, `aud`, and `exp`. Never trust `iat` alone.
- [ ] Support key rotation — re-fetch JWKS on TTL expiry or when `kid` is unknown.
- [ ] Reject `alg: none`; whitelist algorithms explicitly.
- [ ] Use constant-time comparison for static keys (e.g. `hmac.compare_digest`).
- [ ] Keep the 401/403 contract: invalid token → 401, missing role → 403.
- [ ] Never log tokens; log `sub` at most.
- [ ] Do not call the userinfo endpoint with an unverified token.
- [ ] Store `sub` (not email/username) as the stable user identifier.
- [ ] Cache JWKS/userinfo, but allow a forced refresh.

## 11. Adding a new protected endpoint (recipe)

1. Add the route; default to `get_current_user` (any member).
2. If the operation creates/updates/deletes data, switch to `require_admin`.
3. If only *part* of the behavior differs by role, keep `get_current_user` and branch on
   `user.is_admin` (or `"admin" in user.roles`) inside the handler.
4. Stamp `user.sub` onto any records the handler creates.
5. Admitting a new role = config change only (`ZITADEL_REQUIRED_ROLE` / `ADMIN_ROLES`), no
   code change.