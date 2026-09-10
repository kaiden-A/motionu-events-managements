'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { BtnPrimary, EmptyState, IconBtn, Progress } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { useConfirm, useToast } from '@/components/feedback'
import { api } from '@/lib/api'
import { categoryMeta } from '@/lib/category'
import {
  eventStatus,
  formatDate,
  statusLabel,
  to12h,
  type EventStatus,
} from '@/lib/format'
import type { EventItem, ParticipantItem, SessionItem } from '@/lib/types'

const CATEGORIES = ['General', 'Workshop', 'Hackathon', 'Tech Talk', 'Seminar']

interface SessionDraft {
  label: string
  date: string
  start_time: string
  end_time: string
  location: string
}

const blankSession = (): SessionDraft => ({
  label: 'Day 1',
  date: '',
  start_time: '09:00',
  end_time: '10:00',
  location: '',
})

interface RosterStats {
  total: number
  joined: number
}

function useRosterStats(events: EventItem[]): Record<string, RosterStats> {
  const [stats, setStats] = useState<Record<string, RosterStats>>({})
  useEffect(() => {
    if (events.length === 0) return
    let cancelled = false
    Promise.all(
      events.map(async (ev): Promise<[string, ParticipantItem[]]> => {
        try {
          return [ev.id, await api.listParticipants(ev.id)]
        } catch {
          return [ev.id, []]
        }
      })
    ).then((pairs) => {
      if (cancelled) return
      const map: Record<string, RosterStats> = {}
      for (const [id, roster] of pairs) {
        map[id] = {
          total: roster.length,
          joined: roster.flatMap((p) => p.attendance).filter((a) => a.attended === true).length,
        }
      }
      setStats(map)
    })
    return () => {
      cancelled = true
    }
  }, [events])
  return stats
}

function EventCard({
  ev,
  stats,
  onEdit,
  onDelete,
}: {
  ev: EventItem
  stats: RosterStats | undefined
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = categoryMeta(ev.category)
  const status = eventStatus(ev)
  const session = ev.sessions[0]
  const s = stats ?? { total: 0, joined: 0 }
  const pct = Math.min(100, Math.round((s.total / Math.max(1, ev.capacity)) * 100))
  const last = ev.sessions[ev.sessions.length - 1]

  return (
    <div className="surface flex flex-col overflow-hidden rounded-2xl border border-border">
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className={`cat-chip ${cat.chipClass}`}>
            <Icon name={cat.icon as IconName} size={12} />
            {ev.category}
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
        <h3 className="font-display mb-2 font-semibold leading-snug">{ev.title}</h3>
        <div className="mb-4 space-y-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {session && (
            <>
              <p className="flex items-center gap-1.5">
                <Icon name="calendar" size={13} className="w-4" />
                {formatDate(session.date)}
              </p>
              <p className="flex items-center gap-1.5">
                <Icon name="clock" size={13} className="w-4" />
                {to12h(session.start_time)} – {to12h(session.end_time)}
                {ev.sessions.length > 1 && ` · ${ev.total_sessions} sessions`}
              </p>
              <p className="flex items-center gap-1.5">
                <Icon name="location-dot" size={13} className="w-4" />
                {session.location}
              </p>
            </>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="chip chip-muted">
            <Icon name="users" size={11} className="mr-1" />
            {s.total} roster
          </span>
          {status !== 'upcoming' && (
            <span className="chip chip-success">
              <Icon name="check" size={11} className="mr-1" />
              {s.joined} joined
            </span>
          )}
          {ev.sessions.length > 1 && (
            <span className="chip chip-info">
              <Icon name="list-check" size={11} className="mr-1" />
              ends {formatDate(last?.date ?? session?.date ?? '')}
            </span>
          )}
          {ev.sessions.length > 1 && (
            <span className="chip chip-muted" title="Attendance required for a certificate">
              <Icon name="award" size={11} className="mr-1" />
              {ev.cert_min_sessions === null
                ? 'Cert: all sessions'
                : `Cert: ${ev.cert_min_sessions}+ of ${ev.total_sessions}`}
            </span>
          )}
        </div>
        <div className="mt-auto">
          <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--ink-soft)' }}>
            <span>
              {s.total}/{ev.capacity} enrolled
            </span>
            <span className="num">{pct}%</span>
          </div>
          <Progress value={pct} color={cat.solidVar} className="mb-4 h-1.5" />
          <div className="flex gap-2">
            <Link
              href={`/events/${ev.id}`}
              className="flex-1 rounded-lg bg-btn-primary px-3 py-2 text-center text-xs font-medium text-white"
            >
              Open program
            </Link>
            <IconBtn label="Edit program" icon="pen" onClick={onEdit} />
            <IconBtn label="Delete program" icon="trash" tone="danger" onClick={onDelete} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionEditor({
  sessions,
  onChange,
}: {
  sessions: SessionDraft[]
  onChange: (s: SessionDraft[]) => void
}) {
  const set = (i: number, patch: Partial<SessionDraft>) => {
    const copy = [...sessions]
    copy[i] = { ...copy[i], ...patch }
    onChange(copy)
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Sessions (in order)</p>
        <button
          onClick={() => onChange([...sessions, { ...blankSession(), label: `Day ${sessions.length + 1}` }])}
          className="text-xs font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          <Icon name="plus" size={11} className="mr-1" />
          Add session
        </button>
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                value={s.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Label"
                aria-label={`Session ${i + 1} label`}
                className="inp flex-1 py-1.5 text-xs"
              />
              {sessions.length > 1 && (
                <button
                  onClick={() => onChange(sessions.filter((_, j) => j !== i))}
                  className="text-xs font-medium text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={s.date}
                onChange={(e) => set(i, { date: e.target.value })}
                aria-label={`Session ${i + 1} date`}
                className="inp col-span-3 py-1.5 text-xs md:col-span-1"
              />
              <input
                type="time"
                value={s.start_time}
                onChange={(e) => set(i, { start_time: e.target.value })}
                aria-label={`Session ${i + 1} start`}
                className="inp py-1.5 text-xs"
              />
              <input
                type="time"
                value={s.end_time}
                onChange={(e) => set(i, { end_time: e.target.value })}
                aria-label={`Session ${i + 1} end`}
                className="inp py-1.5 text-xs"
              />
            </div>
            <input
              value={s.location}
              onChange={(e) => set(i, { location: e.target.value })}
              placeholder="Location"
              aria-label={`Session ${i + 1} location`}
              className="inp py-1.5 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const FILTERS: { key: 'all' | EventStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ongoing', label: 'Today' },
  { key: 'past', label: 'Past' },
]

function EventsBody() {
  const params = useSearchParams()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [events, setEvents] = useState<EventItem[]>([])
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<'all' | EventStatus>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    category: 'General',
    description: '',
    capacity: 30,
    certAll: true,
    certMin: 1,
  })
  const [sessions, setSessions] = useState<SessionDraft[]>([blankSession()])
  const [saving, setSaving] = useState(false)

  const rosterStats = useRosterStats(events)

  const reload = () => api.listEvents().then(setEvents).catch(() => {})
  useEffect(() => {
    reload()
  }, [])

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(a.sessions[0]?.date ?? '').getTime() - new Date(b.sessions[0]?.date ?? '').getTime()
      ),
    [events]
  )

  const list = sorted.filter((e) => {
    const matchesFilter = filter === 'all' || eventStatus(e) === filter
    const v = search.toLowerCase()
    const matchesSearch =
      !v ||
      e.title.toLowerCase().includes(v) ||
      e.category.toLowerCase().includes(v) ||
      e.sessions.some((s) => s.location.toLowerCase().includes(v))
    return matchesFilter && matchesSearch
  })

  const openNew = () => {
    setEditing(null)
    setForm({ title: '', category: 'General', description: '', capacity: 30, certAll: true, certMin: 1 })
    setSessions([blankSession()])
    setShowModal(true)
  }

  const openEdit = (ev: EventItem) => {
    setEditing(ev)
    setForm({
      title: ev.title,
      category: ev.category,
      description: ev.description,
      capacity: ev.capacity,
      certAll: ev.cert_min_sessions === null,
      certMin: ev.cert_min_sessions ?? 1,
    })
    setSessions(
      ev.sessions.map((s: SessionItem) => ({
        label: s.label,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location,
      }))
    )
    setShowModal(true)
  }

  const save = async () => {
    if (!form.title.trim() || sessions.length === 0 || !sessions[0].date) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        category: form.category,
        description: form.description,
        capacity: form.capacity,
        cert_min_sessions: form.certAll
          ? null
          : Math.min(Math.max(1, form.certMin || 1), sessions.length),
        sessions,
      }
      if (editing) await api.updateEvent(editing.id, payload)
      else await api.createEvent(payload)
      setShowModal(false)
      toast(editing ? 'Program updated.' : 'Program created. Add participants to build its roster.')
      reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (ev: EventItem) => {
    const ok = await confirm(
      `Delete "${ev.title}"? Its roster records and QR passes will be removed.`
    )
    if (!ok) return
    try {
      await api.deleteEvent(ev.id)
      toast('Program deleted.', 'info')
      reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="surface flex w-fit items-center gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.key
                  ? 'bg-btn-primary text-white'
                  : 'hover-soft'
              }`}
              style={filter === f.key ? undefined : { color: 'var(--ink-soft)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs flex-1">
          <Icon
            name="magnifying-glass"
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--ink-soft)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programs"
            aria-label="Search programs"
            className="inp pl-8 py-2"
          />
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white md:ml-auto"
        >
          <Icon name="plus" size={12} />
          New program
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={search || filter !== 'all' ? 'magnifying-glass' : 'calendar-plus'}
          title={
            search || filter !== 'all'
              ? 'No programs match this filter'
              : 'No programs yet'
          }
          hint={
            search || filter !== 'all'
              ? 'Try a different search, or create a new program.'
              : 'Create a program to start building its roster and QR passes.'
          }
        >
          <BtnPrimary onClick={openNew}>
            <Icon name="plus" size={12} />
            New program
          </BtnPrimary>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              stats={rosterStats[ev.id]}
              onEdit={() => openEdit(ev)}
              onDelete={() => remove(ev)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Edit program' : 'New program'}
          onClose={() => setShowModal(false)}
          actions={
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover-soft"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.title.trim() || sessions.length === 0}
                className="flex-1 rounded-lg bg-btn-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save program'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 p-5">
            <div>
              <label className="lbl" htmlFor="eventTitle">
                Program title
              </label>
              <input
                id="eventTitle"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sunrise Yoga & Mobility Flow"
                className="inp"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="lbl" htmlFor="eventCategory">
                  Category
                </label>
                <select
                  id="eventCategory"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="inp"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="eventCapacity">
                  Capacity
                </label>
                <input
                  id="eventCapacity"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="inp"
                />
              </div>
            </div>
            <SessionEditor sessions={sessions} onChange={setSessions} />
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Certificate requirement</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                How many sessions must a participant attend to receive a certificate?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl" htmlFor="certRequirement">
                    Requirement
                  </label>
                  <select
                    id="certRequirement"
                    value={form.certAll ? 'all' : 'min'}
                    onChange={(e) => setForm({ ...form, certAll: e.target.value === 'all' })}
                    className="inp"
                  >
                    <option value="all">All sessions</option>
                    <option value="min">At least…</option>
                  </select>
                </div>
                {!form.certAll && (
                  <div>
                    <label className="lbl" htmlFor="certMinSessions">
                      Sessions required
                    </label>
                    <input
                      id="certMinSessions"
                      type="number"
                      min={1}
                      max={Math.max(1, sessions.length)}
                      value={form.certMin}
                      onChange={(e) => setForm({ ...form, certMin: Number(e.target.value) })}
                      className="inp"
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="lbl" htmlFor="eventDescription">
                Description
              </label>
              <textarea
                id="eventDescription"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What should participants expect?"
                className="inp"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function EventsPage() {
  return (
    <Suspense>
      <EventsBody />
    </Suspense>
  )
}
