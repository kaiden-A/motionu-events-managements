'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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
    <main className="min-h-screen flex items-center justify-center bg-[#0f0f1e] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-700">
          Motion-U
        </p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">Movement &amp; Wellness</h1>
        <p className="mt-1 text-sm text-neutral-500">Events management — sign in to continue.</p>

        {message && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {message}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800"
        >
          Sign in with Zitadel
        </a>
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
