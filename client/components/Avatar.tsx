import { avatarColor, initials } from '@/lib/format'

interface AvatarProps {
  name: string
  id?: string | null
  picture?: string | null
  className?: string
  textClassName?: string
  title?: string
}

export function Avatar({ name, id, picture, className = '', textClassName = '', title }: AvatarProps) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt=""
        title={title}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      title={title}
      aria-label={name}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ background: avatarColor(id ?? name) }}
    >
      <span className={textClassName}>{initials(name)}</span>
    </div>
  )
}
