import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const PROTECTED_PREFIXES = ['/dashboard', '/events', '/participants', '/checkin', '/certificates']

export async function proxy(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isLoginRoute = pathname === '/login'

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isLoginRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/events/:path*',
    '/participants/:path*',
    '/checkin/:path*',
    '/certificates/:path*',
    '/login',
  ],
}
