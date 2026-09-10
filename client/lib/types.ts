export interface SessionItem {
  id: string
  ordinal: number
  label: string
  date: string
  start_time: string
  end_time: string
  location: string
}

export interface EventItem {
  id: string
  title: string
  category: string
  description: string
  capacity: number
  cert_min_sessions: number | null
  created_at: string
  sessions: SessionItem[]
  total_sessions: number
}

export interface AttendanceItem {
  session_id: string
  ordinal: number
  label: string
  date: string
  attended: boolean | null
  joined_by: string | null
  joined_at: string | null
  qr_token: string | null
  qr_sent_at: string | null
}

export interface ParticipantItem {
  id: string
  event_id: string
  name: string
  student_id: string
  email: string
  phone: string
  added_at: string
  attendance: AttendanceItem[]
}

export interface CheckinResult {
  participant: ParticipantItem
  event: EventItem
  session: SessionItem
  next_unlocked: boolean
  message: string | null
}

export interface CertField {
  key: 'name' | 'cert_no' | 'date'
  x: number
  y: number
  font_size: number
  color: string
  font: string
}

export interface TemplateInfo {
  event_id: string
  file_name: string
  file_type: string
  file_size: number
  uploaded_at: string
  download_url: string | null
  fields: CertField[]
}

export interface IssueResult {
  cert_no: string
  issued_at: string
  download_url: string | null
  rendered: boolean
  emailed: 'live' | 'simulated' | 'skipped' | null
}

export interface DashboardData {
  events: number
  participants: number
  certificates: number
  attendance_rate: number
  activity: { type: string; text: string; created_at: string }[]
  events_list: EventItem[]
}
