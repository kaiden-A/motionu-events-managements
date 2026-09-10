'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { BtnGhost, BtnPrimary, EmptyState } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { useConfirm, useToast } from '@/components/feedback'
import { api } from '@/lib/api'
import { formatDate, formatDateShort } from '@/lib/format'
import type { AttendanceItem, EventItem, ParticipantItem } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* attendance chips                                                    */
/* ------------------------------------------------------------------ */

function attendanceMeta(a: AttendanceItem) {
  if (a.attended === true)
    return { cls: 'chip-success', icon: 'circle-check' as IconName, label: 'Joined' }
  if (a.attended === false) return { cls: 'chip-danger', icon: 'xmark' as IconName, label: 'No-show' }
  if (a.qr_token) return { cls: 'chip-info', icon: 'qrcode' as IconName, label: 'Pass ready' }
  return { cls: 'chip-muted', icon: 'lock' as IconName, label: 'Locked' }
}

function downloadSvg(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML)
  const a = document.createElement('a')
  a.href = src
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/* ------------------------------------------------------------------ */
/* QR pass modal                                                       */
/* ------------------------------------------------------------------ */

function QrPassModal({
  ev,
  p,
  onClose,
  onEmail,
  onUnlocked,
}: {
  ev: EventItem
  p: ParticipantItem
  onClose: () => void
  onEmail: (a: AttendanceItem) => void
  onUnlocked: (p: ParticipantItem) => void
}) {
  const { toast } = useToast()
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({})
  const [unlocking, setUnlocking] = useState<string | null>(null)

  const unlock = async (a: AttendanceItem) => {
    setUnlocking(a.session_id)
    try {
      const updated = await api.unlockPass(ev.id, p.id, a.session_id)
      toast(`Pass unlocked for ${a.label}.`)
      onUnlocked(updated)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Unlock failed', 'error')
    } finally {
      setUnlocking(null)
    }
  }

  return (
    <Modal title={`QR passes — ${p.name}`} onClose={onClose} subtitle="Passes are issued for upcoming sessions. Missed sessions are marked automatically — unlock a pass if someone needs it.">
      <div className="space-y-4 p-6">
        {p.attendance.map((a) => (
          <div key={a.session_id} className="surface-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-4">
              {a.qr_token ? (
                <div className="shrink-0 rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={a.qr_token}
                    size={104}
                    ref={(el) => {
                      svgRefs.current[a.session_id] = el
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-lg bg-surface-2">
                  <Icon name="lock" size={24} style={{ color: 'var(--border-strong)' }} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.label}</p>
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {formatDate(a.date)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`chip ${attendanceMeta(a).cls}`}>
                    <Icon name={attendanceMeta(a).icon} size={10} />
                    {attendanceMeta(a).label}
                  </span>
                  {a.qr_sent_at && (
                    <span className="chip chip-info">
                      <Icon name="envelope" size={10} />
                      Emailed
                    </span>
                  )}
                  {a.qr_token ? (
                    <>
                      <button
                        onClick={() => onEmail(a)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover-soft"
                      >
                        <Icon name="envelope" size={10} />
                        Email pass
                      </button>
                      <button
                        onClick={() =>
                          downloadSvg(svgRefs.current[a.session_id] ?? null, `QR-pass-${ev.id}-${p.student_id}-${a.ordinal}.svg`)
                        }
                        aria-label="Download QR"
                        title="Download QR"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover-soft"
                        style={{ color: 'var(--info)' }}
                      >
                        <Icon name="download" size={11} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => unlock(a)}
                      disabled={unlocking === a.session_id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover-soft disabled:opacity-50"
                    >
                      <Icon name="wand-magic-sparkles" size={10} />
                      {unlocking === a.session_id ? 'Unlocking…' : 'Unlock pass'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Email modal                                                         */
/* ------------------------------------------------------------------ */

function EmailModal({
  ev,
  p,
  a,
  onClose,
  onSent,
}: {
  ev: EventItem
  p: ParticipantItem
  a: AttendanceItem | null
  onClose: () => void
  onSent: () => void
}) {
  const { toast } = useToast()
  const [sending, setSending] = useState(false)
  if (!a) return null

  const send = async () => {
    setSending(true)
    try {
      await api.sendPass(ev.id, p.id, a.session_id)
      toast(`QR pass sent to ${p.email}.`)
      onSent()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Send failed', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title="Email QR pass" onClose={onClose}>
      <div className="space-y-3 p-5">
        <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          <p className="flex gap-2">
            <span className="w-16 shrink-0 font-medium">To:</span>
            <span className="break-all">
              {p.name} &lt;{p.email}&gt;
            </span>
          </p>
          <p className="mt-1 flex gap-2">
            <span className="w-16 shrink-0 font-medium">Subject:</span>
            <span className="break-all">Motion-U QR Pass — {ev.title} · {a.label}</span>
          </p>
        </div>
        <div className="surface-2 rounded-xl border border-border p-3 text-xs">
          <p className="mb-2" style={{ color: 'var(--ink-soft)' }}>
            Message preview:
          </p>
          {a.qr_token && (
            <div className="pass-card flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="shrink-0 rounded-lg bg-white p-1.5">
                <QRCodeSVG value={a.qr_token} size={84} />
              </div>
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.png" alt="" className="h-4 w-4 rounded object-cover" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>
                    Motion-U Mobility, Technology &amp; Industry On University Startup Incubator
                  </span>
                </div>
                <p className="font-display mt-1 text-sm font-semibold leading-tight">
                  {ev.title} — {a.label}
                </p>
                <p className="mt-1 text-xs">{p.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  {p.student_id}
                </p>
                <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  Show this QR pass at the door — a quick scan marks you as joined.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <BtnGhost onClick={onClose} className="flex-1">
            Cancel
          </BtnGhost>
          <BtnPrimary onClick={send} disabled={sending || !a.qr_token} className="flex-1">
            <Icon name="paper-plane" size={12} />
            {sending ? 'Sending…' : 'Send email'}
          </BtnPrimary>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ROW_MENU_EST_HEIGHT = 250

const EMPTY_FORM = { name: '', student_id: '', email: '', phone: '' }

function ParticipantsBody() {
  const params = useSearchParams()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [roster, setRoster] = useState<ParticipantItem[]>([])
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<ParticipantItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [wantQrEmail, setWantQrEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<{ p: ParticipantItem; rect: DOMRect } | null>(null)
  const menuElRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [passP, setPassP] = useState<ParticipantItem | null>(null)
  const [emailFor, setEmailFor] = useState<{ p: ParticipantItem; a: AttendanceItem } | null>(null)
  const [batch, setBatch] = useState<{ running: boolean; done: number; total: number } | null>(null)
  const [batchResult, setBatchResult] = useState<{
    issued: { name: string; cert_no: string }[]
    skipped: { name: string; reason: string }[]
  } | null>(null)
  const addOnce = useRef(false)

  const event = events.find((e) => e.id === eventId) ?? null

  const reloadRoster = useCallback((id: string) => {
    api.listParticipants(id).then(setRoster).catch(() => {})
  }, [])

  useEffect(() => {
    api
      .listEvents()
      .then((list) => {
        setEvents(list)
        const preselect = params.get('e')
        const target = preselect && list.some((e) => e.id === preselect) ? preselect : list[0]?.id
        if (target) {
          setEventId(target)
          reloadRoster(target)
        }
      })
      .catch(() => {})
  }, [params, reloadRoster])

  useEffect(() => {
    if (params.get('add') === '1' && events.length && !addOnce.current) {
      addOnce.current = true
      setShowAdd(true)
    }
  }, [params, events.length])

  const closeMenu = () => {
    setMenu(null)
    triggerRef.current = null
  }

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, p: ParticipantItem) => {
    if (menu?.p.id === p.id) {
      closeMenu()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    triggerRef.current = e.currentTarget
    setMenu({ p, rect })
  }

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && menuElRef.current?.contains(target)) return
      if (target && triggerRef.current?.contains(target)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    const onScroll = () => setMenu(null)
    const onResize = () => setMenu(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [menu])

  const onEventChange = (id: string) => {
    setEventId(id)
    setSearch('')
    closeMenu()
    reloadRoster(id)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setWantQrEmail(true)
    setShowAdd(true)
  }

  const openEdit = (p: ParticipantItem) => {
    setEditing(p)
    setForm({ name: p.name, student_id: p.student_id, email: p.email, phone: p.phone })
    setWantQrEmail(false)
    setShowAdd(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.student_id.trim() || !form.email.trim()) {
      toast('Name, student ID and email are required.', 'error')
      return
    }
    setSaving(true)
    try {
      let saved: ParticipantItem
      if (editing) {
        saved = await api.updateParticipant(eventId, editing.id, form)
        toast('Participant updated.')
      } else {
        saved = await api.addParticipant(eventId, form)
        toast(`${saved.name} added to the roster.`)
      }
      setShowAdd(false)
      reloadRoster(eventId)
      if (!editing && wantQrEmail) {
        const first = saved.attendance.find((a) => a.qr_token)
        if (first) setEmailFor({ p: saved, a: first })
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: ParticipantItem) => {
    const ok = await confirm(`Remove ${p.name} from "${event?.title}"? Their QR passes will be removed.`)
    if (!ok) return
    try {
      await api.removeParticipant(eventId, p.id)
      toast('Participant removed from roster.', 'info')
      reloadRoster(eventId)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Remove failed', 'error')
    }
  }

  const issueCert = async (p: ParticipantItem) => {
    try {
      const r = await api.issueCertificate(eventId, p.id)
      const email =
        r.emailed === 'live'
          ? ` — emailed to ${p.email}`
          : r.emailed === 'simulated'
            ? ' — email simulated (provider off)'
            : ' — email pending'
      toast(`Certificate ${r.cert_no} issued to ${p.name}.${email}`)
      reloadRoster(eventId)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Issue failed', 'error')
    }
  }

  const issueAll = async () => {
    if (!event || batch?.running) return
    try {
      const t = await api.getTemplate(event.id)
      if (!t) {
        toast('Set a certificate template for this program first.', 'error')
        return
      }
    } catch {
      toast('Could not check the certificate template.', 'error')
      return
    }

    const rule =
      event.cert_min_sessions === null
        ? 'attended every session'
        : `attended at least ${event.cert_min_sessions} of ${event.total_sessions} sessions`
    const ok = await confirm(
      `Issue certificates for every participant in "${event.title}"? Anyone who hasn't ${rule} or already has a certificate is skipped automatically.`,
      { confirmLabel: 'Issue all' }
    )
    if (!ok) return

    const issued: { name: string; cert_no: string }[] = []
    const skipped: { name: string; reason: string }[] = []
    setBatch({ running: true, done: 0, total: roster.length })
    for (const [i, p] of roster.entries()) {
      try {
        const r = await api.issueCertificate(event.id, p.id)
        issued.push({ name: p.name, cert_no: r.cert_no })
      } catch (e) {
        skipped.push({
          name: p.name,
          reason: e instanceof Error ? e.message : 'Issue failed',
        })
      }
      setBatch({ running: true, done: i + 1, total: roster.length })
    }
    setBatch(null)
    setBatchResult({ issued, skipped })
    toast(
      `Certificates issued: ${issued.length} · Skipped: ${skipped.length}`,
      skipped.length > 0 ? 'info' : 'success'
    )
    reloadRoster(event.id)
  }

  const mark = async (p: ParticipantItem, sessionId: string, attended: boolean) => {
    try {
      await api.setAttendance(eventId, p.id, sessionId, attended)
      toast(p.name + (attended ? ' joined.' : ' marked as no-show.'), attended ? 'success' : 'info')
      reloadRoster(eventId)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error')
    }
  }

  const list = roster.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.student_id.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  )

  const joinedSessions = roster.flatMap((p) => p.attendance).filter((a) => a.attended === true).length
  const noShowSessions = roster.flatMap((p) => p.attendance).filter((a) => a.attended === false).length
  const pendingSessions = roster.flatMap((p) => p.attendance).filter((a) => a.attended === null).length
  const emailed = roster.filter((p) => p.attendance.some((a) => a.qr_sent_at)).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="w-full md:w-80">
          <label className="lbl" htmlFor="participantEventSelect">
            Program
          </label>
          <select
            id="participantEventSelect"
            value={eventId}
            onChange={(e) => onEventChange(e.target.value)}
            className="inp"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} — {formatDateShort(e.sessions[0]?.date ?? '')}
              </option>
            ))}
          </select>
        </div>
        <div className="relative max-w-xs flex-1">
          <label className="lbl" htmlFor="participantSearch">
            Search this roster
          </label>
          <Icon
            name="magnifying-glass"
            size={12}
            className="absolute bottom-3 left-3"
            style={{ color: 'var(--ink-soft)' }}
          />
          <input
            id="participantSearch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, student ID or email"
            className="inp py-2.5 pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <button
            onClick={() => void issueAll()}
            disabled={!event || roster.length === 0 || batch?.running}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover-soft disabled:opacity-50"
          >
            <Icon name="award" size={13} />
            {batch?.running
              ? `Issuing ${batch.done}/${batch.total}…`
              : 'Issue all certificates'}
          </button>
          <button
            onClick={openAdd}
            disabled={!event}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-btn-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Icon name="user-plus" size={13} />
            Add participant
          </button>
        </div>
      </div>

      {event && (
        <div className="flex flex-wrap gap-3">
          <span className="chip chip-muted">Roster: {roster.length}</span>
          <span className="chip chip-info">
            <Icon name="envelope" size={10} className="mr-1" />
            Passes emailed: {emailed}
          </span>
          <span className="chip chip-success">
            <Icon name="circle-check" size={10} className="mr-1" />
            Joined sessions: {joinedSessions}
          </span>
          <span className="chip chip-danger">
            <Icon name="xmark" size={10} className="mr-1" />
            No-shows: {noShowSessions}
          </span>
          <span className="chip chip-muted">Pending: {pendingSessions}</span>
        </div>
      )}

      {!event ? (
        <EmptyState
          icon="calendar-plus"
          title="No programs yet"
          hint="Create a program first — each program owns its own independent participant roster."
        >
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-lg bg-btn-primary px-4 py-2 text-xs font-semibold text-white"
          >
            <Icon name="calendar-plus" size={12} />
            Create program
          </Link>
        </EmptyState>
      ) : roster.length === 0 && !search ? (
        <EmptyState
          icon="users"
          title={`"${event.title}" has no participants yet`}
          hint="Add people to this program — each one automatically gets a unique QR pass for check-in."
        >
          <BtnPrimary onClick={openAdd}>
            <Icon name="user-plus" size={12} />
            Add participant
          </BtnPrimary>
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon="magnifying-glass" title={`No roster members match "${search}"`} />
      ) : (
        <div className="surface overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                  <th className="px-5 py-3 font-medium">Participant</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Contact</th>
                  <th className="px-5 py-3 font-medium">Sessions</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} id={p.id} className="h-8 w-8 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                            {p.student_id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{p.email}</p>
                      {p.phone && (
                        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{p.phone}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.attendance.map((a) => {
                          const m = attendanceMeta(a)
                          return (
                            <span
                              key={a.session_id}
                              className={`chip ${m.cls}`}
                              title={`${a.label}: ${m.label}${a.qr_sent_at ? ' (pass emailed)' : ''}`}
                            >
                              <Icon name={m.icon} size={9} />
                              {a.label}
                              {a.qr_sent_at && <Icon name="envelope" size={9} />}
                            </span>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.attendance.map((a) =>
                          a.attended === null && a.qr_token ? (
                            <span key={a.session_id} className="flex gap-1.5">
                              <button
                                onClick={() => mark(p, a.session_id, true)}
                                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover-success"
                                style={{ color: 'var(--success)' }}
                              >
                                Join {a.label}
                              </button>
                              <button
                                onClick={() => mark(p, a.session_id, false)}
                                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover-danger"
                                style={{ color: 'var(--danger)' }}
                              >
                                No-show
                              </button>
                            </span>
                          ) : null
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={(e) => openMenu(e, p)}
                        aria-label={`Actions for ${p.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menu?.p.id === p.id}
                        title="Actions"
                        className="hover-soft flex h-8 w-8 items-center justify-center rounded-md border border-border"
                      >
                        <Icon name="ellipsis-vertical" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <Modal
          title={editing ? 'Edit participant' : 'Add participant'}
          subtitle={event ? `Adding to "${event.title}" — this roster is independent.` : undefined}
          onClose={() => setShowAdd(false)}
          actions={
            <div className="flex gap-3">
              <BtnGhost onClick={() => setShowAdd(false)} className="flex-1">
                Cancel
              </BtnGhost>
              <BtnPrimary onClick={save} disabled={saving} className="flex-1">
                {saving ? 'Saving…' : 'Save participant'}
              </BtnPrimary>
            </div>
          }
        >
          <div className="space-y-4 p-5">
            <div>
              <label className="lbl" htmlFor="participantName">
                Full name
              </label>
              <input
                id="participantName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Aina Sofea Binti Hassan"
                className="inp"
              />
            </div>
            <div>
              <label className="lbl" htmlFor="participantStudentId">
                Student ID
              </label>
              <input
                id="participantStudentId"
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                placeholder="e.g. SU21134"
                spellCheck={false}
                className="inp code-str text-xs"
              />
            </div>
            <div>
              <label className="lbl" htmlFor="participantEmail">
                Email
              </label>
              <input
                id="participantEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@student.edu.my"
                className="inp"
              />
            </div>
            <div>
              <label className="lbl" htmlFor="participantPhone">
                Phone
              </label>
              <input
                id="participantPhone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="012-345 6789"
                className="inp"
              />
            </div>
            {!editing && (
              <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5" style={{ background: 'var(--success-light)' }}>
                <input
                  id="participantQrEmailCheck"
                  type="checkbox"
                  checked={wantQrEmail}
                  onChange={(e) => setWantQrEmail(e.target.checked)}
                  className="mt-0.5"
                  style={{ accentColor: 'var(--success)' }}
                />
                <label htmlFor="participantQrEmailCheck" className="text-xs leading-relaxed" style={{ color: 'var(--success)' }}>
                  <span className="font-semibold">Email their QR pass</span> — the pass is scanned at the door to mark them as joined.
                </label>
              </div>
            )}
          </div>
        </Modal>
      )}

      {passP && (
        <QrPassModal
          ev={event!}
          p={passP}
          onClose={() => setPassP(null)}
          onEmail={(a) => {
            setEmailFor({ p: passP, a })
            setPassP(null)
          }}
          onUnlocked={(updated) => {
            setPassP(updated)
            reloadRoster(eventId)
          }}
        />
      )}

      {emailFor && (
        <EmailModal
          ev={event!}
          p={emailFor.p}
          a={emailFor.a}
          onClose={() => setEmailFor(null)}
          onSent={() => reloadRoster(eventId)}
        />
      )}

      {batchResult && (
        <Modal
          title="Certificate issuing complete"
          subtitle={
            event
              ? `${event.title} — issued ${batchResult.issued.length}, skipped ${batchResult.skipped.length}`
              : undefined
          }
          onClose={() => setBatchResult(null)}
          actions={
            <BtnPrimary className="w-full" onClick={() => setBatchResult(null)}>
              Done
            </BtnPrimary>
          }
        >
          <div className="space-y-4 p-5">
            {batchResult.issued.length > 0 && (
              <div>
                <p
                  className="mb-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  Issued ({batchResult.issued.length})
                </p>
                <div className="space-y-1.5">
                  {batchResult.issued.map((r) => (
                    <div
                      key={r.cert_no}
                      className="surface-2 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon name="circle-check" size={11} style={{ color: 'var(--success)' }} />
                        <span className="truncate font-medium">{r.name}</span>
                      </span>
                      <span className="code-str shrink-0" style={{ color: 'var(--ink-soft)' }}>
                        {r.cert_no}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {batchResult.skipped.length > 0 && (
              <div>
                <p
                  className="mb-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  Skipped ({batchResult.skipped.length})
                </p>
                <div className="space-y-1.5">
                  {batchResult.skipped.map((r, i) => (
                    <div
                      key={`${r.name}-${i}`}
                      className="surface-2 rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <p className="flex items-center gap-2 font-medium">
                        <Icon name="circle-info" size={11} style={{ color: 'var(--info)' }} />
                        {r.name}
                      </p>
                      <p className="mt-0.5 pl-[19px]" style={{ color: 'var(--ink-soft)' }}>
                        {r.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {batchResult.issued.length === 0 && batchResult.skipped.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                No participants to process.
              </p>
            )}
          </div>
        </Modal>
      )}

      {menu &&
        (() => {
          const r = menu.rect
          const gap = 6
          const below = r.bottom + gap
          let top = below
          if (below + ROW_MENU_EST_HEIGHT > window.innerHeight) {
            if (r.top - gap - ROW_MENU_EST_HEIGHT >= 0) {
              top = r.top - gap - ROW_MENU_EST_HEIGHT
            } else {
              top = Math.max(8, window.innerHeight - ROW_MENU_EST_HEIGHT - 8)
            }
          }
          return (
            <div
              role="menu"
              className="row-menu fixed z-[90] w-56 rounded-xl border border-border py-1.5"
              style={{ top, right: Math.max(gap, window.innerWidth - r.right) }}
              ref={(el) => {
                menuElRef.current = el
              }}
            >
              <button
                onClick={() => {
                  setPassP(menu.p)
                  closeMenu()
                }}
                className="row-menu-item"
              >
                <Icon name="qrcode" size={12} className="w-4 text-center" />
                View QR passes
              </button>
              <button
                onClick={() => {
                  const a = menu.p.attendance.find((x) => x.qr_token)
                  if (a) setEmailFor({ p: menu.p, a })
                  else toast('No pass available yet — open View QR passes to unlock one.', 'info')
                  closeMenu()
                }}
                className="row-menu-item"
              >
                <Icon name="envelope" size={12} className="w-4 text-center" />
                Email QR pass
              </button>
              <button
                onClick={() => {
                  openEdit(menu.p)
                  closeMenu()
                }}
                className="row-menu-item"
              >
                <Icon name="pen" size={12} className="w-4 text-center" />
                Edit details
              </button>
              <button
                onClick={() => {
                  issueCert(menu.p)
                  closeMenu()
                }}
                className="row-menu-item"
              >
                <Icon name="award" size={12} className="w-4 text-center" />
                Issue certificate
              </button>
              <div className="row-menu-sep" />
              <button
                onClick={() => {
                  remove(menu.p)
                  closeMenu()
                }}
                className="row-menu-item danger"
              >
                <Icon name="trash" size={12} className="w-4 text-center" />
                Remove from roster
              </button>
            </div>
          )
        })()}
    </div>
  )
}

export default function ParticipantsPage() {
  return (
    <Suspense>
      <ParticipantsBody />
    </Suspense>
  )
}
