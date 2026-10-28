// How a magazine article's page looks (owner, 2026-10-28). Pure.
//
// A style dresses the article's own page (header, cover, reading column) and keeps everything it does: progress,
// contents, the post's format, author, related posts and comments. The six designed styles are `ps-<base>`; the
// owner's own styles (`psc-…`) start from one of them and change its accent, alignment, reading width, opening
// paragraph and corners. (No drop cap: a cut-off first letter breaks Persian joining, so the opening paragraph leads.) A post may instead take a full builder layout; the same choice lists both (one stored id).

export const POST_STYLE_BASES = {
  classic: { fa: 'کلاسیک موبوکام', en: 'MoboCom classic', descFa: 'جلد پشت تیتر در قابی گرد؛ چیدمان همیشگی مجله.', descEn: 'The cover behind the title in a rounded frame; the magazine’s usual page.' },
  immersive: { fa: 'جلد تمام‌صفحه', en: 'Full-bleed cover', descFa: 'تصویر تا لبه‌های صفحه، تیتر بزرگ روی آن؛ برای گزارش‌های تصویری.', descEn: 'The picture edge to edge with a large title on it; for picture-led stories.' },
  split: { fa: 'دوستونه', en: 'Split', descFa: 'تیتر و خلاصه در یک سو، جلد بزرگ در سوی دیگر؛ تمیز و روشن.', descEn: 'Title and lead on one side, a large cover on the other; clean and bright.' },
  editorial: { fa: 'سردبیری', en: 'Editorial', descFa: 'تیتر میانه با حروف درشت، جلد عریض زیر آن، ستون باریک و پاراگراف آغازین برجسته.', descEn: 'A centred large title, a wide cover below, a narrow column and a leading first paragraph.' },
  cinematic: { fa: 'سینمایی', en: 'Cinematic', descFa: 'نوار تیره با جلد محو در پس‌زمینه و پوستر کنار تیتر؛ برای نقد فیلم، بازی و موسیقی.', descEn: 'A dark band with the cover blurred behind and a poster beside the title; for reviews.' },
  spotlight: { fa: 'ویژه‌نامه', en: 'Spotlight', descFa: 'کارت رنگی با تیتر بسیار درشت و جلدی که روی آن می‌نشیند؛ برای ویژه‌نامه و کمپین.', descEn: 'A colour card with a very large title and the cover resting on it; for features.' },
} as const
export type PostStyleBase = keyof typeof POST_STYLE_BASES
export const POST_STYLE_BASE_KEYS = Object.keys(POST_STYLE_BASES) as PostStyleBase[]

export const POST_STYLE_ALIGN = ['start', 'center'] as const
export const POST_STYLE_WIDTH = ['narrow', 'standard', 'wide'] as const
export const POST_STYLE_CORNERS = ['round', 'soft', 'sharp'] as const
export type PostStyleAlign = typeof POST_STYLE_ALIGN[number]
export type PostStyleWidth = typeof POST_STYLE_WIDTH[number]
export type PostStyleCorners = typeof POST_STYLE_CORNERS[number]

/** The owner's own style: a designed base with their choices. `accent` is '' (the site's) or #rrggbb. */
export type CustomPostStyle = {
  id: string
  name: string
  base: PostStyleBase
  accent: string
  align: PostStyleAlign
  width: PostStyleWidth
  leadIn: boolean
  corners: PostStyleCorners
}

export type PostStyleSettings = {
  /** The style of every article that has no choice of its own or of its format; '' = classic. A style id only. */
  defaultId: string
  /** Format code (the owner's POST_FORMAT list) → a style or builder layout id for articles of that format. */
  byFormat: Record<string, string>
  custom: CustomPostStyle[]
}

export const DEFAULT_POST_STYLE_SETTINGS: PostStyleSettings = { defaultId: '', byFormat: {}, custom: [] }
export const MAX_CUSTOM_POST_STYLES = 24

/** Same alphabet as the builder's layout ids, so one stored choice holds either. */
export const LAYOUT_CHOICE_ID = /^[a-zA-Z0-9_-]{1,64}$/
const CUSTOM_ID = /^psc-[a-z0-9]{4,24}$/
const HEX = /^#[0-9a-f]{6}$/
const FORMAT_CODE = /^[A-Za-z0-9_-]{1,40}$/

export const builtinStyleId = (base: PostStyleBase) => `ps-${base}`
export const isStyleId = (id: string) => id.startsWith('ps-') || id.startsWith('psc-')
export const newCustomStyleId = (random = Math.random) => `psc-${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? value as T : fallback)

export function normalizeCustomStyle(input: unknown): CustomPostStyle | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = String(raw.id || '')
  if (!CUSTOM_ID.test(id)) return null
  const accent = String(raw.accent || '').trim().toLowerCase()
  return {
    id,
    name: String(raw.name || '').trim().slice(0, 60) || 'استایل من',
    base: pick(raw.base, POST_STYLE_BASE_KEYS, 'classic'),
    accent: HEX.test(accent) ? accent : '',
    align: pick(raw.align, POST_STYLE_ALIGN, 'start'),
    width: pick(raw.width, POST_STYLE_WIDTH, 'wide'),
    leadIn: raw.leadIn === true,
    corners: pick(raw.corners, POST_STYLE_CORNERS, 'round'),
  }
}

export function normalizePostStyleSettings(input: unknown): PostStyleSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const seen = new Set<string>()
  const custom = (Array.isArray(raw.custom) ? raw.custom : []).map(normalizeCustomStyle)
    .filter((style): style is CustomPostStyle => !!style && !seen.has(style.id) && !!seen.add(style.id))
    .slice(0, MAX_CUSTOM_POST_STYLES)
  const known = (id: string) => (id.startsWith('ps-') ? POST_STYLE_BASE_KEYS.includes(id.slice(3) as PostStyleBase) : custom.some((style) => style.id === id))
  const defaultId = String(raw.defaultId || '')
  const byFormat: Record<string, string> = {}
  const formats = raw.byFormat && typeof raw.byFormat === 'object' ? raw.byFormat as Record<string, unknown> : {}
  for (const [code, value] of Object.entries(formats).slice(0, 60)) {
    const id = String(value || '')
    // A builder layout is checked where it is used (it may be deleted later); a style must exist now.
    if (FORMAT_CODE.test(code) && LAYOUT_CHOICE_ID.test(id) && (!isStyleId(id) || known(id))) byFormat[code] = id
  }
  return { defaultId: isStyleId(defaultId) && known(defaultId) ? defaultId : '', byFormat, custom }
}

/** Everything the page needs to dress an article. */
export type ResolvedPostStyle = {
  id: string
  base: PostStyleBase
  align: PostStyleAlign
  width: PostStyleWidth
  leadIn: boolean
  corners: PostStyleCorners
  /** The accent as text and lines on a light page and on a dark one (both readable), or '' for the site's. */
  accentLight: string
  accentDark: string
  /** Words on a fill of the accent. */
  onAccent: string
}

const BASE_DEFAULTS: Record<PostStyleBase, Pick<ResolvedPostStyle, 'align' | 'width' | 'leadIn' | 'corners'>> = {
  classic: { align: 'start', width: 'wide', leadIn: false, corners: 'round' },
  immersive: { align: 'start', width: 'wide', leadIn: false, corners: 'round' },
  split: { align: 'start', width: 'wide', leadIn: false, corners: 'round' },
  editorial: { align: 'center', width: 'narrow', leadIn: true, corners: 'soft' },
  cinematic: { align: 'start', width: 'wide', leadIn: false, corners: 'soft' },
  spotlight: { align: 'start', width: 'wide', leadIn: false, corners: 'round' },
}

/** A style id (built-in or the owner's) as the page applies it; null for anything else (a layout, or gone). */
export function resolvePostStyle(id: string, settings: PostStyleSettings): ResolvedPostStyle | null {
  if (id.startsWith('ps-')) {
    const base = id.slice(3) as PostStyleBase
    if (!POST_STYLE_BASE_KEYS.includes(base)) return null
    return { id, base, ...BASE_DEFAULTS[base], accentLight: '', accentDark: '', onAccent: '' }
  }
  const custom = settings.custom.find((style) => style.id === id)
  if (!custom) return null
  const accent = custom.accent ? readableAccent(custom.accent) : null
  return {
    id, base: custom.base, align: custom.align, width: custom.width, leadIn: custom.leadIn, corners: custom.corners,
    accentLight: accent?.light || '', accentDark: accent?.dark || '', onAccent: accent?.on || '',
  }
}

// ------------------------------------------------------------------ a readable accent from any colour

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toRgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const toHex = (rgb: number[]) => `#${rgb.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`
export const luminance = (hex: string) => { const [r, g, b] = toRgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const mix = (hex: string, toward: string, share: number) => { const a = toRgb(hex), b = toRgb(toward); return toHex(a.map((value, i) => value + (b[i] - value) * share)) }

/** The page surfaces the accent is read against in each theme (the journal's card and page colours). */
export const LIGHT_SURFACE = '#ffffff'
export const DARK_SURFACE = '#11162a'

/**
 * The owner's colour, darkened for a light page and lightened for a dark one only as far as needed for 4.5:1, and
 * the ink for words on a fill of it. Any colour they pick therefore stays readable in both themes.
 */
export function readableAccent(hex: string): { light: string; dark: string; on: string } | null {
  const colour = hex.toLowerCase()
  if (!HEX.test(colour)) return null
  const shift = (target: string, surface: string) => {
    for (let step = 0; step <= 20; step += 1) { const next = mix(colour, target, step / 20); if (contrast(next, surface) >= 4.5) return next }
    return target
  }
  const light = shift('#000000', LIGHT_SURFACE)
  return { light, dark: shift('#ffffff', DARK_SURFACE), on: contrast(light, '#ffffff') >= 4.5 ? '#ffffff' : '#0b1020' }
}

/** Data attributes and custom properties the article page puts on its main element. */
export function postStyleAttributes(style: ResolvedPostStyle | null): { attrs: Record<string, string>; vars: Record<string, string> } {
  if (!style || (style.base === 'classic' && style.id === 'ps-classic')) return { attrs: {}, vars: {} }
  const attrs: Record<string, string> = { 'data-post-style': style.base, 'data-ps-align': style.align, 'data-ps-width': style.width, 'data-ps-corners': style.corners }
  if (style.leadIn) attrs['data-ps-lead'] = ''
  const vars: Record<string, string> = {}
  if (style.accentLight) { vars['--ps-accent-light'] = style.accentLight; vars['--ps-accent-dark'] = style.accentDark; vars['--ps-on-accent'] = style.onAccent; attrs['data-ps-accent'] = '' }
  return { attrs, vars }
}
