'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { EventItem, TemplateInfo } from '@/lib/types'

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export default function CertificatesPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [templates, setTemplates] = useState<Record<string, TemplateInfo | null>>({})
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<string>('')

  const reload = async () => {
    const list = await api.listEvents()
    setEvents(list)
    const map: Record<string, TemplateInfo | null> = {}
    for (const e of list) {
      try {
        map[e.id] = await api.getTemplate(e.id)
      } catch {
        map[e.id] = null
      }
    }
    setTemplates(map)
  }

  useEffect(() => {
    reload().catch(console.error)
  }, [])

  const chooseFile = (eventId: string) => {
    targetRef.current = eventId
    fileRef.current?.click()
  }

  const onFile = async () => {
    const file = fileRef.current?.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    const eventId = targetRef.current
    if (!file || !eventId) return

    const okType =
      ALLOWED.includes(file.type) || /\.(pdf|png|jpe?g|webp|svg)$/i.test(file.name)
    if (!okType) {
      setMsg('Only PDF or image files are allowed.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg('File is larger than 8 MB.')
      return
    }

    setUploading(eventId)
    try {
      const presign = await api.presignTemplate(eventId, file.name, file.type, file.size)
      const put = await fetch(presign.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) throw new Error(`R2 upload failed (${put.status})`)
      await api.confirmTemplate(eventId, presign.r2_key, file.name, file.type, file.size)
      setMsg(`Template saved.`)
      reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const remove = async (eventId: string) => {
    if (!confirm('Remove this template? Issued certificate records are kept.')) return
    await api.removeTemplate(eventId)
    reload()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Certificate Vault</h1>
        <p className="text-sm text-neutral-500">
          One template per program, stored in Cloudflare R2. Certificates are issued from the
          Participants page.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {msg}{' '}
          <button onClick={() => setMsg('')} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.map((ev) => {
          const t = templates[ev.id]
          return (
            <div key={ev.id} className="flex flex-col rounded-2xl border bg-white p-5">
              <p className="text-[11px] uppercase tracking-wide text-neutral-400">
                {ev.category}
              </p>
              <h3 className="font-semibold">{ev.title}</h3>
              <div className="my-4 flex h-32 items-center justify-center rounded-xl border bg-neutral-50 text-sm text-neutral-400">
                {t ? (
                  <a
                    href={t.download_url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-700 underline"
                  >
                    {t.file_name} — open preview
                  </a>
                ) : (
                  'No template'
                )}
              </div>
              <p className="text-xs text-neutral-500">
                {t
                  ? `${t.file_name} · ${(t.file_size / 1024).toFixed(0)} KB · uploaded ${t.uploaded_at}`
                  : 'No template uploaded for this program yet.'}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => chooseFile(ev.id)}
                  disabled={uploading === ev.id}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white ${
                    t ? 'bg-neutral-600' : 'bg-amber-600'
                  } disabled:opacity-50`}
                >
                  {uploading === ev.id
                    ? 'Uploading…'
                    : t
                      ? 'Replace template'
                      : 'Upload template'}
                </button>
                {t && (
                  <button
                    onClick={() => remove(ev.id)}
                    className="rounded-lg border px-3 py-2 text-xs text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
