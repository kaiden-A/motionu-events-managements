'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DashboardData } from '@/lib/types'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>

  const spotlight = data.events_list[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-neutral-500">Overview of Motion-U programs</p>
      </div>

      {spotlight ? (
        <div className="rounded-2xl bg-gradient-to-r from-violet-900 via-violet-700 to-lime-800 p-6 text-white">
          <p className="text-xs uppercase tracking-widest text-white/70">Spotlight</p>
          <h2 className="mt-2 text-2xl font-semibold">{spotlight.title}</h2>
          <p className="mt-1 text-sm text-white/80">
            {spotlight.sessions.length} session{spotlight.sessions.length === 1 ? '' : 's'} ·{' '}
            capacity {spotlight.capacity}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href={`/events/${spotlight.id}`}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-violet-900"
            >
              View program
            </Link>
            <Link
              href="/checkin"
              className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium"
            >
              QR check-in
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center text-sm text-neutral-500">
          No programs yet. Create one on the Programs page.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total programs', value: data.events },
          { label: 'Participants', value: data.participants },
          { label: 'Certificates issued', value: data.certificates },
          { label: 'Attendance rate', value: `${data.attendance_rate}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border bg-white p-4">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-semibold">Activity</h3>
        <div className="mt-3 space-y-3">
          {data.activity.length === 0 && (
            <p className="text-sm text-neutral-500">No activity yet.</p>
          )}
          {data.activity.map((a, i) => (
            <div key={i} className="text-sm">
              <p>{a.text}</p>
              <p className="text-xs text-neutral-400">{a.created_at}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
