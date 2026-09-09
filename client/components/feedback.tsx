'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from '@/components/Icon'

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const TOAST_STYLES: Record<Toast['type'], { icon: IconName }> = {
  success: { icon: 'circle-check' },
  error: { icon: 'circle-exclamation' },
  info: { icon: 'circle-info' },
}

const TOAST_COLORS: Record<Toast['type'], string> = {
  success: 'var(--success)',
  error: 'var(--danger)',
  info: 'var(--info)',
}

const TOAST_BG: Record<Toast['type'], string> = {
  success: 'var(--success-light)',
  error: 'var(--danger-light)',
  info: 'var(--info-light)',
}

interface ToastApi {
  toast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastApi>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

function ToastView({ t, onDone }: { t: Toast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const color = TOAST_COLORS[t.type]

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), 3200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onDone, 250)
    return () => clearTimeout(timer)
  }, [leaving, onDone])

  return (
    <div
      role="status"
      className="toast flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-sm"
      style={{
        background: TOAST_BG[t.type],
        borderColor: color,
        color,
        opacity: leaving ? 0 : 1,
        transition: 'opacity .25s',
      }}
      onClick={() => setLeaving(true)}
    >
      <Icon name={TOAST_STYLES[t.type].icon} size={14} className="mt-0.5 shrink-0" />
      <span>{t.message}</span>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = ++seq.current
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-72 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <ToastView key={t.id} t={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

interface ConfirmApi {
  confirm: (message: string, opts?: { confirmLabel?: string }) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmApi>({ confirm: async () => false })

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    message: string
    confirmLabel: string
    resolve: (v: boolean) => void
  } | null>(null)

  const confirm = useCallback((message: string, opts?: { confirmLabel?: string }) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, confirmLabel: opts?.confirmLabel ?? 'Confirm', resolve })
    })
  }, [])

  const close = (result: boolean) => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="modal-panel surface w-full max-w-sm rounded-2xl p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-light text-danger">
                <Icon name="triangle-exclamation" size={14} />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold">Confirm action</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {state.message}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => close(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => close(true)}
                className="flex-1 rounded-lg bg-btn-danger px-4 py-2 text-sm font-medium text-white"
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
