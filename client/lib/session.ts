import { cookies } from 'next/headers'
import { decryptSessionToken, SESSION_COOKIE, type Session } from '@/lib/auth'

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  return decryptSessionToken(cookieStore.get(SESSION_COOKIE)?.value)
}
