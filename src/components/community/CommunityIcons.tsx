// Line icons for profiles and the social feed (24×24, currentColor, 1.8 stroke).
import { sized } from '@/shared/media/image'

const PATHS: Record<string, string> = {
  heart: 'M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.6l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z',
  heartFill: 'M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.6l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z',
  comment: 'M20 15.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 3.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  users: 'M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.1a3.5 3.5 0 0 1 0 6.8',
  pin: 'M9 4h6l-1 6 3 3H7l3-3ZM12 13v7',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4Z',
  verified: 'M12 2.8l2.1 1.6 2.6-.2.9 2.5 2.3 1.2-.4 2.6 1.3 2.3-1.8 1.9.1 2.6-2.5.7-1.4 2.2-2.5-.7-2.4 1.1-1.9-1.8-2.6-.1-.7-2.5-2.2-1.4.7-2.5-1.1-2.4 1.8-1.9.1-2.6 2.5-.7L9.9 4.4Z',
  check: 'M5 12.5 10 17 19 7.5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  mapPin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  message: 'M4 5h16v11H8l-4 4Z',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  x: 'M6 6l12 12M18 6 6 18',
  gamepad: 'M7 9v4M5 11h4M15.5 10h.01M18 12h.01M7.5 6h9A4.5 4.5 0 0 1 21 10.5v3.8a3.2 3.2 0 0 1-5.8 1.9L14 15h-4l-1.2 1.2A3.2 3.2 0 0 1 3 14.3v-3.8A4.5 4.5 0 0 1 7.5 6Z',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bookmark: 'M6 3h12v18l-6-4-6 4Z',
  forum: 'M4 5h12v9H8l-4 3ZM8 17h8l4 3V10h-2',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  hash: 'M5 9h14M5 15h14M10 3 8 21M16 3l-2 18',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M15 18 9 12l6-6',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  telegram: 'M21 4 3 11l6 2.3M21 4l-3 16-7-5.5M21 4 9 13.3v5.2l2.9-3.9',
  instagram: 'M4 4h16v16H4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17.5 6.5h.01',
  xlogo: 'M4 4l16 16M20 4 4 20',
  youtube: 'M3 8.5A3.5 3.5 0 0 1 6.5 5h11A3.5 3.5 0 0 1 21 8.5v7a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 15.5ZM10 9v6l5-3Z',
  aparat: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM10 8.5v7l6-3.5Z',
  github: 'M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.3c3-.3 6-1.4 6-6.5a5 5 0 0 0-1.4-3.5 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.1 1.4 5 1.7 5 1.7a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.5 8.7c0 5.1 3 6.2 6 6.5a3 3 0 0 0-.9 2.3V21',
  linkedin: 'M4 9h4v11H4zM6 6.5h.01M11 20v-6a3 3 0 0 1 6 0v6M11 9v11',
  twitch: 'M5 3h15v11l-4 4h-4l-3 3v-3H5ZM11 7v4M15 7v4',
  steam: 'M12 21a9 9 0 1 0-8.8-10.9l5.1 2.1A3 3 0 0 1 12 11l2.6-3.8a4 4 0 1 1 1.4 4.8L12 14.7a3 3 0 0 1-5.9.9l-2.8-1.2A9 9 0 0 0 12 21Z',
}

export function CmIcon({ name, size = 18, filled = false, className = '' }: { name: keyof typeof PATHS | string; size?: number; filled?: boolean; className?: string }) {
  const d = PATHS[name] || PATHS.more
  return <svg className={`cm-ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}

export function Verified({ size = 16 }: { size?: number }) {
  return <span className="cm-verified" title="حساب تأییدشده" role="img" aria-label="حساب تأییدشده">
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS.verified} fill="currentColor" /><path d="M8.5 12.3 11 14.7l4.6-5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
}

type Person = { name: string; avatar: string; avatarColor: string }
export function Avatar({ person, size = 44, ring = false }: { person: Person; size?: number; ring?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (person.avatar) return <img className={`cm-avatar${ring ? ' has-ring' : ''}`} src={sized(person.avatar, size * 2)} alt="" width={size} height={size} style={style} loading="lazy" />
  return <span className={`cm-avatar${ring ? ' has-ring' : ''}`} style={{ ...style, background: person.avatarColor }} aria-hidden="true">{person.name.trim().slice(0, 1) || '؟'}</span>
}
