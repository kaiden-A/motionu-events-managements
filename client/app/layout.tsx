import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Motion-U Events',
  description: 'Motion-U Movement & Wellness Club — events management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-100 text-neutral-900">{children}</body>
    </html>
  )
}
