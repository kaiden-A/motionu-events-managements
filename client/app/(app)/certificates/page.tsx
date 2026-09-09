'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { BtnPrimary, EmptyState, IconBtn } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { useConfirm, useToast } from '@/components/feedback'
import { api } from '@/lib/api'
import { categoryMeta } from '@/lib/category'
import { fmtBytes, formatDateShort } from '@/lib/format'
import type { EventItem, TemplateInfo } from '@/lib/types'

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export default function CertificatesPage() {
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [events, setEvents] = useState<EventItem[]>([])
  const [templates, setTemplates] = useState<Record<string, TemplateInfo | null>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ ev: EventItem; t: TemplateInfo } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef('')

  const reload = async () => {
    const list = await api.listEvents()
    setEvents(list)
    const map: Record<string, TemplateInfo | null> = {}
    await Promise.all(
      list.map(async (e) => {
        try {
          map[e.id] = await api.getTemplate(e.id)
        } catch {
          map[e.id] = null
        }
      })
    )
    setTemplates(map)
  }

  useEffect(() => {
    let alive = true
    api
      .listEvents()
      .then(async (list) => {
        const map: Record<string, TemplateInfo | null> = {}
        await Promise.all(
          list.map(async (e) => {
            try {
              map[e.id] = await api.getTemplate(e.id)
            } catch {
              map[e.id] = null
            }
          })
        )
        if (!alive) return
        setEvents(list)
        setTemplates(map)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
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

    const okType = ALLOWED.includes(file.type) || /\.(pdf|png|jpe?g|webp|svg)$/i.test(file.name)
    if (!okType) {
      toast('Only PDF or image files are allowed.', 'error')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('File is larger than 8 MB.', 'error')
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
      toast('Template saved.')
      setPreview(null)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(null)
    }
  }

  const remove = async (ev: EventItem) => {
    const ok = await confirm(
      `Remove the certificate template for "${ev.title}"? Issued certificates keep their records, but no new ones can be issued until a template is set.`,
      { confirmLabel: 'Remove template' }
    )
    if (!ok) return
    try {
      await api.removeTemplate(ev.id)
      toast('Template removed.', 'info')
      setPreview(null)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Remove failed', 'error')
    }
  }

  const ready = events.filter((e) => templates[e.id]).length
  const missing = events.length - ready

  if (loading) return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</p>

  return (
    <div className="space-y-5">
      {events.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <span className="chip chip-muted">Programs: {events.length}</span>
          <span className="chip chip-success">
            <Icon name="file-circle-check" size={10} className="mr-1" />
            Templates ready: {ready}
          </span>
          {missing > 0 && <span className="chip chip-muted">Missing template: {missing}</span>}
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />

      {events.length === 0 ? (
        <EmptyState
          icon="award"
          title="No programs yet"
          hint="Create a program to manage its certificate template."
        >
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-lg bg-btn-primary px-4 py-2 text-xs font-semibold text-white"
          >
            <Icon name="calendar-plus" size={12} />
            Create program
          </Link>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[...events]
            .sort(
              (a, b) =>
                new Date(a.sessions[0]?.date ?? '').getTime() -
                new Date(b.sessions[0]?.date ?? '').getTime()
            )
            .map((ev) => {
              const cat = categoryMeta(ev.category)
              const t = templates[ev.id] ?? null
              const isImg = t ? t.file_type.startsWith('image/') : false
              return (
                <div key={ev.id} className="surface flex flex-col overflow-hidden rounded-2xl border border-border">
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className="text-[10px] font-medium uppercase tracking-wide"
                          style={{ color: 'var(--ink-soft)' }}
                        >
                          <Icon name={cat.icon as IconName} size={10} className="mr-1" />
                          {ev.category} · {formatDateShort(ev.sessions[0]?.date ?? '')}
                        </p>
                        <h3 className="font-display mt-0.5 font-semibold leading-snug">{ev.title}</h3>
                      </div>
                      {t ? (
                        <span className="chip chip-success shrink-0">
                          <span className="status-dot" style={{ background: 'currentColor' }} />
                          Ready
                        </span>
                      ) : (
                        <span className="chip chip-muted shrink-0">
                          <span className="status-dot" style={{ background: 'currentColor' }} />
                          Not set
                        </span>
                      )}
                    </div>

                    <div
                      className="mb-4 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-border"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      {t ? (
                        isImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.download_url ?? ''}
                            alt="template"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1" style={{ color: 'var(--danger)' }}>
                            <Icon name="file-pdf" size={24} />
                            <span className="text-[10px] font-medium">PDF</span>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--border-strong)' }}>
                          <Icon name="file-circle-question" size={24} />
                          <span className="text-[10px] font-medium">No template</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                      {t ? (
                        <>
                          {t.file_name}
                          <br />
                          {fmtBytes(t.file_size)} · uploaded {formatDateShort(t.uploaded_at)}
                        </>
                      ) : (
                        'No template uploaded for this program yet.'
                      )}
                    </p>

                    <div className="mt-auto flex gap-2 pt-4">
                      {t ? (
                        <>
                          <button
                            onClick={() => setPreview({ ev, t })}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover-soft"
                          >
                            <Icon name="eye" size={11} />
                            Preview
                          </button>
                          <IconBtn
                            label="Download template"
                            icon="download"
                            tone="info"
                            onClick={() => {
                              if (t.download_url) window.open(t.download_url, '_blank', 'noopener')
                            }}
                          />
                          <IconBtn label="Replace template" icon="rotate" onClick={() => chooseFile(ev.id)} />
                          <IconBtn
                            label="Remove template"
                            icon="trash"
                            tone="danger"
                            onClick={() => void remove(ev)}
                          />
                        </>
                      ) : (
                        <button
                          onClick={() => chooseFile(ev.id)}
                          disabled={uploading === ev.id}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: 'var(--btn-warn)' }}
                        >
                          <Icon name="upload" size={11} />
                          {uploading === ev.id ? 'Uploading…' : 'Upload template'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {preview && (
        <Modal
          title={preview.t.file_name}
          subtitle={`Certificate template · ${preview.ev.title} · ${fmtBytes(preview.t.file_size)}`}
          onClose={() => setPreview(null)}
          maxWidth="max-w-2xl"
          actions={
            <div className="flex gap-3">
              <BtnPrimary
                className="flex-1"
                onClick={() => {
                  if (preview.t.download_url) window.open(preview.t.download_url, '_blank', 'noopener')
                }}
              >
                <Icon name="download" size={12} />
                Download file
              </BtnPrimary>
            </div>
          }
        >
          <div className="p-5">
            {preview.t.file_type.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.t.download_url ?? ''}
                alt="template"
                className="mx-auto max-h-[430px] rounded-lg border border-border"
              />
            ) : preview.t.file_type === 'application/pdf' ? (
              <iframe
                src={preview.t.download_url ?? ''}
                title={preview.t.file_name}
                className="h-[430px] w-full rounded-lg border border-border"
              />
            ) : (
              <p className="py-16 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                This file type cannot be previewed here — use Download instead.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
