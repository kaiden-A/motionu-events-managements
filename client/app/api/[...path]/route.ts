import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '')

async function forward(request: NextRequest, method: string) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const path = request.nextUrl.pathname.replace(/^\/api/, '') || '/'
  const url = `${BACKEND_URL}${path}${request.nextUrl.search}`

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  }

  if (method !== 'GET' && method !== 'HEAD') {
    try {
      init.body = JSON.stringify(await request.json())
    } catch {
      init.body = undefined
    }
  }

  const upstream = await fetch(url, init)
  const text = await upstream.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  return NextResponse.json(data, { status: upstream.status })
}

export async function GET(request: NextRequest) {
  return forward(request, 'GET')
}
export async function POST(request: NextRequest) {
  return forward(request, 'POST')
}
export async function PUT(request: NextRequest) {
  return forward(request, 'PUT')
}
export async function DELETE(request: NextRequest) {
  return forward(request, 'DELETE')
}
