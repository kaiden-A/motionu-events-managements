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
