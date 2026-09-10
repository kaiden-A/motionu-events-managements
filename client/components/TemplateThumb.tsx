'use client'

import { useEffect, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { Icon } from '@/components/Icon'
import type { TemplateInfo } from '@/lib/types'

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const THUMB_CACHE = new Map<string, string>()

function cacheKey(t: TemplateInfo) {
  return `${t.file_name}|${t.uploaded_at}|${t.file_size}`
}

export function TemplateThumb({ template, className }: { template: TemplateInfo; className?: string }) {
  const [src, setSrc] = useState<string | null>(() => THUMB_CACHE.get(cacheKey(template)) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (template.file_type.startsWith('image/') || src) return
    let alive = true
    ;(async () => {
      try {
        if (!template.download_url) throw new Error('Template download URL missing')
        const res = await fetch(template.download_url)
        if (!res.ok) throw new Error(`Download failed (${res.status})`)
        const data = await res.arrayBuffer()
        const pdf = await getDocument({ data }).promise
        const page = await pdf.getPage(1)
        const v1 = page.getViewport({ scale: 1 })
        const scale = 144 / v1.width
        const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        await page.render({ canvas, viewport }).promise
        const dataUrl = canvas.toDataURL('image/png')
        THUMB_CACHE.set(cacheKey(template), dataUrl)
        if (alive) setSrc(dataUrl)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [template, src])

  if (template.file_type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={template.download_url ?? ''} alt="template" className={className} />
  }
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="template" className={className} />
  }
  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ color: failed ? 'var(--danger)' : 'var(--border-strong)' }}
    >
      <Icon name="file-pdf" size={24} />
      <span className="text-[10px] font-medium">{failed ? 'PDF' : 'Loading…'}</span>
    </div>
  )
}