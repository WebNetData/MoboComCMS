// Advanced style of a builder element (a block or a section): spacing per side, typography, background and
// gradient, border and corners, shadow, opacity, hover, entrance motion, phone overrides, CSS classes.
// Everything is a bounded number, a choice from a list or a hex colour, so the CSS written from it can hold
// nothing a writer typed: no free-form CSS reaches the page from here.

export type Box = { t: number; r: number; b: number; l: number }

export const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const
export const SHADOWS = ['sm', 'md', 'lg', 'xl', 'glow'] as const
export const HOVERS = ['lift', 'zoom', 'glow', 'dim'] as const
export const MOTIONS = ['fade', 'up', 'down', 'start', 'end', 'zoom'] as const
export const MOBILE_ALIGNS = ['start', 'center', 'end'] as const
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const

export type AdvancedStyle = {
  /** Outside and inside spacing in px (margins may be negative to overlap), and their phone values. */
  margin?: Box; padding?: Box; marginM?: Box; paddingM?: Box
  /** Typography: size in px (and on a phone), weight, line height ×100, letter spacing in tenths of a px. */
  fontSize?: number; fontSizeM?: number; fontWeight?: typeof FONT_WEIGHTS[number]; lineHeight?: number; letterSpacing?: number
  /** Background colour; with a second colour it becomes a gradient at `bgAngle` degrees. */
  bg?: string; bg2?: string; bgAngle?: number
  borderWidth?: number; borderStyle?: typeof BORDER_STYLES[number]; borderColor?: string
  /** Corner radii in px: t = top-start, r = top-end, b = bottom-end, l = bottom-start. */
  radius?: Box
  shadow?: typeof SHADOWS[number]
  /** 0–99; absent means fully opaque. */
  opacity?: number
  hover?: typeof HOVERS[number]
  motion?: typeof MOTIONS[number]
  zIndex?: number
  minHeight?: number; maxWidth?: number
  alignM?: typeof MOBILE_ALIGNS[number]
  /** Extra class names for the theme's own CSS (letters, digits, dash, underscore). */
  classes?: string[]
}

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const int = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null
}
/** A size: zero, a negative or an empty value means "not set" — it is not pulled up to the smallest allowed size. */
const size = (value: unknown, min: number, max: number): number | null => { const n = int(value, 0, max); return n ? Math.max(min, n) : null }
const pick = <T extends readonly (string | number)[]>(value: unknown, list: T): T[number] | null => (list.includes(value as never) ? value as T[number] : null)
const hex = (value: unknown): string | null => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null)

function box(value: unknown, min: number, max: number): Box | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const out = { t: int(raw.t, min, max) ?? 0, r: int(raw.r, min, max) ?? 0, b: int(raw.b, min, max) ?? 0, l: int(raw.l, min, max) ?? 0 }
  return out.t || out.r || out.b || out.l ? out : null
}

/** What may be stored: unknown keys, out-of-range numbers and anything that is not a hex colour are dropped. An element with nothing set stores nothing. */
export function validateAdvancedStyle(input: unknown): AdvancedStyle | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>, out: AdvancedStyle = {}
  const set = <K extends keyof AdvancedStyle>(key: K, value: AdvancedStyle[K] | null, skip?: AdvancedStyle[K]) => { if (value !== null && value !== undefined && value !== skip) out[key] = value }
  set('margin', box(raw.margin, -300, 400)); set('padding', box(raw.padding, 0, 400))
  set('marginM', box(raw.marginM, -300, 400)); set('paddingM', box(raw.paddingM, 0, 400))
  set('fontSize', size(raw.fontSize, 8, 200)); set('fontSizeM', size(raw.fontSizeM, 8, 200))
  set('fontWeight', pick(typeof raw.fontWeight === 'string' ? Number(raw.fontWeight) : raw.fontWeight, FONT_WEIGHTS))
  set('lineHeight', int(raw.lineHeight, 80, 400)); set('letterSpacing', int(raw.letterSpacing, -50, 200), 0)
  set('bg', hex(raw.bg)); if (out.bg) { set('bg2', hex(raw.bg2)); if (out.bg2) set('bgAngle', int(raw.bgAngle, 0, 360) ?? 135) }
  const width = int(raw.borderWidth, 0, 20)
  if (width) { out.borderWidth = width; out.borderStyle = pick(raw.borderStyle, BORDER_STYLES) ?? 'solid'; out.borderColor = hex(raw.borderColor) ?? '#888888' }
  set('radius', box(raw.radius, 0, 300))
  set('shadow', pick(raw.shadow, SHADOWS)); set('hover', pick(raw.hover, HOVERS)); set('motion', pick(raw.motion, MOTIONS))
  const opacity = int(raw.opacity, 0, 100); if (opacity !== null && opacity < 100) out.opacity = opacity
  set('zIndex', int(raw.zIndex, -1, 100), 0); set('minHeight', size(raw.minHeight, 40, 1600)); set('maxWidth', size(raw.maxWidth, 120, 2400))
  set('alignM', pick(raw.alignM, MOBILE_ALIGNS))
  const classes = (Array.isArray(raw.classes) ? raw.classes : typeof raw.classes === 'string' ? raw.classes.split(/\s+/) : []).filter((name): name is string => typeof name === 'string' && /^[a-zA-Z][\w-]{0,40}$/.test(name) && !/^br-/.test(name)).slice(0, 6)
  if (classes.length) out.classes = [...new Set(classes)]
  return Object.keys(out).length ? out : undefined
}

const SHADOW_CSS: Record<typeof SHADOWS[number], string> = {
  sm: '0 1px 3px rgb(0 0 0 / .12)', md: '0 8px 24px rgb(0 0 0 / .14)', lg: '0 18px 48px rgb(0 0 0 / .18)', xl: '0 32px 80px rgb(0 0 0 / .24)',
  glow: '0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent), 0 14px 44px color-mix(in srgb, var(--primary) 35%, transparent)',
}
const HOVER_CSS: Record<typeof HOVERS[number], string> = {
  lift: 'transform: translateY(-6px); box-shadow: 0 18px 44px rgb(0 0 0 / .2)', zoom: 'transform: scale(1.03)',
  glow: 'box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent), 0 16px 48px color-mix(in srgb, var(--primary) 40%, transparent)', dim: 'filter: brightness(.88)',
}
const sides = (prop: string, b: Box) => `${prop}-block: ${b.t}px ${b.b}px; ${prop}-inline: ${b.r}px ${b.l}px;`
const TEXT = ':is(h1, h2, h3, h4, h5, h6, p, li, blockquote)'

/** The id an element's rules hang on. Only ids of the document's own shape are styled. */
export const styleClass = (id: string) => (/^[a-zA-Z0-9_-]{1,64}$/.test(id) ? `br-x-${id}` : '')

/**
 * The CSS of one element. Spacing and corners use logical properties, so "start" follows the page's direction.
 * Phone values apply under 768px. Hover only where there is a pointer that hovers; motion only where the reader
 * has not asked for less of it and the browser can tie an animation to scrolling — elsewhere the element is
 * simply there.
 */
export function advancedCss(id: string, adv: AdvancedStyle | undefined): string {
  const name = styleClass(id)
  if (!adv || !name) return ''
  const sel = `.${name}`, base: string[] = [], text: string[] = [], phone: string[] = [], phoneText: string[] = []
  if (adv.margin) base.push(sides('margin', adv.margin))
  if (adv.padding) base.push(sides('padding', adv.padding))
  if (adv.bg) base.push(adv.bg2 ? `background: linear-gradient(${adv.bgAngle ?? 135}deg, ${adv.bg}, ${adv.bg2});` : `background: ${adv.bg};`)
  if (adv.borderWidth) base.push(`border: ${adv.borderWidth}px ${adv.borderStyle} ${adv.borderColor};`)
  if (adv.radius) base.push(`border-start-start-radius: ${adv.radius.t}px; border-start-end-radius: ${adv.radius.r}px; border-end-end-radius: ${adv.radius.b}px; border-end-start-radius: ${adv.radius.l}px; overflow: clip;`)
  if (adv.shadow) base.push(`box-shadow: ${SHADOW_CSS[adv.shadow]};`)
  if (adv.opacity !== undefined) base.push(`opacity: ${adv.opacity / 100};`)
  if (adv.zIndex) base.push(`position: relative; z-index: ${adv.zIndex};`)
  if (adv.minHeight) base.push(`min-height: ${adv.minHeight}px;`)
  if (adv.maxWidth) base.push(`max-width: ${adv.maxWidth}px; margin-inline: auto;`)
  if (adv.fontSize) text.push(`font-size: ${adv.fontSize}px;`)
  if (adv.fontWeight) text.push(`font-weight: ${adv.fontWeight};`)
  if (adv.lineHeight) text.push(`line-height: ${adv.lineHeight / 100};`)
  if (adv.letterSpacing) text.push(`letter-spacing: ${adv.letterSpacing / 10}px;`)
  if (adv.marginM) phone.push(sides('margin', adv.marginM))
  if (adv.paddingM) phone.push(sides('padding', adv.paddingM))
  if (adv.alignM) phone.push(`text-align: ${adv.alignM};`)
  if (adv.fontSizeM) phoneText.push(`font-size: ${adv.fontSizeM}px;`)
  const out: string[] = []
  if (base.length) out.push(`${sel} { ${base.join(' ')} }`)
  if (text.length) out.push(`${sel}, ${sel} ${TEXT} { ${text.join(' ')} }`)
  if (phone.length || phoneText.length) out.push(`@media (max-width: 767px) { ${phone.length ? `${sel} { ${phone.join(' ')} } ` : ''}${phoneText.length ? `${sel}, ${sel} ${TEXT} { ${phoneText.join(' ')} }` : ''} }`)
  if (adv.hover) out.push(`@media (hover: hover) { ${sel} { transition: transform .25s ease, box-shadow .25s ease, filter .25s ease; } ${sel}:hover { ${HOVER_CSS[adv.hover]}; } } @media (prefers-reduced-motion: reduce) { ${sel}, ${sel}:hover { transition: none; transform: none; } }`)
  if (adv.motion) out.push(`@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { ${sel} { animation: br-in-${adv.motion} linear both; animation-timeline: view(); animation-range: entry 0% entry 45%; } } }`)
  return out.join('\n')
}

/** Whether anything is set (the inspector shows a dot on the tab). */
export const hasAdvancedStyle = (adv: AdvancedStyle | undefined) => !!adv && Object.keys(adv).length > 0
