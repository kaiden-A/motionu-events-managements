'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { EventItem, ParticipantItem } from '@/lib/types'

export default function ParticipantsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [roster, setRoster] = useState<ParticipantItem[]>([])
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ParticipantItem | null>(null)
  const [form, setForm] = useState({ name: '', student_id: '', email: '', phone: '' })

  const [pass, setPass] = useState<ParticipantItem | null>(null)

  const event = events.find((e) => e.id === eventId) ?? null

  const reloadRoster = (id: string) =>
    api.listParticipants(id).then(setRoster).catch(console.error)

  useEffect(() => {
    api
      .listEvents()
      .then((list) => {
        setEvents(list)
        if (list.length > 0) {
          setEventId(list[0].id)
          reloadRoster(list[0].id)
        }
      })
      .catch(console.error)
  }, [])

  const onEventChange = (id: string) => {
    setEventId(id)
    setSearch('')
    reloadRoster(id)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', student_id: '', email: '', phone: '' })
    setShowModal(true)
  }

  const openEdit = (p: ParticipantItem) => {
    setEditing(p)
    setForm({ name: p.name, student_id: p.student_id, email: p.email, phone: p.phone })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.student_id.trim() || !form.email.trim()) {
      setMsg('Name, student ID and email are required.')
      return
    }
    if (editing) await api.updateParticipant(eventId, editing.id, form)
    else await api.addParticipant(eventId, form)
    setShowModal(false)
    reloadRoster(eventId)
  }

  const remove = async (p: ParticipantItem) => {
    if (!confirm(`Remove ${p.name} from the roster?`)) return
    await api.removeParticipant(eventId, p.id)
    reloadRoster(eventId)
  }

  const sendPass = async (p: ParticipantItem, sessionId: string) => {
    try {
      await api.sendPass(eventId, p.id, sessionId)
      setMsg(`Pass sent to ${p.email} (stub — recorded as sent).`)
      reloadRoster(eventId)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Send failed')
    }
  }

  const mark = async (p: ParticipantItem, sessionId: string, attended: boolean) => {
    try {
      await api.setAttendance(eventId, p.id, sessionId, attended)
      reloadRoster(eventId)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const issue = async (p: ParticipantItem) => {
    try {
      const r = await api.issueCertificate(eventId, p.id)
      setMsg(`Certificate ${r.cert_no} issued to ${p.name}.`)
      reloadRoster(eventId)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Issue failed')
    }
  }

  const list = roster.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.student_id.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Participants</h1>
          <p className="text-sm text-neutral-500">Roster of the selected program</p>
        </div>
        <select
          value={eventId}
          onChange={(e) => onEventChange(e.target.value)}
          className="ml-auto rounded-lg border px-3 py-2 text-sm"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button
          onClick={openAdd}
          disabled={!event}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          + Add participant
        </button>
      </div>

      {msg && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {msg}{' '}
          <button onClick={() => setMsg('')} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {!event ? (
        <p className="text-sm text-neutral-500">Create a program first.</p>
      ) : (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, email"
            className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
          />
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-neutral-400">
                  <th className="px-4 py-3">Participant</th>
                  <th className="px-4 py-3">Sessions (lock → join → unlock next)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-neutral-500">
                        {p.student_id} · {p.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.attendance.map((a) => (
                          <span
                            key={a.session_id}
                            title={
                              a.attended === true
                                ? `${a.label}: joined`
                                : a.attended === false
                                  ? `${a.label}: no-show`
                                  : a.qr_token
                                    ? `${a.label}: pass unlocked${a.qr_sent_at ? `, emailed ${a.qr_sent_at}` : ''}`
                                    : `${a.label}: locked — join prior session`
                            }
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              a.attended === true
                                ? 'bg-green-100 text-green-800'
                                : a.attended === false
                                  ? 'bg-red-100 text-red-800'
                                  : a.qr_token
                                    ? 'bg-neutral-100 text-neutral-700'
                                    : 'bg-neutral-200 text-neutral-400'
                            }`}
                          >
                            {a.label}:{' '}
                            {a.attended === true
                              ? '✓ joined'
                              : a.attended === false
                                ? '✗ no-show'
                                : a.qr_token
                                  ? 'pass ready'
                                  : '🔒 locked'}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.attendance.map((a) =>
                          a.attended === null ? (
                            <span key={a.session_id} className="flex gap-1">
                              <button
                                onClick={() => mark(p, a.session_id, true)}
                                className="rounded border border-green-300 px-2 py-0.5 text-[11px] text-green-700"
                              >
                                Join {a.label}
                              </button>
                              <button
                                onClick={() => mark(p, a.session_id, false)}
                                className="rounded border border-red-300 px-2 py-0.5 text-[11px] text-red-700"
                              >
                                No-show
                              </button>
                            </span>
                          ) : null
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setPass(p)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs"
                        >
                          QR passes
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => issue(p)}
                          className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs text-amber-700"
                        >
                          Issue cert
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="font-semibold">{editing ? 'Edit participant' : 'Add participant'}</h3>
            <div className="mt-4 space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                placeholder="Student ID"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
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
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {pass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold">QR passes — {pass.name}</h3>
            <p className="text-xs text-neutral-500">
              Only unlocked sessions have a pass. Joining unlocks the next one.
            </p>
            <div className="mt-4 space-y-4">
              {pass.attendance.map((a) => (
                <div key={a.session_id} className="flex items-center gap-4 rounded-xl border p-3">
                  {a.qr_token ? (
                    <QRCodeSVG value={a.qr_token} size={112} />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded bg-neutral-100 text-2xl">
                      🔒
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-neutral-500">
                      {a.attended === true
                        ? 'Joined'
                        : a.qr_token
                          ? a.qr_sent_at
                            ? `Emailed ${a.qr_sent_at}`
                            : 'Pass unlocked'
                          : 'Locked — join prior session first'}
                    </p>
                    {a.qr_token && (
                      <button
                        onClick={() => sendPass(pass, a.session_id)}
                        className="mt-1 rounded-lg border px-2.5 py-1 text-xs"
                      >
                        (Re)send pass
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPass(null)}
              className="mt-4 w-full rounded-lg border px-4 py-2.5 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
