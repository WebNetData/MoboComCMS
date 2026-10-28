import { useId, type ReactNode } from 'react'

// Flags for the language menu, drawn as small SVGs (3:2) in the countries' own colours: emoji flags do not show on
// Windows. A language spoken across borders or whose flag is disputed (Kurdish, Pashto, Tajik…) shows its code in a
// language badge instead of a country's flag.

const W = 30, H = 20

/** A five-pointed star centred on (cx, cy), outer radius r, first point at `turn` degrees (0 = up). */
function star(cx: number, cy: number, r: number, turn = 0) {
  const points: string[] = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? r * 0.382 : r
    const angle = ((turn + i * 36) * Math.PI) / 180
    points.push(`${(cx + radius * Math.sin(angle)).toFixed(2)},${(cy - radius * Math.cos(angle)).toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}
const rows = (colours: string[]) => colours.map((fill, i) => <rect key={i} y={(H / colours.length) * i} width={W} height={H / colours.length} fill={fill} />)
const columns = (colours: string[]) => colours.map((fill, i) => <rect key={i} x={(W / colours.length) * i} width={W / colours.length} height={H} fill={fill} />)

function UnionJack({ id }: { id: string }) {
  return <>
    <clipPath id={`${id}-t`}><path d="M15 10h15v10zv10H0zH0V0zV0h15z" /></clipPath>
    <rect width={W} height={H} fill="#012169" />
    <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
    <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="2.4" clipPath={`url(#${id}-t)`} />
    <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
    <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.6" />
  </>
}

const FLAGS: Record<string, (id: string) => ReactNode> = {
  // Persian: Iran — green, white, red, the emblem in the middle and the bands' edges marked
  fa: () => <>{rows(['#239f40', '#fff', '#da0000'])}<path d="M15 7.4c-.9.8-1.4 1.6-1.4 2.6 0 1 .6 1.9 1.4 2.4.8-.5 1.4-1.4 1.4-2.4 0-1-.5-1.8-1.4-2.6Zm-2.2 1c-.6.5-.9 1.1-.9 1.7 0 1.1.9 2 2.2 2.3m3.1-4c.6.5.9 1.1.9 1.7 0 1.1-.9 2-2.2 2.3" fill="none" stroke="#da0000" strokeWidth=".7" strokeLinecap="round" /><path d="M0 6.4h30M0 13.6h30" stroke="#fff" strokeWidth=".5" strokeDasharray="1 .8" opacity=".9" /></>,
  en: (id) => <UnionJack id={id} />,
  // Arabic: a green field with the white script and sword, drawn as strokes
  ar: () => <><rect width={W} height={H} fill="#006c35" /><path d="M8 8.2c1-.8 2 .8 3 0s2 .8 3 0 2 .8 3 0 2 .8 3 0 1.4.4 2 .2" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" /><path d="M8.5 13h12.5l1.5-.7" fill="none" stroke="#fff" strokeWidth=".9" strokeLinecap="round" /></>,
  tr: () => <><rect width={W} height={H} fill="#e30a17" /><circle cx="11.3" cy="10" r="5" fill="#fff" /><circle cx="12.6" cy="10" r="4" fill="#e30a17" /><path d={star(17.6, 10, 2.2, -90)} fill="#fff" /></>,
  de: () => rows(['#000', '#dd0000', '#ffce00']),
  fr: () => columns(['#0055a4', '#fff', '#ef4135']),
  ru: () => rows(['#fff', '#0039a6', '#d52b1e']),
  es: () => <><rect width={W} height={H} fill="#aa151b" /><rect y="5" width={W} height="10" fill="#f1bf00" /></>,
  it: () => columns(['#009246', '#fff', '#ce2b37']),
  'zh-CN': () => <><rect width={W} height={H} fill="#de2910" /><path d={star(5, 5, 3)} fill="#ffde00" /><path d={star(10, 2, 1, 23)} fill="#ffde00" /><path d={star(12, 4, 1, 46)} fill="#ffde00" /><path d={star(12, 7, 1, 70)} fill="#ffde00" /><path d={star(10, 9, 1, 21)} fill="#ffde00" /></>,
  hi: () => <>{rows(['#ff9933', '#fff', '#138808'])}<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth=".6" /><circle cx="15" cy="10" r=".6" fill="#000080" /></>,
  ur: () => <><rect width={W} height={H} fill="#01411c" /><rect width="7.5" height={H} fill="#fff" /><circle cx="19" cy="10" r="5" fill="#fff" /><circle cx="20.4" cy="8.7" r="4.4" fill="#01411c" /><path d={star(22.3, 7.4, 1.6, 45)} fill="#fff" /></>,
  az: () => <>{rows(['#00b5e2', '#ef3340', '#509e2f'])}<circle cx="14" cy="10" r="2.6" fill="#fff" /><circle cx="14.7" cy="10" r="2.1" fill="#ef3340" /><path d={star(17.2, 10, 1.2, 90)} fill="#fff" /></>,
  ja: () => <><rect width={W} height={H} fill="#fff" /><circle cx="15" cy="10" r="6" fill="#bc002d" /></>,
  ko: () => <><rect width={W} height={H} fill="#fff" /><path d="M15 5a5 5 0 0 1 0 10a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 0 0-5Z" fill="#cd2e3a" transform="rotate(-56 15 10)" /><path d="M15 15a5 5 0 0 1 0-10a2.5 2.5 0 0 1 0 5a2.5 2.5 0 0 0 0 5Z" fill="#0047a0" transform="rotate(-56 15 10)" /><path d="M5 4.2l2.8-2.2M5.9 5.3l2.8-2.2M6.8 6.4l2.8-2.2M20.4 16l2.8-2.2M21.3 17.1l2.8-2.2M22.2 18.2l2.8-2.2M5 15.8l2.8 2.2M20.4 4l2.8 2.2" stroke="#000" strokeWidth=".8" /></>,
  pt: () => <><rect width={W} height={H} fill="#da291c" /><rect width="12" height={H} fill="#046a38" /><circle cx="12" cy="10" r="3.4" fill="#ffe900" /><circle cx="12" cy="10" r="2" fill="#da291c" /></>,
  nl: () => rows(['#ae1c28', '#fff', '#21468b']),
}

/** Native name of each language the widget offers (the menu's main label). */
export const NATIVE_NAMES: Record<string, string> = {
  fa: 'فارسی', en: 'English', ar: 'العربية', tr: 'Türkçe', de: 'Deutsch', fr: 'Français', ru: 'Русский', es: 'Español', it: 'Italiano',
  'zh-CN': '中文', hi: 'हिन्दी', ur: 'اردو', az: 'Azərbaycan', ja: '日本語', ko: '한국어', pt: 'Português', nl: 'Nederlands', ku: 'Kurdî', ps: 'پښتو', tg: 'Тоҷикӣ',
}
/** The same names in Persian, under the native one. */
export const PERSIAN_NAMES: Record<string, string> = {
  fa: 'زبان اصلی سایت', en: 'انگلیسی', ar: 'عربی', tr: 'ترکی استانبولی', de: 'آلمانی', fr: 'فرانسوی', ru: 'روسی', es: 'اسپانیایی', it: 'ایتالیایی',
  'zh-CN': 'چینی', hi: 'هندی', ur: 'اردو', az: 'ترکی آذربایجانی', ja: 'ژاپنی', ko: 'کره‌ای', pt: 'پرتغالی', nl: 'هلندی', ku: 'کردی', ps: 'پشتو', tg: 'تاجیکی',
}

/** A language's flag, or its code in a badge where a flag would not fit it. Decorative: the name beside it says which. */
export function LanguageFlag({ code, className }: { code: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const draw = FLAGS[code]
  if (!draw) return <span className={`${className || ''} mc-flag-badge`} aria-hidden="true">{code.split('-')[0].slice(0, 2).toUpperCase()}</span>
  return <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">{draw(`f${id}`)}</svg>
}
