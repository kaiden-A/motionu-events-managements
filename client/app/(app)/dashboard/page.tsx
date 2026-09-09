'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { api } from '@/lib/api'
import { ACTIVITY_META } from '@/lib/activity'
import { eventStatus, dayLine, fmtWhen, formatDate, to12h } from '@/lib/format'
import type { DashboardData, EventItem } from '@/lib/types'

interface SpotlightStats {
  total: number
  sent: number
}

function useSpotlightStats(eventId: string | null): SpotlightStats {
  const [stats, setStats] = useState<SpotlightStats>({ total: 0, sent: 0 })
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api
      .listParticipants(eventId)
      .then((roster) => {
        if (cancelled) return
        const sent = roster.filter((p) => p.attendance.some((a) => a.qr_sent_at)).length
        setStats({ total: roster.length, sent })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eventId])
  return stats
}

function Spotlight({ ev }: { ev: EventItem }) {
  const { total, sent } = useSpotlightStats(ev.id)
  const status = eventStatus(ev)
  const pct = Math.min(100, Math.round((total / Math.max(1, ev.capacity)) * 100))
  const session = ev.sessions[0]

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white md:p-8"
        style={{ background: 'linear-gradient(120deg, var(--primary-dark), var(--primary) 58%, var(--energy-dark))' }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: 'radial-gradient(circle at 85% 15%, var(--energy), transparent 45%)' }}
        />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            {session && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                <Icon name={status === 'ongoing' ? 'bolt' : 'clock'} size={10} />
                {dayLine(session.date)}
              </span>
            )}
            <h2 className="font-display mt-3 text-2xl font-semibold leading-tight md:text-3xl">
              {ev.title}
            </h2>
            {session && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/85">
                <span className="inline-flex items-center">
                  <Icon name="calendar" size={13} className="mr-1.5" />
                  {formatDate(session.date)}
                </span>
                <span className="inline-flex items-center">
                  <Icon name="clock" size={13} className="mr-1.5" />
                  {to12h(session.start_time)} – {to12h(session.end_time)}
                </span>
                <span className="inline-flex items-center">
                  <Icon name="location-dot" size={13} className="mr-1.5" />
                  {session.location}
                </span>
              </div>
            )}
            <div className="mt-4 max-w-xs">
              <div className="mb-1 flex justify-between text-xs text-white/70">
                <span>
                  {total} of {ev.capacity} in roster
                </span>
                <span className="num">{pct}%</span>
              </div>
              <div className="progress-track h-1.5 bg-white/20">
                <div className="progress-fill bg-white" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 md:flex-col">
            <Link
              href={`/events/${ev.id}`}
              className="rounded-lg bg-white px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap"
              style={{ color: 'var(--primary-dark)' }}
            >
              View program
            </Link>
            {status === 'ongoing' && (
              <Link
                href="/checkin"
                className="rounded-lg bg-white/15 px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap hover:bg-white/25"
              >
                QR check-in
              </Link>
            )}
            <Link
              href="/participants"
              className="rounded-lg bg-white/10 px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap hover:bg-white/20"
            >
              Roster ({total})
            </Link>
          </div>
        </div>
      </div>
      {status === 'ongoing' && sent > 0 && (
        <div
          className="surface mt-3 flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-medium"
        >
          <Icon name="qrcode" size={12} style={{ color: 'var(--primary)' }} />
          <span>
            QR passes emailed to {sent} of {total} roster members.
          </span>
          <Link
            href="/checkin"
            className="ml-auto text-xs font-semibold underline"
            style={{ color: 'var(--primary)' }}
          >
            Go to check-in
          </Link>
        </div>
      )}
    </>
  )
}

const STATS: { label: string; key: keyof DashboardData; icon: IconName; color: string; suffix?: string }[] = [
  { label: 'Total programs', key: 'events', icon: 'calendar-days', color: 'var(--primary)' },
  { label: 'Participants across rosters', key: 'participants', icon: 'users', color: 'var(--energy)' },
  { label: 'Certificates issued', key: 'certificates', icon: 'award', color: 'var(--warn)' },
  { label: 'Attendance rate', key: 'attendance_rate', icon: 'chart-simple', color: 'var(--success)', suffix: '%' },
]

function DashboardStats({ data }: { data: DashboardData }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STATS.map((s) => {
        const value = data[s.key]
        return (
          <div key={s.key} className="surface rounded-2xl border border-border p-4">
            <div
              className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}
            >
              <Icon name={s.icon} size={14} />
            </div>
            <p className="font-display num text-2xl font-semibold leading-none">
              {typeof value === 'number' ? value : '—'}
              {s.suffix}
            </p>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {s.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ActivityFeed({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-4">
      {data.activity.slice(0, 8).map((a, i) => {
        const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.event
        return (
          <div key={i} className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${meta.colorVar} 14%, transparent)`,
                color: meta.colorVar,
              }}
            >
              <Icon name={meta.icon as IconName} size={12} />
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-snug">{a.text}</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {fmtWhen(a.created_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const QUICK_ACTIONS: { label: string; icon: IconName; href: string; primary?: boolean }[] = [
  { label: 'Create program', icon: 'plus', href: '/events', primary: true },
  { label: 'Add participant to roster', icon: 'user-plus', href: '/participants' },
  { label: 'Go to QR check-in', icon: 'qrcode', href: '/checkin' },
  { label: 'Open certificate vault', icon: 'award', href: '/certificates' },
]

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message))
  }, [])

  const spotlight = useMemo(() => {
    if (!data) return null
    const list = data.events_list ?? []
    const ongoing = list.find((e) => eventStatus(e) === 'ongoing')
    if (ongoing) return ongoing
    return [...list].sort(
      (a, b) => new Date(a.sessions[0]?.date ?? '').getTime() - new Date(b.sessions[0]?.date ?? '').getTime()
    )[0]
  }, [data])

  if (error) {
    return (
      <div className="surface rounded-2xl border border-border p-5 text-sm text-red-600">
        {error}
      </div>
    )
  }
  if (!data) return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</p>

  return (
    <div>
      {spotlight ? (
        <Spotlight ev={spotlight} />
      ) : (
        <div className="surface rounded-2xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            No programs yet. Create one and build its roster with QR passes.
          </p>
          <Link
            href="/events"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white"
          >
            <Icon name="plus" size={12} />
            Create program
          </Link>
        </div>
      )}

      <DashboardStats data={data} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="surface rounded-2xl border border-border p-5 lg:col-span-2">
          <h3 className="font-display mb-4 font-semibold">Recent activity</h3>
          {data.activity.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
              No activity yet — it will show up here as rosters grow.
            </p>
          ) : (
            <ActivityFeed data={data} />
          )}
        </div>

        <div className="surface rounded-2xl border border-border p-5">
          <h3 className="font-display mb-4 font-semibold">Quick actions</h3>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  a.primary
                    ? 'bg-btn-primary text-white'
                    : 'border border-border hover-soft'
                }`}
              >
                <Icon name={a.icon} size={13} className="w-4 text-center" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
