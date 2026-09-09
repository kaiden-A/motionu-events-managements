# Zitadel OIDC Integration Blueprint (Next.js App Router)

> **Purpose:** This document is a reusable blueprint for adding **Zitadel** single sign-on (OIDC Authorization Code + PKCE) to any Next.js (App Router) application. It is written from the working implementation in the **Athena-Neura admin** app, so every file below exists in this repository and can be copied/adapted directly.

---

## 1. How the Flow Works

```
Browser                Next.js App                     Zitadel
   │                        │                             │
   │  1. GET /api/auth/login │                             │
   │───────────────────────▶ │  2. build authorize URL     │
   │                         │    (PKCE challenge, state,  │
   │                         │     nonce, org scope)       │
   │                         │────────────────────────────▶│
   │  3. 302 → Zitadel login │◀────────────────────────────│
   │◀─────────────────────── │                             │
   │  4. User authenticates  │                             │
   │                         │                             │
   │  5. 302 back → /api/auth/callback?code=…&state=…      │
   │───────────────────────▶ │                             │
   │                         │  6. exchange code + verifier│
   │                         │     for tokens              │
   │                         │────────────────────────────▶│
   │                         │  7. verify ID token         │
   │                         │    (signature, issuer,      │
   │                         │     nonce, org membership)  │
   │                         │                             │
   │  8. Set session cookie  │                             │
   │◀─────────────────────── │                             │
   │  9. GET /dashboard (protected)                         │
   │───────────────────────▶ │  proxy.ts checks session    │
   │                         │                             │
   │ 10. GET /api/auth/logout│                             │
   │───────────────────────▶ │  11. clear cookie + redirect│
   │                         │      to Zitadel end session │
   │◀─────────────────────── │────────────────────────────▶│
```

**In short:**
1. The app never sees the user's password — Zitadel owns authentication.
2. The app verifies the **ID token** (signature, issuer, `nonce`, org claim) and mints its **own session JWT** in an `httpOnly` cookie.
3. All protected routes are guarded by the edge proxy which decrypts that session cookie on every request.

---

## 2. Prerequisites: Zitadel Console Setup

These steps are done once in the Zitadel console (not in code).

1. **Create a project** (e.g. `My App`) and add your organization context.
2. **Add an application** of type **Web**.
3. For the app, select **Authorization Code** as the grant type and enable **PKCE** (the code in this repo requires PKCE — `code_challenge_method: S256`).
4. **Redirect URIs** (must match the app exactly):
   - `http://localhost:3000/api/auth/callback` (dev)
   - `https://<your-domain>/api/auth/callback` (production)
5. **Post-logout redirect URIs**:
   - `http://localhost:3000` (dev)
   - `https://<your-domain>` (production)
   - The repo's logout code redirects to `request.nextUrl.origin`, so register the bare origin.
6. **Copy the values you need:**
   - `Issuer URL` (e.g. `https://xxxx-xxxx.us1.zitadel.cloud`)
   - `Client ID` (numeric string shown in the app settings)
   - **Organization ID** — navigate to your organization settings in the console; the URL contains the org id, and it is also embedded in Zitadel-issued ID tokens as the `urn:zitadel:iam:user:resourceowner:id` claim.

> **Org restriction (optional but recommended):** this blueprint hard-restricts sign-in to members of a single organization. The ID token's `urn:zitadel:iam:user:resourceowner:id` claim is compared to `ZITADEL_ALLOWED_ORG_ID`. If the user belongs to any other org, they are rejected with `forbidden_org`.

---

## 3. Environment Variables

Add to `.env` (and the deployment platform's env settings):

```bash
# Zitadel
ZITADEL_ISSUER=https://your-instance.zitadel.cloud          # no trailing slash
ZITADEL_CLIENT_ID=<client-id-from-console>
ZITADEL_ALLOWED_ORG_ID=<organization-id>

# Used to sign/verify the app's own session cookie JWT (HS256)
NEXTAUTH_SECRET=<at-least-32-random-chars>
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Never commit these values.** Keep `.env` in `.gitignore`.

---

## 4. Dependency

Only one extra runtime dependency is required:

```bash
npm install jose
```

`jose` provides JWT signing/verification and remote JWKS fetching. (No full OIDC client library needed — the flow is small enough to implement directly, which keeps it dependency-light and easy to audit.)

---

## 5. Core Auth Library — `lib/auth.ts`

This is the heart of the integration. Copy it and adjust the `Session` interface / claims to your needs.

```ts
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'
import { createHash, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'session'

export interface Session {
  sub: string
  name: string
  email: string
  email_verified: boolean
  access_token: string
  expires_at: number
}

const ISSUER = process.env.ZITADEL_ISSUER!
const CLIENT_ID = process.env.ZITADEL_CLIENT_ID!
const ALLOWED_ORG_ID = process.env.ZITADEL_ALLOWED_ORG_ID!
const SESSION_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)

export class OrgForbiddenError extends Error {
  constructor() {
    super('User is not a member of the allowed organization')
    this.name = 'OrgForbiddenError'
  }
}

interface Discovery {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  end_session_endpoint: string
  jwks_uri: string
}

let discoveryPromise: Promise<Discovery> | null = null

export function getDiscovery(): Promise<Discovery> {
  if (!discoveryPromise) {
    discoveryPromise = fetch(`${ISSUER}/.well-known/openid-configuration`).then((res) =>
      res.json()
    )
  }
  return discoveryPromise
}

export function generatePKCE() {
  const code_verifier = Buffer.from(randomBytes(32)).toString('base64url')
  const code_challenge = createHash('sha256')
    .update(code_verifier)
    .digest('base64url')
  return { code_verifier, code_challenge }
}

export async function buildAuthorizeUrl(
  redirectUri: string,
  codeChallenge: string,
  state: string,
  nonce: string
) {
  const discovery = await getDiscovery()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'profile',
      'email',
      `urn:zitadel:iam:org:id:${ALLOWED_ORG_ID}`,
      'urn:zitadel:iam:user:resourceowner',
    ].join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${discovery.authorization_endpoint}?${params}`
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  access_token: string
  id_token: string
  expires_in?: number
}> {
  const discovery = await getDiscovery()
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${body}`)
  }

  return res.json()
}

export async function verifyIdToken(idToken: string, nonce: string) {
  const discovery = await getDiscovery()
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUER,
    algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'],
  })

  if (payload.nonce !== nonce) {
    throw new Error('ID token nonce mismatch')
  }

  const orgId = payload['urn:zitadel:iam:user:resourceowner:id'] as string | undefined
  if (!orgId || orgId !== ALLOWED_ORG_ID) {
    throw new OrgForbiddenError()
  }

  return payload
}

export async function buildLogoutUrl(
  postLogoutRedirectUri: string,
  idTokenHint?: string
) {
  const discovery = await getDiscovery()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: postLogoutRedirectUri,
  })
  if (idTokenHint) params.set('id_token_hint', idTokenHint)
  return `${discovery.end_session_endpoint}?${params}`
}

export async function createSessionToken(session: Session) {
  return new SignJWT({
    name: session.name,
    email: session.email,
    email_verified: session.email_verified,
    access_token: session.access_token,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(session.expires_at)
    .sign(SESSION_SECRET)
}

export async function decryptSessionToken(
  token: string | undefined
): Promise<Session | null> {
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET, {
      algorithms: ['HS256'],
    })
    return {
      sub: (payload.sub as string) || '',
      name: (payload.name as string) || '',
      email: (payload.email as string) || '',
      email_verified: !!payload.email_verified,
      access_token: (payload.access_token as string) || '',
      expires_at: (payload.exp as number) || 0,
    }
  } catch {
    return null
  }
}

export function getSessionFromRequest(request: NextRequest) {
  return decryptSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
}
```

**Why it's structured this way:**

| Concern | Where | Why |
|---|---|---|
| Discovery document | `getDiscovery()` (cached promise) | One fetch, reused across login/callback/logout; auto-follows Zitadel endpoint changes |
| PKCE | `generatePKCE()` | Zitadel web apps should use PKCE; the verifier must be stored between requests (see `oidc-state` cookie below) |
| Scopes | `buildAuthorizeUrl()` | `openid profile email` for claims; the two `urn:zitadel:...` scopes make the org claim available and add `resourceowner` to the token |
| ID token verification | `verifyIdToken()` | Signature via Zitadel's JWKS, `issuer` pinning, **`nonce` replay check**, and org membership check |
| App session | `createSessionToken()` / `decryptSessionToken()` | The app signs its own short-lived HS256 JWT so downstream code never re-validates against Zitadel on every request |
| Logout | `buildLogoutUrl()` | Single-sign-out: end the Zitadel session *and* clear the app cookie |

---

## 6. Server-Session Helper — `lib/session.ts`

A small convenience wrapper for use inside Server Components / Route Handlers:

```ts
import { cookies } from 'next/headers'
import { decryptSessionToken, SESSION_COOKIE, type Session } from '@/lib/auth'

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  return decryptSessionToken(cookieStore.get(SESSION_COOKIE)?.value)
}
```

---

## 7. Route Handlers — `/app/api/auth/*`

### 7.1 `GET /api/auth/login` — start the OIDC flow

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { buildAuthorizeUrl, generatePKCE } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`

  const { code_verifier, code_challenge } = generatePKCE()
  const state = randomBytes(16).toString('hex')
  const nonce = randomBytes(16).toString('hex')

  const authorizeUrl = await buildAuthorizeUrl(
    redirectUri,
    code_challenge,
    state,
    nonce
  )

  const response = NextResponse.redirect(authorizeUrl)

  response.cookies.set(
    'oidc-state',
    encodeURIComponent(JSON.stringify({ state, nonce, code_verifier })),
    {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    }
  )

  return response
}
```

**Key points:**
- `state`, `nonce`, and `code_verifier` are stashed in a short-lived **`httpOnly` cookie** (`maxAge: 600` = 10 min) so they survive the redirect round-trip.
- `sameSite: 'lax'` — required so the cookie is sent when the browser follows the redirect back to `/api/auth/callback`.
- `secure` mirrors the request protocol — set only over HTTPS.

### 7.2 `GET /api/auth/callback` — exchange + verify + mint session

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  createSessionToken,
  exchangeCodeForTokens,
  OrgForbiddenError,
  SESSION_COOKIE,
  verifyIdToken,
  type Session,
} from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state || searchParams.get('error')) {
    return NextResponse.redirect(new URL('/login?error=access_denied', request.nextUrl))
  }

  const oidcState = JSON.parse(
    request.cookies.get('oidc-state')?.value
      ? decodeURIComponent(request.cookies.get('oidc-state')!.value)
      : '{}'
  ) as { state?: string; nonce?: string; code_verifier?: string }

  if (
    !oidcState.state ||
    oidcState.state !== state ||
    !oidcState.nonce ||
    !oidcState.code_verifier
  ) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', request.nextUrl))
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`

  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>
  try {
    tokens = await exchangeCodeForTokens(code, oidcState.code_verifier, redirectUri)
  } catch {
    return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.nextUrl))
  }

  let claims: Awaited<ReturnType<typeof verifyIdToken>>
  try {
    claims = await verifyIdToken(tokens.id_token, oidcState.nonce)
  } catch (e) {
    if (e instanceof OrgForbiddenError) {
      return NextResponse.redirect(new URL('/login?error=forbidden_org', request.nextUrl))
    }
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.nextUrl))
  }

  const expiresIn = Math.max(tokens.expires_in || 12 * 60 * 60, 60)

  const session: Session = {
    sub: (claims.sub as string) || '',
    name:
      (claims.name as string) ||
      (claims.preferred_username as string) ||
      '',
    email: (claims.email as string) || '',
    email_verified: !!claims.email_verified,
    access_token: tokens.access_token,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  }

  const sessionToken = await createSessionToken(session)

  const response = NextResponse.redirect(new URL('/dashboard', request.nextUrl))

  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: expiresIn,
  })

  response.cookies.delete('oidc-state')

  return response
}
```

**The exact order matters — treat each step as a gate:**
1. **Fail if** `code`, `state`, or an OAuth `error` param is missing → `access_denied`.
2. **CSRF check:** compare the returned `state` against the one in the `oidc-state` cookie → `invalid_state`.
3. **Token exchange** with the PKCE `code_verifier` → `token_exchange_failed`.
4. **Verify the ID token** (signature, issuer, nonce, org) → `invalid_token` / `forbidden_org`.
5. **Mint the app session JWT**, set the `httpOnly` cookie, delete the one-time `oidc-state` cookie, redirect to `/dashboard`.

### 7.3 `GET /api/auth/logout` — local + single sign-out

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildLogoutUrl, getSessionFromRequest, SESSION_COOKIE } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)

  const response = NextResponse.redirect(new URL('/login', request.nextUrl))
  response.cookies.delete(SESSION_COOKIE)

  if (session?.sub) {
    const logoutUrl = await buildLogoutUrl(request.nextUrl.origin)
    const logoutResponse = NextResponse.redirect(logoutUrl)
    logoutResponse.cookies.delete(SESSION_COOKIE)
    return logoutResponse
  }

  return response
}
```

- Always clears the app cookie first (even if the Zitadel session already expired).
- Redirects to Zitadel's `end_session_endpoint` with `post_logout_redirect_uri` = app origin → Zitadel sends the user back to `/` which re-routes to `/login`.

### 7.4 `GET /api/auth/me` — current user for the client

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      email: session.email,
      name: session.name,
      verified: session.email_verified,
    },
  })
}
```

Expose only what the UI needs. Never return the raw `access_token` or the session JWT.

---

## 8. Route Protection — the auth proxy

> **Note on naming:** this repo runs a Next.js version where the edge middleware file is named `proxy.ts` (exported `proxy`, with `config.matcher`). On standard Next.js releases the equivalent is `middleware.ts` exporting `middleware`. Check your framework's docs before copying.

`proxy.ts` (project root):

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get('session')?.value
  const session = await getSessionFromRequest(request)

  if (cookie) {
    console.log(
      '[proxy] session cookie len:',
      cookie.length,
      'decrypt ok:',
      !!session,
      session ? `sub=${session.sub} exp=${session.expires_at}` : ''
    )
  } else if (request.nextUrl.pathname.startsWith('/dashboard')) {
    console.log('[proxy] NO session cookie on', request.nextUrl.pathname)
  }

  const { pathname } = request.nextUrl

  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isLoginRoute = pathname === '/login'

  if (isDashboardRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isLoginRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
```

**Rule of thumb:** the proxy handles *redirects*; the session cookie is the single source of truth. Every protected page should additionally assume the session may be absent (never trust the proxy alone for authorization on sensitive endpoints — re-check in the route handler/server component).

---

## 9. Client-Side Usage

### 9.1 Landing page redirect (`app/page.tsx`)

```ts
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function Home() {
  const session = await getSession()

  if (session) redirect('/dashboard')
  redirect('/login')
}
```

### 9.2 Sign-in button (`app/login/`)

```tsx
<a
  href="/api/auth/login"
  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg"
>
  <LogIn size={15} />
  Sign in with Zitadel
</a>
```

### 9.3 Error surfacing

The login page maps the `?error=` param to human-readable messages:

```tsx
const errorFromParams = (params: URLSearchParams) => {
  switch (params.get('error')) {
    case 'access_denied':
      return 'Sign in was cancelled or not allowed.'
    case 'invalid_state':
      return 'Sign in failed. Please try again.'
    case 'token_exchange_failed':
      return 'Could not complete sign in. Please try again.'
    case 'invalid_token':
      return 'Sign in verification failed. Please try again.'
    case 'forbidden_org':
      return 'Your account is not authorized to access this workspace.'
    default:
      return params.get('error')
        ? 'Sign in failed. Please try again.'
        : ''
  }
}
```

### 9.4 Showing the user + logout (e.g. sidebar)

Fetch `/api/auth/me` through React Query:

```ts
export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<User | null> => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) return null
      const data = await res.json()
      return data.user ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

Logout is a full-page navigation (the response is a redirect to Zitadel — a `fetch` would swallow it):

```ts
function handleLogout() {
  window.location.href = '/api/auth/logout'
}
```

---

## 10. Security Checklist

- [ ] `code_challenge_method` is `S256` (never `plain`).
- [ ] `code_verifier` is high-entropy (32 random bytes) and only kept in the `httpOnly` `oidc-state` cookie.
- [ ] `state` is verified on callback (CSRF protection).
- [ ] `nonce` is verified on callback (replay protection).
- [ ] ID token signature is verified against Zitadel's remote JWKS with **pinned issuer**.
- [ ] Session cookie is `httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`.
- [ ] `NEXTAUTH_SECRET` is ≥ 32 random bytes and only set server-side.
- [ ] `/api/auth/me` never exposes tokens.
- [ ] Redirect URIs in the Zitadel console match your app exactly (including trailing paths).
- [ ] Real production traffic goes over HTTPS (cookies won't set over plain HTTP when `secure: true`).

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Sign in was cancelled" (`access_denied`) after login | Redirect URI mismatch, or user cancelled | Verify `Redirect URIs` in Zitadel console match `http(s)://<host>/api/auth/callback` exactly |
| "Sign in failed" (`invalid_state`) | `oidc-state` cookie missing/expired (10 min), or `sameSite` too strict | Retry the flow; keep `sameSite: 'lax'`; don't block cookies in the test browser |
| `Token exchange failed` in server logs | Wrong `client_id`, grant type isn't Authorization Code, or PKCE disabled on the app | Check Zitadel app settings: grant **Authorization Code**, PKCE enabled |
| `invalid_token` | Wrong issuer, or ID token `nonce` mismatch | Confirm `ZITADEL_ISSUER` has **no trailing slash**; restart after env changes |
| `forbidden_org` | User's org ≠ `ZITADEL_ALLOWED_ORG_ID` | Confirm the org id; check the claim by decoding the ID token on jwt.io |
| Loop redirect to `/login` | Session cookie not decrypting (secret changed) or `expires_at` in the past | Keep `NEXTAUTH_SECRET` stable across deploys; check `[proxy]` logs |
| Cookie not set on production | `secure: true` over HTTP | Ensure HTTPS end-to-end |
| Works in dev, fails in prod | Env vars missing in the deployment | Compare `.env` vs platform env settings |

**Logging aids already in place:** the callback logs session-cookie length/`maxAge`; the proxy logs cookie presence, decrypt success, `sub`, and `exp` for every guarded request.

---

## 12. File Map (for copy-paste)

```
.env                                        # ZITADEL_* + NEXTAUTH_SECRET
lib/auth.ts                                 # core: discovery, PKCE, URLs, verify, session JWT
lib/session.ts                              # getSession() for server components/route handlers
proxy.ts                                    # edge auth guard (middleware equivalent)
app/page.tsx                                # / redirect based on session
app/login/page.tsx                          # login UI + error messages
app/api/auth/login/route.ts                 # start OIDC flow
app/api/auth/callback/route.ts              # exchange → verify → session cookie
app/api/auth/logout/route.ts                # clear cookie + Zitadel end session
app/api/auth/me/route.ts                    # current user for client components
components/layout/Sidebar.tsx               # example: shows user, calls logout
lib/queries.ts (useCurrentUser)             # example: client fetch of /api/auth/me
```

---

## 13. Adapting to Other Next.js Apps

1. **Copy** `lib/auth.ts` + `lib/session.ts`, the four route handlers, and the proxy — nothing else is required for a working login.
2. **Adjust the `Session` interface** to the claims your app needs (e.g. add `roles`, `groups` — request extra scopes in `buildAuthorizeUrl` if needed).
3. **Redirect target** after login: change `new URL('/dashboard', ...)` to your app's protected home.
4. **Sessions are stateless JWTs** — if you need revocation, store a session id (`jti`) server-side instead.
5. **Refresh tokens:** the current blueprint does not use them. For long-lived sessions, request the `offline_access` scope, store the refresh token, and add a silent-refresh endpoint that re-mints the session cookie before expiry.