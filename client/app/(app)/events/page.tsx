'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { EventItem } from '@/lib/types'

const CATEGORIES = ['Wellness', 'Dance', 'Martial Arts', 'Fitness', 'General']

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

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    category: 'General',
    description: '',
    capacity: 30,
  })
  const [sessions, setSessions] = useState<SessionDraft[]>([blankSession()])

  const reload = () => api.listEvents().then(setEvents).catch(console.error)
  useEffect(() => {
    reload()
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ title: '', category: 'General', description: '', capacity: 30 })
    setSessions([blankSession()])
    setShowModal(true)
  }

  const openEdit = (e: EventItem) => {
    setEditing(e)
    setForm({ title: e.title, category: e.category, description: e.description, capacity: e.capacity })
    setSessions(
      e.sessions.map((s) => ({
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
    if (!form.title.trim() || sessions.length === 0) return
    const payload = { ...form, sessions }
    if (editing) await api.updateEvent(editing.id, payload)
    else await api.createEvent(payload)
    setShowModal(false)
    reload()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this program and its rosters?')) return
    await api.deleteEvent(id)
    reload()
  }

  const list = events.filter(
    (e) =>
      !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programs</h1>
          <p className="text-sm text-neutral-500">Create and manage club programs</p>
        </div>
        <button
          onClick={openNew}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white"
        >
          + New program
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search programs"
        className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((ev) => (
          <div key={ev.id} className="flex flex-col rounded-2xl border bg-white p-5">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
                {ev.category}
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
                {ev.total_sessions} session{ev.total_sessions === 1 ? '' : 's'}
              </span>
            </div>
            <h3 className="font-semibold">{ev.title}</h3>
            <div className="mt-2 space-y-1 text-xs text-neutral-500">
              {ev.sessions.map((s) => (
                <p key={s.id}>
                  {s.label} · {s.date} · {s.start_time}–{s.end_time} · {s.location}
                </p>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                href={`/events/${ev.id}`}
                className="flex-1 rounded-lg bg-violet-700 px-3 py-2 text-center text-xs font-medium text-white"
              >
                Open program
              </Link>
              <button
                onClick={() => openEdit(ev)}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Edit
              </button>
              <button
                onClick={() => remove(ev.id)}
                className="rounded-lg border px-3 py-2 text-xs text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold">{editing ? 'Edit program' : 'New program'}</h3>
            <div className="mt-4 space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Program title"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-3">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-28 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Capacity"
                />
              </div>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description"
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Sessions (in order)</p>
                <button
                  onClick={() =>
                    setSessions([...sessions, { ...blankSession(), label: `Day ${sessions.length + 1}` }])
                  }
                  className="text-xs font-medium text-violet-700"
                >
                  + Add session
                </button>
              </div>
              {sessions.map((s, i) => (
                <div key={i} className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.label}
                      onChange={(e) => {
                        const c = [...sessions]
                        c[i] = { ...c[i], label: e.target.value }
                        setSessions(c)
                      }}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                      placeholder="Label"
                    />
                    {sessions.length > 1 && (
                      <button
                        onClick={() => setSessions(sessions.filter((_, j) => j !== i))}
                        className="text-xs text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={s.date}
                      onChange={(e) => {
                        const c = [...sessions]
                        c[i] = { ...c[i], date: e.target.value }
                        setSessions(c)
                      }}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                    />
                    <input
                      type="time"
                      value={s.start_time}
                      onChange={(e) => {
                        const c = [...sessions]
                        c[i] = { ...c[i], start_time: e.target.value }
                        setSessions(c)
                      }}
                      className="rounded-lg border px-2 py-1.5 text-sm"
                    />
                    <input
                      type="time"
                      value={s.end_time}
                      onChange={(e) => {
                        const c = [...sessions]
                        c[i] = { ...c[i], end_time: e.target.value }
                        setSessions(c)
                      }}
                      className="rounded-lg border px-2 py-1.5 text-sm"
                    />
                  </div>
                  <input
                    value={s.location}
                    onChange={(e) => {
                      const c = [...sessions]
                      c[i] = { ...c[i], location: e.target.value }
                      setSessions(c)
                    }}
                    placeholder="Location"
                    className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="flex-1 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white"
              >
                Save program
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
