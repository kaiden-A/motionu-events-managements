import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import Shell, { type ShellUser } from '@/components/Shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user: ShellUser = {
    name: session.name || 'Admin',
    email: session.email,
    picture: session.picture ?? null,
  }

  return <Shell user={user}>{children}</Shell>
}
