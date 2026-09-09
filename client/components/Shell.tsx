'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { ConfirmProvider, ToastProvider } from '@/components/feedback'
import { api } from '@/lib/api'
import { applyTheme, currentTheme } from '@/lib/theme'
import type { EventItem, ParticipantItem } from '@/lib/types'

export interface ShellUser {
  name: string
  email: string
  picture?: string | null
}

interface NavLink {
  href: string
  label: string
  icon: IconName
}

const NAV: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'gauge' },
  { href: '/events', label: 'Events', icon: 'calendar-days' },
  { href: '/participants', label: 'Participants', icon: 'users' },
  { href: '/checkin', label: 'Check-in', icon: 'qrcode' },
  { href: '/certificates', label: 'Certificate Vault', icon: 'award' },
]

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of Motion-U activity' },
  '/events': { title: 'Events', subtitle: 'Create and manage club programs' },
  '/participants': { title: 'Participants', subtitle: 'Roster of the selected program' },
  '/checkin': { title: 'Check-in', subtitle: 'Scan QR passes to join, or mark attendance manually' },
  '/certificates': { title: 'Certificate Vault', subtitle: 'Certificate templates for every program' },
}

const LOGO_TILE =
  'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl'

function Brand({ onNav }: { onNav?: () => void }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="Motion-U logo" className={`${LOGO_TILE} object-cover`} />
      <div className="min-w-0">
        <p className="font-display font-semibold leading-tight text-white">Motion-U</p>
        <p className="truncate text-[11px] leading-tight text-white/50">
          Movement &amp; Wellness Club
        </p>
      </div>
      {onNav && (
        <button
          onClick={onNav}
          aria-label="Close menu"
          className="ml-auto p-1 text-white/60 hover:text-white lg:hidden"
        >
          <Icon name="xmark" size={16} />
        </button>
      )}
    </div>
  )
}

function SidebarNav({ pathname, onNav }: { pathname: string; onNav: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`)
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNav}
            className={`nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
              active ? 'active' : 'text-white/80'
            }`}
          >
            <Icon name={l.icon} size={14} className="w-4 text-center" />
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarFooter({ user }: { user: ShellUser }) {
  return (
    <div className="shrink-0 border-t border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={user.name}
          picture={user.picture}
          className="h-8 w-8 text-xs"
          title={user.name}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white">{user.name}</p>
          <p className="truncate text-[11px] text-white/40">Club Committee</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Global search (programs + roster)                                   */
/* ------------------------------------------------------------------ */

interface SearchHit {
  event: EventItem
  participant?: ParticipantItem
}

function useCatalog() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const loading = useRef(false)
  const load = useCallback(async () => {
    if (events || loading.current) return
    loading.current = true
    try {
      const list = await api.listEvents()
      const withRoster = await Promise.all(
        list.map(async (ev) => {
          try {
            return { ev, roster: await api.listParticipants(ev.id) }
          } catch {
            return { ev, roster: [] }
          }
        })
      )
      setEvents(list)
      rosterRef.current = withRoster
    } finally {
      loading.current = false
    }
  }, [events])

  const rosterRef = useRef<{ ev: EventItem; roster: ParticipantItem[] }[] | null>(null)

  const search = useCallback(
    (q: string): SearchHit[] => {
      const v = q.toLowerCase()
      const hits: SearchHit[] = []
      for (const e of events ?? []) {
        if (e.title.toLowerCase().includes(v) || e.category.toLowerCase().includes(v)) {
          hits.push({ event: e })
        }
      }
      for (const { ev, roster } of rosterRef.current ?? []) {
        for (const p of roster) {
          if (p.name.toLowerCase().includes(v) || p.student_id.toLowerCase().includes(v)) {
            hits.push({ event: ev, participant: p })
            if (hits.length >= 8) return hits
          }
        }
      }
      return hits.slice(0, 8)
    },
    [events]
  )

  return { events, load, search }
}

function SearchBox() {
  const { load, search, events } = useCatalog()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement | null>(null)
  const results = useMemo(() => (q.trim() ? search(q.trim()) : []), [q, search])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const focus = () => {
    setOpen(true)
    load()
  }

  return (
    <div ref={boxRef} className="relative hidden md:block">
      <Icon
        name="magnifying-glass"
        size={12}
        className="absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--ink-soft)' }}
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={focus}
        placeholder="Search events or participants"
        aria-label="Search events or participants"
        className="w-64 rounded-lg border border-border py-2 pl-8 pr-3 text-sm outline-none ring-0 focus:outline-none"
        style={{ ['--tw-ring-color' as never]: 'var(--primary-light)' }}
      />
      {open && q.trim().length > 0 && (
        <div className="surface absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-border py-1.5 shadow-lg">
          {!events ? (
            <p className="px-4 py-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
              Loading programs…
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
              No programs or roster members match “{q}”.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {results.map((r, i) =>
                r.participant ? (
                  <Link
                    key={`p${i}`}
                    href={`/participants?e=${r.event.id}&q=${encodeURIComponent(r.participant.name)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-2"
                  >
                    <Avatar
                      name={r.participant.name}
                      id={r.participant.id}
                      className="h-7 w-7 text-[10px]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{r.participant.name}</p>
                      <p className="truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                        {r.participant.student_id} · {r.event.title}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <Link
                    key={`e${i}`}
                    href={`/events/${r.event.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-2"
                  >
                    <div className="surface flex h-7 w-7 items-center justify-center rounded-lg bg-primary-light text-primary">
                      <Icon name="calendar-days" size={12} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{r.event.title}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                        Program
                      </p>
                    </div>
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function Notifications() {
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState<EventItem[] | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const toggle = () => {
    setOpen((o) => !o)
    if (!loaded.current) {
      loaded.current = true
      api
        .listEvents()
        .then((list) => {
          const todayStr = new Date().toISOString().slice(0, 10)
          setToday(list.filter((e) => e.sessions.some((s) => s.date === todayStr)))
        })
        .catch(() => setToday([]))
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="hover-soft relative flex h-9 w-9 items-center justify-center rounded-lg border border-border"
        style={{ color: 'var(--ink)' }}
      >
        <Icon name="bell" size={14} />
        {(today?.length ?? 0) > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] text-white"
            style={{ background: 'var(--btn-danger)' }}
          >
            {today!.length}
          </span>
        )}
      </button>
      {open && (
        <div className="surface absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-border shadow-lg">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Notifications
          </div>
          <div className="divide-y divide-border">
            {today === null && <div className="px-4 py-3 text-xs">Loading…</div>}
            {today !== null && today.length === 0 && (
              <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
                Nothing needs attention right now.
              </div>
            )}
            {today?.map((ev) => (
              <div key={ev.id} className="px-4 py-3 text-sm">
                <span className="font-medium">{ev.title}</span> is happening today — QR check-in
                is ready.
                <Link
                  href="/checkin"
                  onClick={() => setOpen(false)}
                  className="mt-1 block text-xs font-semibold underline"
                  style={{ color: 'var(--primary)' }}
                >
                  Go to check-in
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Theme + user                                                        */
/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const onClick = () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  }
  return (
    <button
      onClick={onClick}
      aria-label="Toggle dark mode"
      className="hover-soft flex h-9 w-9 items-center justify-center rounded-lg border border-border"
      style={{ color: 'var(--ink)' }}
    >
      <span className="theme-ic theme-ic-light">
        <Icon name="moon" size={14} />
      </span>
      <span className="theme-ic theme-ic-dark">
        <Icon name="sun" size={14} />
      </span>
    </button>
  )
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" className="block">
        <Avatar name={user.name} picture={user.picture} className="h-9 w-9 text-xs" />
      </button>
      {open && (
        <div className="surface absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-xl border border-border shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-soft)' }}>
              {user.email}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/logout"
            className="row-menu-item danger"
            style={{ color: 'var(--danger)' }}
          >
            <Icon name="arrow-right-from-bracket" size={12} className="w-4 text-center" />
            Sign out
          </a>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export default function Shell({
  user,
  children,
}: {
  user: ShellUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState(false)
  const meta = PAGE_META[pathname] ?? {
    title: 'Motion-U',
    subtitle: pathname.startsWith('/events/') ? 'Program hub' : '',
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          <aside
            className={`fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
              drawer ? 'translate-x-0' : ''
            }`}
            style={{ background: 'linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar-2) 100%)' }}
          >
            <Brand onNav={drawer ? () => setDrawer(false) : undefined} />
            <SidebarNav pathname={pathname} onNav={() => setDrawer(false)} />
            <SidebarFooter user={user} />
          </aside>

          {drawer && (
            <div
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            />
          )}

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="surface sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
              <button
                onClick={() => setDrawer(true)}
                aria-label="Open menu"
                className="hover-soft -ml-1 rounded-lg p-1.5 lg:hidden"
                style={{ color: 'var(--ink-soft)' }}
              >
                <Icon name="bars" size={16} />
              </button>
              <div className="min-w-0">
                <h1 className="font-display truncate text-lg font-semibold leading-tight">
                  {meta.title}
                </h1>
                <p className="truncate text-xs leading-tight" style={{ color: 'var(--ink-soft)' }}>
                  {meta.subtitle}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2 md:gap-3">
                <SearchBox />
                <ThemeToggle />
                <Notifications />
                <UserMenu user={user} />
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
