'use client'

import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { Icon } from '@/components/Icon'
import { BtnGhost, BtnPrimary } from '@/components/ui'
import { useToast } from '@/components/feedback'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { CertField, TemplateInfo } from '@/lib/types'

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const KEYS: CertField['key'][] = ['name', 'cert_no', 'date']
const FIELD_LABELS: Record<CertField['key'], string> = {
  name: 'Participant name',
  cert_no: 'Certificate no.',
  date: 'Issue date',
}
const FONTS = ['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Courier']
const FONT_SIZES = [24, 28, 32, 36, 40, 48, 56]
const DEFAULT_FIELD: Omit<CertField, 'key' | 'x' | 'y'> = {
  font_size: 32,
  color: '#1E3A8A',
  font: 'Helvetica-Bold',
}

const FONT_STACKS: Record<string, { weight: string; family: string }> = {
  Helvetica: { weight: '400', family: 'Helvetica, Arial, sans-serif' },
  'Helvetica-Bold': { weight: '700', family: 'Helvetica, Arial, sans-serif' },
  'Times-Roman': { weight: '400', family: '"Times New Roman", Times, serif' },
  Courier: { weight: '400', family: '"Courier New", Courier, monospace' },
}

interface SampleValues {
  name: string
  cert_no: string
  date: string
}

interface HitBox {
  key: CertField['key']
  left: number
  right: number
  top: number
  bottom: number
}

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function defaultSample(): SampleValues {
  return {
    name: 'Alice Tan',
    cert_no: 'MU-2026-0001',
    date: formatDate(todayISO()),
  }
}

interface Props {
  template: TemplateInfo
  onClose: () => void
  onSaved: () => void
}

export function CertFieldPicker({ template, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const [fields, setFields] = useState<CertField[]>(template.fields ?? [])
  const [sample, setSample] = useState<SampleValues>(defaultSample)
  const [activeKey, setActiveKey] = useState<CertField['key'] | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pagePt, setPagePt] = useState({ w: 595, h: 842 })
  const [saving, setSaving] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const hitBoxes = useRef<HitBox[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api
      .getTemplate(template.event_id)
      .then((t) => {
        if (!alive) return
        if (t?.download_url) setDownloadUrl(t.download_url)
        else setError('Template no longer available — re-upload it first.')
      })
      .catch(() => {
        if (alive) setError('Could not load the template preview.')
      })
    return () => {
      alive = false
    }
  }, [template.event_id])

  useEffect(() => {
    if (!downloadUrl) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(downloadUrl)
        if (!res.ok) throw new Error(`Download failed (${res.status})`)
        const data = await res.arrayBuffer()
        const pdf = await getDocument({ data }).promise
        const page = await pdf.getPage(1)
        const v1 = page.getViewport({ scale: 1 })
        const cssW = Math.min(640, wrapRef.current?.clientWidth ?? 640)
        const s = cssW / v1.width
        const viewport = page.getViewport({ scale: s * (window.devicePixelRatio || 1) })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        canvas.style.width = `${cssW}px`
        canvas.style.height = `${cssW * (v1.height / v1.width)}px`
        await page.render({ canvas, viewport }).promise
        if (!alive) return
        setScale(s)
        setPagePt({ w: v1.width, h: v1.height })
        setReady(true)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load PDF preview')
      }
    })()
    return () => {
      alive = false
    }
  }, [downloadUrl])

  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas || !ready) return
    const dpr = window.devicePixelRatio || 1
    const cssW = pagePt.w * scale
    const cssH = pagePt.h * scale
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    const boxes: HitBox[] = []
    for (const f of fields) {
      const value = sample[f.key].trim() || FIELD_LABELS[f.key]
      const stack = FONT_STACKS[f.font] ?? FONT_STACKS.Helvetica
      let size = f.font_size || DEFAULT_FIELD.font_size
      ctx.font = `${stack.weight} ${size}px ${stack.family}`
      while (ctx.measureText(value).width > pagePt.w - 40 && size > 8) {
        size *= 0.9
        ctx.font = `${stack.weight} ${size}px ${stack.family}`
      }
      const metrics = ctx.measureText(value)
      const baseline = f.y + size * 0.36
      const width = metrics.width
      const ascent = metrics.actualBoundingBoxAscent || size * 0.75
      const descent = metrics.actualBoundingBoxDescent || size * 0.25
      const left = f.x - width / 2
      const right = f.x + width / 2
      const top = baseline + ascent
      const bottom = baseline - descent

      if (f.key === activeKey) {
        ctx.save()
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.strokeStyle = f.color || DEFAULT_FIELD.color
        ctx.strokeRect(left - 5, pagePt.h - top - 4, width + 10, top - bottom + 8)
        ctx.restore()
      }

      ctx.fillStyle = f.color || DEFAULT_FIELD.color
      ctx.fillText(value, f.x, pagePt.h - baseline)
      boxes.push({
        key: f.key,
        left: left - 4,
        right: right + 4,
        top: top + 4,
        bottom: bottom - 4,
      })
    }
    hitBoxes.current = boxes
  }, [fields, sample, activeKey, scale, pagePt, ready])

  const updateField = (key: CertField['key'], patch: Partial<CertField>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  }

  const place = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = pagePt.h - (e.clientY - rect.top) / scale

    const hit = [...hitBoxes.current]
      .reverse()
      .find((b) => x >= b.left && x <= b.right && y >= b.bottom && y <= b.top)
    if (hit) {
      setActiveKey((prev) => (prev === hit.key ? null : hit.key))
      return
    }

    if (!activeKey) return
    const existing = fields.find((f) => f.key === activeKey)
    const patch: CertField = existing
      ? { ...existing, x, y }
      : { key: activeKey, x, y, ...DEFAULT_FIELD }
    setFields((prev) => [...prev.filter((f) => f.key !== activeKey), patch])
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.saveTemplateFields(template.event_id, fields)
      toast('Field positions saved.')
      onSaved()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const has = (key: CertField['key']) => fields.some((f) => f.key === key)
  const selectedField = fields.find((f) => f.key === activeKey) ?? null

  return (
    <div className="p-5">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Pick a field type, then click on the certificate to place it. Type sample values
        below to see exactly how names, numbers and dates will look.
      </p>

      <div className="mt-3 rounded-xl border border-border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
          Preview with
        </p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KEYS.map((key) => (
            <div key={key}>
              <label className="lbl" htmlFor={`sample-${key}`}>
                {FIELD_LABELS[key]}
              </label>
              <input
                id={`sample-${key}`}
                value={sample[key]}
                onChange={(e) => setSample((prev) => ({ ...prev, [key]: e.target.value }))}
                className="inp"
                placeholder={FIELD_LABELS[key]}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          Preview only — real values are filled in for each participant when a certificate
          is issued.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {KEYS.map((key) => {
          const active = activeKey === key
          const placed = has(key)
          return (
            <button
              key={key}
              onClick={() => setActiveKey(active ? null : key)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                active ? 'chip-success' : 'border-border hover-soft'
              }`}
              style={
                active
                  ? { background: 'var(--success-light)', borderColor: 'var(--success)' }
                  : undefined
              }
            >
              <Icon
                name={placed ? 'circle-check' : active ? 'wand-magic-sparkles' : 'pen'}
                size={11}
              />
              {FIELD_LABELS[key]}
              {placed && <span className="text-[10px] opacity-70">· placed</span>}
            </button>
          )
        })}
      </div>

      <div
        ref={wrapRef}
        className="relative mt-4 overflow-hidden rounded-xl border border-border"
        style={{ background: 'var(--surface-2)' }}
      >
        <canvas
          ref={canvasRef}
          onClick={place}
          className={`block max-w-full min-h-64 ${activeKey ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute left-0 top-0" />
        {error ? (
          <div className="absolute inset-0 flex h-64 items-center justify-center px-6 text-center text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        ) : !ready ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--ink-soft)' }}>
            Loading preview…
          </div>
        ) : null}
      </div>

      {selectedField && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
              {FIELD_LABELS[selectedField.key]}
            </p>
            <button
              onClick={() => {
                setFields((prev) => prev.filter((f) => f.key !== selectedField.key))
                setActiveKey(null)
              }}
              className="text-xs font-medium hover-soft rounded-lg px-2 py-1"
              style={{ color: 'var(--danger)' }}
            >
              Remove field
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="lbl" htmlFor={`fs-${selectedField.key}`}>
                Font size
              </label>
              <select
                id={`fs-${selectedField.key}`}
                value={selectedField.font_size}
                onChange={(e) => updateField(selectedField.key, { font_size: Number(e.target.value) })}
                className="inp"
              >
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} pt
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor={`font-${selectedField.key}`}>
                Font
              </label>
              <select
                id={`font-${selectedField.key}`}
                value={selectedField.font}
                onChange={(e) => updateField(selectedField.key, { font: e.target.value })}
                className="inp"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor={`color-${selectedField.key}`}>
                Color
              </label>
              <input
                id={`color-${selectedField.key}`}
                type="color"
                value={selectedField.color}
                onChange={(e) => updateField(selectedField.key, { color: e.target.value })}
                className="inp h-9 cursor-pointer p-1"
              />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Click a new spot on the certificate to move it, or click the text to select it.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <BtnGhost className="flex-1" onClick={onClose}>
          Cancel
        </BtnGhost>
        <BtnPrimary className="flex-1" onClick={save} disabled={saving}>
          <Icon name="check" size={12} />
          {saving ? 'Saving…' : 'Save positions'}
        </BtnPrimary>
      </div>
    </div>
  )
}
