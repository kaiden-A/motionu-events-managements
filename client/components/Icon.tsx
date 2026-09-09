import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAward,
  faArrowLeft,
  faArrowRightFromBracket,
  faBan,
  faBars,
  faBolt,
  faCalendarDays,
  faCalendarPlus,
  faCamera,
  faChartSimple,
  faCheck,
  faChevronDown,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faClipboardCheck,
  faDownload,
  faDumbbell,
  faEllipsisVertical,
  faEye,
  faFileCircleCheck,
  faFileCircleQuestion,
  faFilePdf,
  faGaugeHigh,
  faHandFist,
  faLayerGroup,
  faListCheck,
  faLock,
  faLocationDot,
  faMagnifyingGlass,
  faMoon,
  faMusic,
  faPaperPlane,
  faPen,
  faPersonRunning,
  faPlus,
  faQrcode,
  faRotate,
  faSpa,
  faStop,
  faSun,
  faTrash,
  faTriangleExclamation,
  faUpload,
  faUserPlus,
  faUsers,
  faUserXmark,
  faVideo,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import {
  faBell,
  faCalendar,
  faClock,
  faEnvelope,
} from '@fortawesome/free-regular-svg-icons'

export type IconName =
  | 'award'
  | 'arrow-left'
  | 'arrow-right-from-bracket'
  | 'ban'
  | 'bars'
  | 'bolt'
  | 'calendar-days'
  | 'calendar-plus'
  | 'camera'
  | 'chart-simple'
  | 'check'
  | 'chevron-down'
  | 'circle-check'
  | 'circle-exclamation'
  | 'circle-info'
  | 'clipboard-check'
  | 'download'
  | 'dumbbell'
  | 'ellipsis-vertical'
  | 'eye'
  | 'file-circle-check'
  | 'file-circle-question'
  | 'file-pdf'
  | 'gauge'
  | 'hand-fist'
  | 'layer-group'
  | 'list-check'
  | 'lock'
  | 'location-dot'
  | 'magnifying-glass'
  | 'moon'
  | 'music'
  | 'paper-plane'
  | 'pen'
  | 'person-running'
  | 'plus'
  | 'qrcode'
  | 'rotate'
  | 'spa'
  | 'stop'
  | 'sun'
  | 'trash'
  | 'triangle-exclamation'
  | 'upload'
  | 'user-plus'
  | 'users'
  | 'user-xmark'
  | 'video'
  | 'wand-magic-sparkles'
  | 'xmark'
  | 'bell'
  | 'calendar'
  | 'clock'
  | 'envelope'

const SOLID: Record<IconName, IconDefinition> = {
  award: faAward,
  'arrow-left': faArrowLeft,
  'arrow-right-from-bracket': faArrowRightFromBracket,
  ban: faBan,
  bars: faBars,
  bolt: faBolt,
  'calendar-days': faCalendarDays,
  'calendar-plus': faCalendarPlus,
  camera: faCamera,
  'chart-simple': faChartSimple,
  check: faCheck,
  'chevron-down': faChevronDown,
  'circle-check': faCircleCheck,
  'circle-exclamation': faCircleExclamation,
  'circle-info': faCircleInfo,
  'clipboard-check': faClipboardCheck,
  download: faDownload,
  dumbbell: faDumbbell,
  'ellipsis-vertical': faEllipsisVertical,
  eye: faEye,
  'file-circle-check': faFileCircleCheck,
  'file-circle-question': faFileCircleQuestion,
  'file-pdf': faFilePdf,
  gauge: faGaugeHigh,
  'hand-fist': faHandFist,
  'layer-group': faLayerGroup,
  'list-check': faListCheck,
  lock: faLock,
  'location-dot': faLocationDot,
  'magnifying-glass': faMagnifyingGlass,
  moon: faMoon,
  music: faMusic,
  'paper-plane': faPaperPlane,
  pen: faPen,
  'person-running': faPersonRunning,
  plus: faPlus,
  qrcode: faQrcode,
  rotate: faRotate,
  spa: faSpa,
  stop: faStop,
  sun: faSun,
  trash: faTrash,
  'triangle-exclamation': faTriangleExclamation,
  upload: faUpload,
  'user-plus': faUserPlus,
  users: faUsers,
  'user-xmark': faUserXmark,
  video: faVideo,
  'wand-magic-sparkles': faWandMagicSparkles,
  xmark: faXmark,
  bell: faBell,
  calendar: faCalendar,
  clock: faClock,
  envelope: faEnvelope,
}

interface IconProps {
  name: IconName
  className?: string
  style?: React.CSSProperties
  size?: string | number
}

export function Icon({ name, className, style, size }: IconProps) {
  return (
    <FontAwesomeIcon
      icon={SOLID[name]}
      className={className}
      style={{ width: size, height: size, fontSize: size, ...style }}
      aria-hidden="true"
    />
  )
}
