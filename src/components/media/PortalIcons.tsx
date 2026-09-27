import type { ReactNode } from 'react'

// Line icons shared by the section portals (software, games): platforms,
// categories and meta. Stroke icons follow currentColor.

export type IconName =
  | 'calendar' | 'folder' | 'eye' | 'download' | 'disk' | 'search' | 'windows' | 'apple' | 'linux' | 'android' | 'phone' | 'grid' | 'chevron'
  | 'gamepad' | 'joystick' | 'trophy' | 'arrow' | 'play' | 'clock'
  | 'apps' | 'refresh' | 'chat' | 'code' | 'palette' | 'film' | 'cube' | 'ruler' | 'shield' | 'globe' | 'music' | 'briefcase' | 'archive' | 'star' | 'info' | 'key' | 'tag' | 'sparkle' | 'wrench'
const PATHS: Record<IconName, ReactNode> = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  disk: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v6h10V3M8 21v-6h8v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  windows: <path d="M3 5.5 10.5 4.5v7H3zM12 4.3 21 3v8.5h-9zM3 12.5h7.5v7L3 18.5zM12 12.5h9V21l-9-1.3z" />,
  apple: <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C6.9 7.4 5.4 8.3 4.6 9.8c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.7-1-2.7-4.2zM14.3 5.8c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />,
  linux: <><path d="M12 3c-2 0-3 1.8-3 4 0 1.5-.5 2.5-1.5 4S5 14.5 5 16.5 7 20 9 20h6c2 0 4-1.5 4-3.5s-1.5-4-2.5-5.5S15 8.5 15 7c0-2.2-1-4-3-4z" /><circle cx="10.5" cy="8" r=".6" /><circle cx="13.5" cy="8" r=".6" /></>,
  android: <><path d="M5 10h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 9a7 7 0 0 1 14 0z" /><path d="m7.5 3.5 1.5 2.5M16.5 3.5 15 6" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  gamepad: <><path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4.3a2.5 2.5 0 0 1-4.2 1.2L14.5 16h-5l-2.2 2.4a2.5 2.5 0 0 1-4.2-1.2l-1-4.3A4 4 0 0 1 6 8z" /><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" /></>,
  joystick: <><circle cx="12" cy="6" r="3" /><path d="M12 9v6M5 15h14l1 5H4z" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 3M16 6h4a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6" /></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
  play: <path d="M7 4v16l13-8z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  apps: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  code: <><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="8" r="1" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  cube: <><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  ruler: <><path d="m3 17 14-14 4 4L7 21z" /><path d="m7 9 2 2M10 6l2 2M13 12l2 2M6 15l2 2" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 0-5-5z" />,
}
const FILLED = new Set<IconName>(['windows', 'apple', 'play'])

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sp-ico">{PATHS[name]}</svg>
}

/** Platform or category name → icon (by common words; falls back to a folder). */
export function platformIcon(name: string): IconName {
  const n = name.toLowerCase()
  if (/win|ویندوز/.test(n)) return 'windows'
  if (/mac|os x|مک/.test(n)) return 'apple'
  if (/linux|لینوکس/.test(n)) return 'linux'
  if (/android|اندروید/.test(n)) return 'android'
  if (/ios|iphone|ipad|آیفون|موبایل/.test(n)) return 'phone'
  if (/playstation|ps\d|xbox|nintendo|switch|pc\b|کنسول/.test(n)) return 'gamepad'
  if (/retro|arcade|قدیمی|آرکید/.test(n)) return 'joystick'
  if (/برنامه‌?نویس|توسعه|code|dev|شبکه/.test(n)) return 'code'
  if (/گرافیک|طراحی|عکس|تصویر|photo|design/.test(n)) return 'palette'
  if (/ویدیو|ویدئو|تدوین|فیلم|video|چندرسانه/.test(n)) return 'film'
  if (/سه‌?بعدی|3d|cgi/.test(n)) return 'cube'
  if (/مهندس|نقشه|cad/.test(n)) return 'ruler'
  if (/امنیت|آنتی|ویروس|security/.test(n)) return 'shield'
  if (/اینترنت|مرورگر|پیام|browser/.test(n)) return 'globe'
  if (/صوت|صوتی|موزیک|audio|music/.test(n)) return 'music'
  if (/اداری|office/.test(n)) return 'briefcase'
  if (/فشرده|zip|archive/.test(n)) return 'archive'
  if (/ابزار|سیستم|utility|tool/.test(n)) return 'wrench'
  return 'folder'
}

