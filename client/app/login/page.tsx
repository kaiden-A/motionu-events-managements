'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Icon } from '@/components/Icon'

const MESSAGES: Record<string, string> = {
  access_denied: 'Sign in was cancelled or not allowed.',
  invalid_state: 'Sign in failed. Please try again.',
  token_exchange_failed: 'Could not complete sign in. Please try again.',
  invalid_token: 'Sign in verification failed. Please try again.',
  forbidden_org: 'Your account is not authorized to access this workspace.',
}

function LoginBody() {
  const params = useSearchParams()
  const err = params.get('error')
  const message = err ? (MESSAGES[err] ?? 'Sign in failed. Please try again.') : ''

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, var(--sidebar) 0%, var(--sidebar-2) 60%, var(--primary-dark) 160%)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="Motion-U logo"
            className="h-12 w-12 rounded-2xl object-cover shadow-lg"
          />
          <div className="text-left">
            <p className="font-display text-lg font-semibold leading-tight text-white">Motion-U</p>
            <p className="text-xs leading-snug text-white/60">
              Mobility, Technology &amp; Industry On University Startup Incubator
            </p>
          </div>
        </div>

        <div className="surface rounded-2xl p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Event Management
          </p>
          <h1 className="mt-2 text-2xl font-bold">Events, one dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Programs, QR check-in and certificates — sign in with your club account to continue.
          </p>

          {message && (
            <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm text-red-700" style={{ background: 'var(--danger-light)' }}>
              <Icon name="circle-exclamation" size={14} className="mt-0.5 shrink-0" />
              {message}
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/login"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-btn-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Icon name="person-running" size={14} />
            Sign in with Zitadel
          </a>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginBody />
    </Suspense>
  )
}
