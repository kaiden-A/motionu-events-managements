import type { EventItem } from '@/lib/types'

export function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function to12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  let hh = h % 12
  if (hh === 0) hh = 12
  return `${hh}:${String(m ?? 0).padStart(2, '0')} ${ap}`
}

export type EventStatus = 'upcoming' | 'ongoing' | 'past'

export function eventStatus(ev: EventItem): EventStatus {
  const session = ev.sessions[0]
  if (!session) return 'past'
  const evDate = dateOnly(new Date(`${session.date}T00:00:00`))
  const today = dateOnly(new Date())
  if (evDate.getTime() === today.getTime()) return 'ongoing'
  return evDate < today ? 'past' : 'upcoming'
}

export function statusLabel(status: EventStatus): string {
  if (status === 'ongoing') return 'Happening today'
  if (status === 'past') return 'Past'
  return 'Upcoming'
}

export function dayLine(dateStr: string): string {
  const d = dateOnly(new Date(`${dateStr}T00:00:00`))
  const today = dateOnly(new Date())
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Happening today'
  if (diff === 1) return 'In 1 day'
  if (diff > 1) return `In ${diff} days`
  return `${-diff} day${diff === -1 ? '' : 's'} ago`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter((w) => w.length && !['Binti', 'Bin', 'A/P', 'A/L', 'Anak'].includes(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function avatarColor(id: string): string {
  const colors = [
    'var(--info)',
    '#0E7490',
    '#2563EB',
    '#0891B2',
    '#4338CA',
    '#0369A1',
  ]
  const n = parseInt(id.replace(/\D/g, ''), 10) || 0
  return colors[n % colors.length]
}

export function fmtBytes(bytes: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function fmtWhen(createdAt: string): string {
  const parts = createdAt.split(' ')
  const date = parts[0]
  const time = parts[1] ?? ''
  if (time) return `${formatDateShort(date)} · ${to12h(time)}`
  return formatDateShort(date)
}
