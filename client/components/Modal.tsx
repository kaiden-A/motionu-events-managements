'use client'

import { useEffect, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

interface ModalProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  maxWidth?: string
  actions?: ReactNode
  footer?: ReactNode
  hideHeader?: boolean
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-lg',
  actions,
  hideHeader,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal-panel surface flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h3 className="font-display font-semibold">{title}</h3>
              {subtitle && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="hover-soft rounded-lg p-1.5 text-ink-soft"
            >
              <Icon name="xmark" size={14} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {actions && (
          <div className="border-t border-border px-5 py-4">{actions}</div>
        )}
      </div>
    </div>
  )
}
