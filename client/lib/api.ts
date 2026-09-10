'use client'

import type {
  CertField,
  CheckinResult,
  DashboardData,
  EventItem,
  IssueResult,
  ParticipantItem,
  TemplateInfo,
} from './types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  dashboard: () => req<DashboardData>('/dashboard'),

  listEvents: () => req<EventItem[]>('/events'),
  getEvent: (id: string) => req<EventItem>(`/events/${id}`),
  createEvent: (data: unknown) =>
    req<EventItem>('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: unknown) =>
    req<EventItem>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: string) => req<unknown>(`/events/${id}`, { method: 'DELETE' }),

  listParticipants: (eventId: string) =>
    req<ParticipantItem[]>(`/events/${eventId}/participants`),
  addParticipant: (eventId: string, data: unknown) =>
    req<ParticipantItem>(`/events/${eventId}/participants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateParticipant: (eventId: string, pid: string, data: unknown) =>
    req<ParticipantItem>(`/events/${eventId}/participants/${pid}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  removeParticipant: (eventId: string, pid: string) =>
    req<unknown>(`/events/${eventId}/participants/${pid}`, { method: 'DELETE' }),

  setAttendance: (eventId: string, pid: string, session_id: string, attended: boolean) =>
    req<ParticipantItem>(`/events/${eventId}/participants/${pid}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ session_id, attended }),
    }),
  sendPass: (eventId: string, pid: string, sessionId: string) =>
    req<{ ok: boolean; sent: boolean; mode: 'live' | 'simulated'; to: string; session_id: string }>(
      `/events/${eventId}/participants/${pid}/send-pass/${sessionId}`,
      { method: 'POST' }
    ),
  unlockPass: (eventId: string, pid: string, sessionId: string) =>
    req<ParticipantItem>(`/events/${eventId}/participants/${pid}/unlock/${sessionId}`, {
      method: 'POST',
    }),

  checkin: (token: string) =>
    req<CheckinResult>('/checkin', { method: 'POST', body: JSON.stringify({ token }) }),

  getTemplate: (eventId: string) => req<TemplateInfo | null>(`/certificates/template/${eventId}`),
  presignTemplate: (event_id: string, file_name: string, content_type: string, file_size: number) =>
    req<{ upload_url: string; r2_key: string }>(`/certificates/presign`, {
      method: 'POST',
      body: JSON.stringify({ event_id, file_name, content_type, file_size }),
    }),
  confirmTemplate: (event_id: string, r2_key: string, file_name: string, file_type: string, file_size: number) =>
    req<TemplateInfo>(`/certificates/confirm`, {
      method: 'POST',
      body: JSON.stringify({ event_id, r2_key, file_name, file_type, file_size }),
    }),
  removeTemplate: (eventId: string) =>
    req<unknown>(`/certificates/template/${eventId}`, { method: 'DELETE' }),
  saveTemplateFields: (eventId: string, fields: CertField[]) =>
    req<TemplateInfo>(`/certificates/template/${eventId}/fields`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    }),
  issueCertificate: (eventId: string, pid: string) =>
    req<IssueResult>(`/certificates/issue/${eventId}/${pid}`, { method: 'POST' }),
  revokeCertificate: (eventId: string, pid: string) =>
    req<unknown>(`/certificates/revoke/${eventId}/${pid}`, { method: 'DELETE' }),
}
