'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Icon, type IconName } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { BtnPrimary, EmptyState } from '@/components/ui'
import { useToast } from '@/components/feedback'
import { api } from '@/lib/api'
import { formatDateShort } from '@/lib/format'
import type { EventItem, ParticipantItem } from '@/lib/types'

interface LogEntry {
  text: string
  kind: 'ok' | 'error' | 'info'
  time: string
}

const LOG_STYLE: Record<LogEntry['kind'], { cls: string; icon: IconName }> = {
  ok: { cls: 'bg-success-light text-success', icon: 'circle-check' },
  error: { cls: 'bg-danger-light text-danger', icon: 'circle-exclamation' },
  info: { cls: 'bg-surface-2 text-ink-soft', icon: 'circle-info' },
}

export default function CheckinPage() {
  const { toast } = useToast()
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [roster, setRoster] = useState<ParticipantItem[]>([])
  const [mode, setMode] = useState<'scan' | 'manual'>('scan')
  const [camOn, setCamOn] = useState(false)
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'error' | 'muted' }>({
    msg: 'Ready — press Start camera or use simulate scan.',
    kind: 'muted',
  })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [quick, setQuick] = useState('')
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simulateToken, setSimulateToken] = useState('')
  const [simulateScanning, setSimulateScanning] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const cooldownRef = useRef(0)

  const event = events.find((e) => e.id === eventId) ?? null
  const pending = roster.filter((p) => p.attendance.some((a) => a.attended === null && a.qr_token))
  const joinedCount = roster.flatMap((p) => p.attendance).filter((a) => a.attended === true).length
  const noShowCount = roster.flatMap((p) => p.attendance).filter((a) => a.attended === false).length

  function pushLog(text: string, kind: LogEntry['kind']) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    setLogs((prev) => [{ text, kind, time }, ...prev].slice(0, 8))
  }

  function reloadRoster(id: string) {
    if (!id) return
    api.listParticipants(id).then(setRoster).catch(() => {})
  }

  async function handleToken(raw: string) {
    try {
      const result = await api.checkin(raw.trim())
      const extra = result.next_unlocked ? ' — next session pass unlocked' : ''
      pushLog(
        `${result.participant.name} joined ${result.session.label} of ${result.event.title}${extra}`,
        'ok'
      )
      setStatus({ msg: `Joined: ${result.participant.name} → ${result.session.label}`, kind: 'ok' })
      if (result.event.id !== eventId) setEventId(result.event.id)
      else reloadRoster(result.event.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Scan failed'
      pushLog(message, 'error')
      setStatus({ msg: message, kind: 'error' })
    }
  }

  function scanFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }
    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        const img = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code?.data && Date.now() >= cooldownRef.current) {
          cooldownRef.current = Date.now() + 2200
          void handleToken(code.data)
        }
      }
    } catch {
      /* frame skip */
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ msg: 'Camera not supported here — paste a token below.', kind: 'error' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamOn(true)
      setStatus({ msg: 'Point the camera at a participant QR pass.', kind: 'muted' })
      rafRef.current = requestAnimationFrame(scanFrame)
    } catch {
      setStatus({ msg: 'Camera unavailable or permission denied — paste a token below.', kind: 'error' })
    }
  }

  useEffect(() => {
    if (!eventId) return
    api.listParticipants(eventId).then(setRoster).catch(() => {})
  }, [eventId])

  useEffect(() => {
    api
      .listEvents()
      .then((list) => {
        setEvents(list)
        const target = list[0]?.id
        if (target) setEventId(target)
      })
      .catch(() => {})
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function onEventChange(id: string) {
    stopCamera()
    setEventId(id)
    setLogs([])
    reloadRoster(id)
  }

  function setModeSafe(m: 'scan' | 'manual') {
    setMode(m)
    if (m !== 'scan') stopCamera()
    else setStatus({ msg: 'Ready — press Start camera or use simulate scan.', kind: 'muted' })
  }

  async function mark(p: ParticipantItem, attended: boolean) {
    const next = p.attendance.find((a) => a.attended === null && a.qr_token)
    if (!next) return
    try {
      await api.setAttendance(eventId, p.id, next.session_id, attended)
      toast(p.name + (attended ? ' joined.' : ' marked as no-show.'), attended ? 'success' : 'info')
      reloadRoster(eventId)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error')
    }
  }

  async function quickJoin() {
    const q = quick.trim().toLowerCase()
    if (!q) return
    if (!event) {
      toast('Pick a program first.', 'error')
      return
    }
    const match = roster.find(
      (p) => p.name.toLowerCase().includes(q) || p.student_id.toLowerCase().includes(q)
    )
    if (!match) {
      toast('No roster member matches that name or ID.', 'error')
      return
    }
    await mark(match, true)
    setQuick('')
  }

  function nextFor(p: ParticipantItem) {
    return p.attendance.find((a) => a.attended === null && a.qr_token)
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon="calendar-plus"
        title="No programs yet"
        hint="Create a program to start scanning QR passes."
      />
    )
  }

  const statusColor =
    status.kind === 'error' ? 'var(--danger)' : status.kind === 'ok' ? 'var(--success)' : 'var(--ink-soft)'
  const statusIcon: IconName =
    status.kind === 'error' ? 'triangle-exclamation' : status.kind === 'ok' ? 'circle-check' : 'circle-info'

  return (
    <div className="space-y-5">
      <div className="surface rounded-2xl border border-border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="w-full md:w-80">
            <label className="lbl" htmlFor="checkinEventSelect">
              Program context
            </label>
            <select
              id="checkinEventSelect"
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
            <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
              Each pass is session-scoped — scanning always joins the right program and session.
            </p>
          </div>
          <div className="flex-1">
            <label className="lbl" htmlFor="quickCheckinInput">
              Quick check-in by name or student ID
            </label>
            <div className="flex gap-2">
              <input
                id="quickCheckinInput"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void quickJoin()
                }}
                placeholder="e.g. Aina or SU21134"
                className="inp py-2.5"
              />
              <BtnPrimary onClick={() => void quickJoin()}>
                <Icon name="check" size={12} />
                Join
              </BtnPrimary>
            </div>
          </div>
        </div>
        {event && (
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="chip chip-muted">Roster: {roster.length}</span>
            <span className="chip chip-success">
              <Icon name="circle-check" size={10} className="mr-1" />
              Joined: {joinedCount}
            </span>
            <span className="chip chip-danger">
              <Icon name="xmark" size={10} className="mr-1" />
              No-show: {noShowCount}
            </span>
          </div>
        )}
      </div>

      <div className="surface flex w-fit items-center gap-1 rounded-lg border border-border p-1">
        <button
          className={`mode-tab ${mode === 'scan' ? 'active' : ''}`}
          onClick={() => setModeSafe('scan')}
        >
          <Icon name="qrcode" size={12} className="mr-1.5" />
          Scan QR
        </button>
        <button
          className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setModeSafe('manual')}
        >
          <Icon name="list-check" size={12} className="mr-1.5" />
          Manual list
        </button>
      </div>

      {mode === 'scan' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="surface rounded-2xl border border-border p-5 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Camera scanner</h3>
              <div className="flex items-center gap-2">
                {!camOn ? (
                  <button
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Icon name="video" size={11} />
                    Start camera
                  </button>
                ) : (
                  <button
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    <Icon name="stop" size={11} />
                    Stop
                  </button>
                )}
              </div>
            </div>

            <div className={`scan-stage ${camOn ? '' : 'off'}`}>
              <video ref={videoRef} autoPlay muted playsInline className={camOn ? '' : 'hidden'} />
              {camOn && (
                <>
                  <div className="scan-frame" />
                  <div className="scan-pulse" />
                </>
              )}
              {!camOn && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Icon name="camera" size={28} style={{ color: '#33415C' }} />
                  <p className="text-xs" style={{ color: '#33415C' }}>
                    Camera off
                  </p>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <p className="mt-3 flex items-center text-xs" style={{ color: statusColor }}>
              <Icon name={statusIcon} size={12} className="mr-1.5" />
              <span>{status.msg}</span>
            </p>

            {logs.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {logs.map((l, i) => {
                  const s = LOG_STYLE[l.kind]
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${s.cls}`}>
                      <Icon name={s.icon} size={11} className="mt-0.5 shrink-0" />
                      <span className="flex-1">{l.text}</span>
                      <span className="shrink-0 opacity-70">· {l.time}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-4">
              <button
                onClick={() => setSimulateOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold underline"
                style={{ color: 'var(--primary)' }}
              >
                <Icon name="wand-magic-sparkles" size={12} />
                Can&apos;t use a camera? Simulate a scan
              </button>
              {simulateOpen && (
                <div className="mt-3 rounded-xl border border-border p-3">
                  <div className="mb-3 flex gap-2">
                    <input
                      value={simulateToken}
                      onChange={(e) => setSimulateToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = simulateToken.trim()
                          if (v) {
                            setSimulateToken('')
                            void handleToken(v)
                          }
                        }
                      }}
                      placeholder="Paste a code, e.g. MOTIONU|e1|s1|abc123"
                      spellCheck={false}
                      aria-label="Paste a participant code"
                      className="inp code-str flex-1 py-2 text-xs"
                    />
                    <button
                      onClick={() => {
                        const v = simulateToken.trim()
                        if (!v) return
                        setSimulateToken('')
                        void handleToken(v)
                      }}
                      className="shrink-0 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white"
                    >
                      Scan
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {pending.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
                        Everyone on this roster has been processed — nothing left to scan.
                      </p>
                    ) : (
                      pending.map((p) => {
                        const token = p.attendance.find((a) => a.attended === null && a.qr_token)
                        return (
                          <div key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover-soft">
                            <Avatar name={p.name} id={p.id} className="h-7 w-7 text-[10px]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">
                                {p.name}{' '}
                                <span className="font-normal" style={{ color: 'var(--ink-soft)' }}>
                                  {p.student_id}
                                </span>
                              </p>
                              <p className="code-str truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                                {token?.qr_token}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                if (!token?.qr_token) return
                                setSimulateScanning(p.id)
                                void handleToken(token.qr_token).finally(() => setSimulateScanning(null))
                              }}
                              disabled={simulateScanning === p.id}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-btn-primary px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              <Icon name="qrcode" size={10} />
                              {simulateScanning === p.id ? '…' : 'Scan'}
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="surface self-start rounded-2xl border border-border p-5 lg:col-span-2">
            <h3 className="font-display mb-1 text-sm font-semibold">How it works</h3>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Every roster member receives a unique QR pass (emailed from the Participants page).
              Point the camera at it — the scan marks them as{' '}
              <span className="font-semibold" style={{ color: 'var(--success)' }}>
                Joined
              </span>{' '}
              instantly.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                  <Icon name="envelope" size={11} />
                </div>
                <p className="pt-1 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  QR passes are emailed per participant before the program.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-energy-light text-energy">
                  <Icon name="qrcode" size={11} />
                </div>
                <p className="pt-1 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  Codes are program-specific — a pass for another program is rejected here.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn-light text-warn">
                  <Icon name="award" size={11} />
                </div>
                <p className="pt-1 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  Only fully joined participants are eligible for the certificate vault.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="surface overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                  <th className="px-5 py-3 font-medium">Participant</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Student ID</th>
                  <th className="px-5 py-3 font-medium">Next session</th>
                  <th className="px-5 py-3 text-right font-medium">Mark attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                      No one is on the roster for &quot;{event?.title}&quot; yet.
                    </td>
                  </tr>
                ) : (
                  roster.map((p) => {
                    const next = nextFor(p)
                    const done = !next
                    return (
                      <tr key={p.id}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={p.name} id={p.id} className="h-7 w-7 text-[10px]" />
                            <p className="text-sm font-medium">{p.name}</p>
                          </div>
                        </td>
                        <td className="hidden px-5 py-3 text-sm sm:table-cell" style={{ color: 'var(--ink-soft)' }}>
                          {p.student_id}
                        </td>
                        <td className="px-5 py-3">
                          {done ? (
                            <span className="chip chip-success">
                              <Icon name="circle-check" size={10} />
                              All done
                            </span>
                          ) : (
                            <span className="chip chip-muted">
                              <span className="status-dot" style={{ background: 'currentColor' }} />
                              {next!.label} pending
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {next && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => void mark(p, true)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover-success"
                                style={{ color: 'var(--success)' }}
                              >
                                Join
                              </button>
                              <button
                                onClick={() => void mark(p, false)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover-danger"
                                style={{ color: 'var(--danger)' }}
                              >
                                No-show
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
