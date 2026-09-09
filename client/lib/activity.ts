export const ACTIVITY_META: Record<
  string,
  { icon: string; colorVar: string }
> = {
  register: { icon: 'user-plus', colorVar: 'var(--primary)' },
  join: { icon: 'clipboard-check', colorVar: 'var(--success)' },
  cert: { icon: 'award', colorVar: 'var(--warn)' },
  qr: { icon: 'qrcode', colorVar: 'var(--info)' },
  'no-show': { icon: 'user-xmark', colorVar: 'var(--danger)' },
  event: { icon: 'calendar-plus', colorVar: 'var(--info)' },
}
