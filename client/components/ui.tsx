import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/Icon'

export function EmptyState({
  icon = 'calendar-plus',
  title,
  hint,
  children,
}: {
  icon?: IconName
  title: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="surface rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <Icon name={icon} size={28} className="mb-3" style={{ color: 'var(--border-strong)' }} />
      <p className="text-sm font-medium">{title}</p>
      {hint && (
        <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: 'var(--ink-soft)' }}>
          {hint}
        </p>
      )}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  )
}

export function Progress({
  value,
  color,
  className = 'h-1.5',
}: {
  value: number
  color?: string
  className?: string
}) {
  return (
    <div className={`progress-track ${className}`}>
      <div
        className="progress-fill"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color ?? 'var(--primary)' }}
      />
    </div>
  )
}

export function BtnPrimary({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export function BtnGhost({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover-soft ${className}`}
    >
      {children}
    </button>
  )
}

export function IconBtn({
  label,
  onClick,
  icon,
  tone,
  className = 'h-9 w-9',
  ...rest
}: {
  label: string
  onClick?: () => void
  icon: IconName
  tone?: 'danger' | 'info' | 'primary'
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const toneColor =
    tone === 'danger' ? 'var(--danger)' : tone === 'info' ? 'var(--info)' : tone === 'primary' ? 'var(--primary)' : undefined
  return (
    <button
      {...rest}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-lg border border-border hover-soft ${className}`}
      style={{ color: toneColor }}
    >
      <Icon name={icon} size={12} />
    </button>
  )
}
