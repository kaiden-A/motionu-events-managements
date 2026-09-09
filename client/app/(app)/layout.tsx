'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/events', label: 'Programs' },
  { href: '/participants', label: 'Participants' },
  { href: '/checkin', label: 'Check-in' },
  { href: '/certificates', label: 'Cert Vault' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col bg-[#17172b] p-4 text-white md:flex">
        <p className="px-2 text-xs font-semibold uppercase tracking-widest text-violet-300">
          Motion-U
        </p>
        <nav className="mt-4 flex flex-col gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname.startsWith(l.href) ? 'bg-violet-700' : 'hover:bg-white/10'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => (window.location.href = '/api/auth/logout')}
          className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/10"
        >
          Sign out
        </button>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex gap-1 overflow-x-auto bg-[#17172b] p-2 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-white ${
                pathname.startsWith(l.href) ? 'bg-violet-700' : 'bg-white/10'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
