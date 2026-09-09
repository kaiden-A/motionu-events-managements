'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { api } from '@/lib/api'
import type { CheckinResult, EventItem } from '@/lib/types'

interface LogEntry {
  text: string
  kind: 'ok' | 'error' | 'info'
  time: string
}

export default function CheckinPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [last, setLast] = useState<CheckinResult | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [camOn, setCamOn] = useState(false)
  const [status, setStatus] = useState('Ready — press Start camera.')
  const [manualToken, setManualToken] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const cooldownRef = useRef(0)

  const pushLog = useCallback((text: string, kind: LogEntry['kind']) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    setLogs((prev) => [{ text, kind, time }, ...prev].slice(0, 8))
  }, [])

  const handleToken = useCallback(
    async (raw: string) => {
      try {
        const result = await api.checkin(raw.trim())
        setLast(result)
        pushLog(
          `${result.participant.name} joined ${result.session.label} of ${result.event.title}` +
            (result.next_unlocked ? ' — next pass unlocked' : ''),
          'ok'
        )
        setStatus(`Joined: ${result.participant.name} → ${result.session.label}`)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Scan failed'
        pushLog(message, 'error')
        setStatus(message)
      }
    },
    [pushLog]
  )

  const scanFrame = useCallback(() => {
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
          handleToken(code.data)
        }
      }
    } catch {
      /* frame skip */
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }, [handleToken])

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera not supported here — paste a token below.')
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
      setStatus('Point the camera at a participant QR pass.')
      rafRef.current = requestAnimationFrame(scanFrame)
    } catch {
      setStatus('Camera unavailable or permission denied — paste a token below.')
    }
  }

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }, [])

  useEffect(() => {
    api.listEvents().then(setEvents).catch(console.error)
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Check-in</h1>
        <p className="text-sm text-neutral-500">
          Scan a session QR pass — the pass itself selects the program and session.
        </p>
      </div>

      <p className="text-sm text-neutral-500">
        {events.length} program{events.length === 1 ? '' : 's'} live. No selector needed: each pass
        is session-scoped.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border bg-white p-5">
          <h3 className="font-semibold">Camera scan</h3>
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-sm text-neutral-600">{status}</p>
          <div className="flex gap-2">
            {!camOn ? (
              <button
                onClick={startCamera}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white"
              >
                Start camera
              </button>
            ) : (
              <button onClick={stopCamera} className="rounded-lg border px-4 py-2 text-sm">
                Stop camera
              </button>
            )}
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-neutral-500">No camera? Paste a pass token:</p>
            <div className="mt-1 flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pass token"
                className="flex-1 rounded-lg border px-3 py-2 font-mono text-xs"
              />
              <button
                onClick={() => {
                  if (manualToken.trim()) {
                    handleToken(manualToken.trim())
                    setManualToken('')
                  }
                }}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white"
              >
                Check in
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {last && (
            <div className="rounded-2xl border border-green-300 bg-green-50 p-4">
              <p className="font-semibold text-green-900">
                {last.participant.name} → {last.session.label}
              </p>
              <p className="text-sm text-green-800">
                {last.event.title}
                {last.next_unlocked ? ' · next session pass unlocked + sent' : ''}
              </p>
            </div>
          )}
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="mb-2 font-semibold">Scan log</h3>
            <div className="space-y-1.5">
              {logs.length === 0 && (
                <p className="text-xs text-neutral-400">Nothing scanned yet.</p>
              )}
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    l.kind === 'ok'
                      ? 'bg-green-50 text-green-800'
                      : l.kind === 'error'
                        ? 'bg-red-50 text-red-800'
                        : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {l.text} <span className="text-neutral-400">· {l.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
