import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { buildAuthorizeUrl, generatePKCE } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`

  const { code_verifier, code_challenge } = generatePKCE()
  const state = randomBytes(16).toString('hex')
  const nonce = randomBytes(16).toString('hex')

  const authorizeUrl = await buildAuthorizeUrl(redirectUri, code_challenge, state, nonce)

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
