import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const CERT_NO_RE = /^[A-Za-z0-9_-]+$/

function errorPage(title: string, detail: string, status: number) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${title} — Motion-U</title>
</head>
<body style="margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F4F6FB; font-family:'Segoe UI', Arial, Helvetica, sans-serif; color:#0F172A;">
  <div style="max-width:420px; margin:24px; padding:32px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:16px; text-align:center; box-shadow:0 6px 16px rgba(15,23,42,.06);">
    <div style="font-size:18px; font-weight:700; color:#1E3A8A; letter-spacing:.5px;">Motion-U</div>
    <h1 style="margin:16px 0 0; font-size:20px;">${title}</h1>
    <p style="margin:10px 0 0; font-size:14px; line-height:1.6; color:#475569;">${detail}</p>
  </div>
</body>
</html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certNo: string }> }
) {
  const { certNo } = await params
  const token = request.nextUrl.searchParams.get('token')
  if (!CERT_NO_RE.test(certNo) || !token) {
    return errorPage(
      'Certificate not found',
      'This download link is invalid. Please use the link from your certificate email.',
      404
    )
  }

  const upstream = await fetch(
    `${BACKEND_URL}/api/v1/certificates/download/${encodeURIComponent(certNo)}?token=${encodeURIComponent(token)}`,
    { redirect: 'follow', cache: 'no-store' }
  )

  if (!upstream.ok || !upstream.body) {
    const notFound = upstream.status === 404
    return errorPage(
      'Certificate unavailable',
      notFound
        ? 'This certificate could not be found. It may have been revoked.'
        : 'This download link is invalid. Please use the link from your certificate email.',
      notFound ? 404 : 403
    )
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="Motion-U Certificate - ${certNo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
