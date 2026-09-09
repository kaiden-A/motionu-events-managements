'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { EmptyState, Progress } from '@/components/ui'
import { api } from '@/lib/api'
import { categoryMeta } from '@/lib/category'
import { eventStatus, formatDate, statusLabel, to12h } from '@/lib/format'
import type { AttendanceItem, EventItem, ParticipantItem } from '@/lib/types'

function SessionBadge({ a }: { a: AttendanceItem }) {
  const cls =
    a.attended === true
      ? 'chip-success'
      : a.attended === false
        ? 'chip-danger'
        : a.qr_token
          ? 'chip-info'
          : 'chip-muted'
  const icon: IconName =
    a.attended === true ? 'circle-check' : a.attended === false ? 'xmark' : a.qr_token ? 'qrcode' : 'lock'
  const label = a.attended === true ? 'joined' : a.attended === false ? 'no-show' : a.qr_token ? 'pass ready' : 'locked'
  return (
    <span className={`chip ${cls}`} title={`${a.label}: ${label}`}>
      <Icon name={icon} size={10} />
      {a.label}
    </span>
  )
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [event, setEvent] = useState<EventItem | null>(null)
  const [roster, setRoster] = useState<ParticipantItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .getEvent(id)
      .then((e) => {
        if (!alive) return
        setEvent(e)
        return api.listParticipants(id)
      })
      .then((roster) => {
        if (!alive) return
        if (roster) setRoster(roster)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (!loaded) return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</p>
  if (!event) {
    return (
      <EmptyState icon="triangle-exclamation" title="Program not found" hint="It may have been deleted.">
        <Link
          href="/events"
          className="rounded-lg bg-btn-primary px-4 py-2 text-xs font-semibold text-white"
        >
          Back to programs
        </Link>
      </EmptyState>
    )
  }

  const cat = categoryMeta(event.category)
  const status = eventStatus(event)
  const joined = roster.flatMap((p) => p.attendance).filter((a) => a.attended === true).length
  const pct = Math.min(100, Math.round((roster.length / Math.max(1, event.capacity)) * 100))

  return (
    <div className="space-y-5">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold underline"
        style={{ color: 'var(--primary)' }}
      >
        <Icon name="arrow-left" size={11} />
        Back to programs
      </Link>

      <div className="surface rounded-2xl border border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className={`cat-chip ${cat.chipClass}`}>
                <Icon name={cat.icon as IconName} size={12} />
                {event.category}
              </span>
              <span
                className={`chip ${
                  status === 'ongoing' ? 'chip-success' : status === 'past' ? 'chip-muted' : 'chip-info'
                }`}
              >
                <span className="status-dot" style={{ background: 'currentColor' }} />
                {statusLabel(status)}
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold">{event.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="chip chip-muted">
              {event.total_sessions} session{event.total_sessions === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>{event.description}</p>
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {event.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Icon name="calendar" size={12} />
                {formatDate(s.date)}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Icon name="clock" size={12} />
                {to12h(s.start_time)} – {to12h(s.end_time)}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Icon name="location-dot" size={12} />
                {s.location}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-sm">
          <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--ink-soft)' }}>
            <span>
              {roster.length} of {event.capacity} enrolled
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} color={cat.solidVar} className="h-1.5" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link
          href={`/participants?e=${event.id}`}
          className="surface rounded-xl border border-border p-4 text-left hover-soft"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--energy-light)', color: 'var(--energy)' }}>
            <Icon name="users" size={12} />
          </div>
          <p className="font-display num font-semibold leading-none">{roster.length}</p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>Roster members</p>
          <p className="mt-1 text-[11px] font-medium underline" style={{ color: 'var(--primary)' }}>
            Open
          </p>
        </Link>
        <Link href="/checkin" className="surface rounded-xl border border-border p-4 text-left hover-soft">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Icon name="qrcode" size={12} />
          </div>
          <p className="font-display num font-semibold leading-none">{joined}</p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>Session attendances</p>
          <p className="mt-1 text-[11px] font-medium underline" style={{ color: 'var(--primary)' }}>
            Open
          </p>
        </Link>
        <Link href="/certificates" className="surface rounded-xl border border-border p-4 text-left hover-soft">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--warn-light)', color: 'var(--warn)' }}>
            <Icon name="award" size={12} />
          </div>
          <p className="font-display num font-semibold leading-none">—</p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>Certificate vault</p>
          <p className="mt-1 text-[11px] font-medium underline" style={{ color: 'var(--primary)' }}>
            Open
          </p>
        </Link>
      </div>

      <div className="surface rounded-2xl border border-border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Roster preview ({roster.length})</h3>
          <Link
            href={`/participants?e=${event.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover-soft"
          >
            Manage roster
            <Icon name="chevron-down" size={10} className="rotate-[-90deg]" />
          </Link>
        </div>
        {roster.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border py-10 text-center">
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              No participants yet — each person added gets their own QR pass.
            </p>
            <Link
              href={`/participants?e=${event.id}&add=1`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-btn-primary px-4 py-2 text-xs font-semibold text-white"
            >
              <Icon name="user-plus" size={12} />
              Add the first participant
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="tbl-head">
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                  <th className="px-4 py-2 font-medium">Participant</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.name} id={p.id} className="h-7 w-7 text-[10px]" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                            {p.student_id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-2 md:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {p.attendance.map((a) => (
                          <SessionBadge key={a.session_id} a={a} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {roster.length > 8 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
                      + {roster.length - 8} more on the roster page
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
