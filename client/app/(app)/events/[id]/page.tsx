'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { EventItem, ParticipantItem } from '@/lib/types'

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [event, setEvent] = useState<EventItem | null>(null)
  const [roster, setRoster] = useState<ParticipantItem[]>([])

  useEffect(() => {
    api.getEvent(id).then(setEvent).catch(console.error)
    api.listParticipants(id).then(setRoster).catch(console.error)
  }, [id])

  if (!event) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-5">
      <Link href="/events" className="text-sm text-violet-700 underline">
        ← Back to programs
      </Link>

      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
            {event.category}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-bold">{event.title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{event.description}</p>
        <div className="mt-3 space-y-1 text-sm text-neutral-600">
          {event.sessions.map((s) => (
            <p key={s.id}>
              <span className="font-medium">{s.label}</span> · {s.date} · {s.start_time}–
              {s.end_time} · {s.location}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {roster.length} of {event.capacity} enrolled
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/participants" className="rounded-xl border bg-white p-4 hover:shadow">
          <p className="text-xl font-bold">{roster.length}</p>
          <p className="text-xs text-neutral-500">Roster members</p>
        </Link>
        <Link href="/checkin" className="rounded-xl border bg-white p-4 hover:shadow">
          <p className="text-xl font-bold">
            {roster.flatMap((p) => p.attendance).filter((a) => a.attended === true).length}
          </p>
          <p className="text-xs text-neutral-500">Session attendances</p>
        </Link>
        <Link href="/certificates" className="rounded-xl border bg-white p-4 hover:shadow">
          <p className="text-xl font-bold">→</p>
          <p className="text-xs text-neutral-500">Certificate vault</p>
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Roster preview ({roster.length})</h3>
          <Link href="/participants" className="rounded-lg border px-3 py-1.5 text-xs">
            Manage roster
          </Link>
        </div>
        {roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No participants yet. Add people to generate their first-session QR pass.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-neutral-400">
                <th className="px-3 py-2">Participant</th>
                <th className="px-3 py-2">Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-neutral-500">{p.student_id}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {p.attendance.map((a) => (
                        <span
                          key={a.session_id}
                          title={`${a.label}: ${a.attended === true ? 'joined' : a.attended === false ? 'no-show' : a.qr_token ? 'pending' : 'locked'}`}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            a.attended === true
                              ? 'bg-green-100 text-green-800'
                              : a.attended === false
                                ? 'bg-red-100 text-red-800'
                                : a.qr_token
                                  ? 'bg-neutral-100 text-neutral-600'
                                  : 'bg-neutral-200 text-neutral-400'
                          }`}
                        >
                          {a.attended === true ? '✓' : a.attended === false ? '✗' : a.qr_token ? '·' : '🔒'}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
