// Advanced style of a builder element (a block or a section): spacing per side, typography, background and
// gradient, border and corners, shadow, opacity, hover, entrance motion, phone overrides, CSS classes.
// Everything is a bounded number, a choice from a list or a hex colour, so the CSS written from it can hold
// nothing a writer typed: no free-form CSS reaches the page from here.

export type Box = { t: number; r: number; b: number; l: number }

export const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const
export const SHADOWS = ['sm', 'md', 'lg', 'xl', 'glow'] as const
import { KIT_REF, colorValue } from './builder-kit'

export const HOVERS = ['lift', 'zoom', 'glow', 'dim', 'tilt', 'shine', 'ring', 'float', 'press', 'colorize'] as const
export const MOTIONS = ['fade', 'up', 'down', 'start', 'end', 'zoom', 'flip', 'blur', 'rotate', 'pop'] as const
/** Motion that keeps going while the element is on the page. It moves through translate, scale and rotate, so it adds to a hover or an entrance rather than replacing it. */
export const LOOPS = ['float', 'pulse', 'breathe', 'spin', 'wiggle', 'gradient'] as const
/** A surface drawn behind or round the element: frosted glass, a moving aurora, a mesh of soft lights, a fine grid, dots, or a beam that runs round the edge. */
export const SURFACES = ['glass', 'aurora', 'mesh', 'grid', 'dots', 'beam'] as const
/** What the element's headings wear. */
export const TEXT_EFFECTS = ['gradient', 'shimmer', 'glow', 'outline'] as const
export const MOBILE_ALIGNS = ['start', 'center', 'end'] as const
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const

export type AdvancedStyle = {
  /** Outside and inside spacing in px (margins may be negative to overlap), and their phone values. */
  margin?: Box; padding?: Box; marginM?: Box; paddingM?: Box
  /** Tablet values (768–1024px). */
  marginT?: Box; paddingT?: Box; fontSizeT?: number; alignT?: typeof MOBILE_ALIGNS[number]
  /** Typography: size in px (and on a phone), weight, line height ×100, letter spacing in tenths of a px. */
  fontSize?: number; fontSizeM?: number; fontWeight?: typeof FONT_WEIGHTS[number]; lineHeight?: number; letterSpacing?: number
  /** Background colour; with a second colour it becomes a gradient at `bgAngle` degrees. */
  bg?: string; bg2?: string; bgAngle?: number
  /** Text colour. Every colour here is a hex code or a kit colour (`kit:c1` … `kit:c8`). */
  color?: string
  borderWidth?: number; borderStyle?: typeof BORDER_STYLES[number]; borderColor?: string
  /** Corner radii in px: t = top-start, r = top-end, b = bottom-end, l = bottom-start. */
  radius?: Box
  shadow?: typeof SHADOWS[number]
  /** 0–99; absent means fully opaque. */
  opacity?: number
  hover?: typeof HOVERS[number]
  motion?: typeof MOTIONS[number]
  loop?: typeof LOOPS[number]
  surface?: typeof SURFACES[number]
  textFx?: typeof TEXT_EFFECTS[number]
  zIndex?: number
  minHeight?: number; maxWidth?: number
  /** Height in percent of the screen (10–100), for a block, column or section that fills the view. */
  minHeightVh?: number
  alignM?: typeof MOBILE_ALIGNS[number]
  /** Extra class names for the theme's own CSS (letters, digits, dash, underscore). */
  classes?: string[]
  /** The element's own CSS. `selector` stands for this element; declarations alone apply to it directly. */
  customCss?: string
}

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const int = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null
}
/** A size: zero, a negative or an empty value means "not set" — it is not pulled up to the smallest allowed size. */
const size = (value: unknown, min: number, max: number): number | null => { const n = int(value, 0, max); return n ? Math.max(min, n) : null }
const pick = <T extends readonly (string | number)[]>(value: unknown, list: T): T[number] | null => (list.includes(value as never) ? value as T[number] : null)
const hex = (value: unknown): string | null => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : typeof value === 'string' && KIT_REF.test(value) ? value : null)

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
  set('marginT', box(raw.marginT, -300, 400)); set('paddingT', box(raw.paddingT, 0, 400)); set('fontSizeT', size(raw.fontSizeT, 8, 200)); set('alignT', pick(raw.alignT, MOBILE_ALIGNS))
  set('fontSize', size(raw.fontSize, 8, 200)); set('fontSizeM', size(raw.fontSizeM, 8, 200))
  set('fontWeight', pick(typeof raw.fontWeight === 'string' ? Number(raw.fontWeight) : raw.fontWeight, FONT_WEIGHTS))
  set('lineHeight', int(raw.lineHeight, 80, 400)); set('letterSpacing', int(raw.letterSpacing, -50, 200), 0)
  set('color', hex(raw.color))
  set('bg', hex(raw.bg)); if (out.bg) { set('bg2', hex(raw.bg2)); if (out.bg2) set('bgAngle', int(raw.bgAngle, 0, 360) ?? 135) }
  const width = int(raw.borderWidth, 0, 20)
  if (width) { out.borderWidth = width; out.borderStyle = pick(raw.borderStyle, BORDER_STYLES) ?? 'solid'; out.borderColor = hex(raw.borderColor) ?? '#888888' }
  set('radius', box(raw.radius, 0, 300))
  set('shadow', pick(raw.shadow, SHADOWS)); set('hover', pick(raw.hover, HOVERS)); set('motion', pick(raw.motion, MOTIONS))
  set('loop', pick(raw.loop, LOOPS)); set('surface', pick(raw.surface, SURFACES)); set('textFx', pick(raw.textFx, TEXT_EFFECTS))
  const opacity = int(raw.opacity, 0, 100); if (opacity !== null && opacity < 100) out.opacity = opacity
  set('zIndex', int(raw.zIndex, -1, 100), 0); set('minHeight', size(raw.minHeight, 40, 1600)); set('minHeightVh', size(raw.minHeightVh, 10, 100)); set('maxWidth', size(raw.maxWidth, 120, 2400))
  set('alignM', pick(raw.alignM, MOBILE_ALIGNS))
  const classes = (Array.isArray(raw.classes) ? raw.classes : typeof raw.classes === 'string' ? raw.classes.split(/\s+/) : []).filter((name): name is string => typeof name === 'string' && /^[a-zA-Z][\w-]{0,40}$/.test(name) && !/^br-/.test(name)).slice(0, 6)
  if (classes.length) out.classes = [...new Set(classes)]
  const custom = cleanCustomCss(raw.customCss); if (custom) out.customCss = custom
  return Object.keys(out).length ? out : undefined
}

const SHADOW_CSS: Record<typeof SHADOWS[number], string> = {
  sm: '0 1px 3px rgb(0 0 0 / .12)', md: '0 8px 24px rgb(0 0 0 / .14)', lg: '0 18px 48px rgb(0 0 0 / .18)', xl: '0 32px 80px rgb(0 0 0 / .24)',
  glow: '0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent), 0 14px 44px color-mix(in srgb, var(--primary) 35%, transparent)',
}
const HOVER_CSS: Record<typeof HOVERS[number], string> = {
  lift: 'transform: translateY(-6px); box-shadow: 0 18px 44px rgb(0 0 0 / .2)', zoom: 'transform: scale(1.03)',
  glow: 'box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent), 0 16px 48px color-mix(in srgb, var(--primary) 40%, transparent)', dim: 'filter: brightness(.88)',
  tilt: 'transform: perspective(900px) rotateX(5deg) rotateY(-5deg) translateY(-4px); box-shadow: 0 26px 54px rgb(0 0 0 / .24)',
  shine: 'transform: translateY(-3px)',
  ring: 'box-shadow: 0 0 0 2px var(--primary), 0 0 0 7px color-mix(in srgb, var(--primary) 22%, transparent)',
  float: 'transform: translateY(-10px); box-shadow: 0 30px 60px -18px rgb(0 0 0 / .32)',
  press: 'transform: scale(.97)',
  colorize: 'filter: grayscale(0)',
}
const LOOP_TIMING: Record<typeof LOOPS[number], string> = {
  float: '6s ease-in-out infinite', pulse: '2.4s ease-in-out infinite', breathe: '3s ease-in-out infinite',
  spin: '14s linear infinite', wiggle: '3.5s ease-in-out infinite', gradient: '8s ease infinite',
}
const ACCENTS = 'var(--primary), #8b5cf6'
/** A layer behind the content, inside the element's own stacking context. */
const behind = (sel: string, body: string) => `${sel}::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit; ${body} }`
const sides = (prop: string, b: Box) => `${prop}-block: ${b.t}px ${b.b}px; ${prop}-inline: ${b.r}px ${b.l}px;`
const TEXT = ':is(h1, h2, h3, h4, h5, h6, p, li, blockquote)'

/** The id an element's rules hang on. Only ids of the document's own shape are styled. */
export const CUSTOM_CSS_MAX = 8000
/** Element CSS stays inside its own <style>: no tag can close it, and no import, script URL or legacy expression survives. */
export function cleanCustomCss(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/</g, '').replace(/@import[^;{]*;?/gi, '').replace(/expression\s*\(/gi, '').replace(/behavior\s*:/gi, '').replace(/(?:java|vb)script\s*:/gi, '').replace(/-moz-binding/gi, '').trim().slice(0, CUSTOM_CSS_MAX)
}
/** `selector` → this element; plain declarations are wrapped in its rule. Braces must balance or nothing is written. */
export function customCssFor(sel: string, css: string | undefined): string {
  const clean = cleanCustomCss(css)
  if (!clean) return ''
  let depth = 0
  for (const c of clean) { if (c === '{') depth++; else if (c === '}' && --depth < 0) return '' }
  if (depth) return ''
  return clean.includes('{') ? clean.replace(/\bselector\b/g, sel) : `${sel} { ${clean} }`
}
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
  const sel = `.${name}`, base: string[] = [], text: string[] = [], phone: string[] = [], phoneText: string[] = [], tablet: string[] = [], tabletText: string[] = []
  if (adv.margin) base.push(sides('margin', adv.margin))
  if (adv.padding) base.push(sides('padding', adv.padding))
  if (adv.bg) base.push(adv.bg2 ? `background: linear-gradient(${adv.bgAngle ?? 135}deg, ${colorValue(adv.bg)}, ${colorValue(adv.bg2)});` : `background: ${colorValue(adv.bg)};`)
  if (adv.borderWidth) base.push(`border: ${adv.borderWidth}px ${adv.borderStyle} ${colorValue(adv.borderColor || '#888888')};`)
  if (adv.color) text.push(`color: ${colorValue(adv.color)};`)
  if (adv.radius) base.push(`border-start-start-radius: ${adv.radius.t}px; border-start-end-radius: ${adv.radius.r}px; border-end-end-radius: ${adv.radius.b}px; border-end-start-radius: ${adv.radius.l}px; overflow: clip;`)
  if (adv.shadow) base.push(`box-shadow: ${SHADOW_CSS[adv.shadow]};`)
  if (adv.opacity !== undefined) base.push(`opacity: ${adv.opacity / 100};`)
  if (adv.zIndex) base.push(`position: relative; z-index: ${adv.zIndex};`)
  if (adv.minHeight) base.push(`min-height: ${adv.minHeight}px;`)
  if (adv.minHeightVh) base.push(`min-height: ${adv.minHeightVh}svh;`)
  if (adv.maxWidth) base.push(`max-width: ${adv.maxWidth}px; margin-inline: auto;`)
  if (adv.fontSize) text.push(`font-size: ${adv.fontSize}px;`)
  if (adv.fontWeight) text.push(`font-weight: ${adv.fontWeight};`)
  if (adv.lineHeight) text.push(`line-height: ${adv.lineHeight / 100};`)
  if (adv.letterSpacing) text.push(`letter-spacing: ${adv.letterSpacing / 10}px;`)
  if (adv.marginT) tablet.push(sides('margin', adv.marginT))
  if (adv.paddingT) tablet.push(sides('padding', adv.paddingT))
  if (adv.alignT) tablet.push(`text-align: ${adv.alignT};`)
  if (adv.fontSizeT) tabletText.push(`font-size: ${adv.fontSizeT}px;`)
  if (adv.marginM) phone.push(sides('margin', adv.marginM))
  if (adv.paddingM) phone.push(sides('padding', adv.paddingM))
  if (adv.alignM) phone.push(`text-align: ${adv.alignM};`)
  if (adv.fontSizeM) phoneText.push(`font-size: ${adv.fontSizeM}px;`)
  const out: string[] = []
  if (base.length) out.push(`${sel} { ${base.join(' ')} }`)
  if (text.length) out.push(`${sel}, ${sel} ${TEXT} { ${text.join(' ')} }`)
  if (tablet.length || tabletText.length) out.push(`@media (min-width: 768px) and (max-width: 1024px) { ${tablet.length ? `${sel} { ${tablet.join(' ')} } ` : ''}${tabletText.length ? `${sel}, ${sel} ${TEXT} { ${tabletText.join(' ')} }` : ''} }`)
  if (phone.length || phoneText.length) out.push(`@media (max-width: 767px) { ${phone.length ? `${sel} { ${phone.join(' ')} } ` : ''}${phoneText.length ? `${sel}, ${sel} ${TEXT} { ${phoneText.join(' ')} }` : ''} }`)
  if (adv.surface) out.push(surfaceCss(sel, adv.surface))
  if (adv.textFx) out.push(textCss(sel, adv.textFx))
  if (adv.hover) {
    // Shine draws a light across the element; colorize starts grey. Both only where a pointer hovers, so a phone sees the element as it is.
    const before = adv.hover === 'shine' ? ` ${sel} { position: relative; overflow: clip; } ${sel}::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 35%, rgb(255 255 255 / .28) 50%, transparent 65%) no-repeat; background-size: 250% 100%; background-position: 130% 0; transition: background-position .8s ease; } ${sel}:hover::after { background-position: -30% 0; }` : adv.hover === 'colorize' ? ` ${sel} { filter: grayscale(1); }` : ''
    out.push(`@media (hover: hover) { ${sel} { transition: transform .25s ease, box-shadow .25s ease, filter .25s ease; } ${sel}:hover { ${HOVER_CSS[adv.hover]}; }${before} } @media (prefers-reduced-motion: reduce) { ${sel}, ${sel}:hover { transition: none; transform: none; }${adv.hover === 'shine' ? ` ${sel}::after { transition: none; }` : ''} }`)
  }
  if (adv.motion || adv.loop) {
    // The entrance is tied to scrolling where the browser can; the loop runs on its own clock beside it.
    const loop = adv.loop ? `br-loop-${adv.loop} ${LOOP_TIMING[adv.loop]}` : ''
    const parts: string[] = []
    if (loop) parts.push(`${sel} { animation: ${loop};${adv.loop === 'gradient' ? ' background-size: 240% 240%;' : ''} }`)
    if (adv.motion) parts.push(`@supports (animation-timeline: view()) { ${sel} { animation: br-in-${adv.motion} linear both${loop ? `, ${loop}` : ''}; animation-timeline: view()${loop ? ', auto' : ''}; animation-range: entry 0% entry 45%${loop ? ', normal' : ''}; } }`)
    out.push(`@media (prefers-reduced-motion: no-preference) { ${parts.join(' ')} }`)
  }
  // Last, so the element's own CSS can override everything above.
  const custom = customCssFor(sel, adv.customCss); if (custom) out.push(custom)
  return out.join('\n')
}

function surfaceCss(sel: string, surface: typeof SURFACES[number]): string {
  const stack = `${sel} { position: relative; isolation: isolate; }`
  switch (surface) {
    case 'glass': return `${sel} { background: color-mix(in srgb, var(--card, #ffffff) 58%, transparent); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); border: 1px solid color-mix(in srgb, #ffffff 16%, transparent); }`
    case 'mesh': return `${sel} { background-image: radial-gradient(60% 80% at 15% 10%, color-mix(in srgb, var(--primary) 30%, transparent), transparent 70%), radial-gradient(50% 70% at 85% 20%, color-mix(in srgb, #8b5cf6 26%, transparent), transparent 70%), radial-gradient(60% 80% at 60% 100%, color-mix(in srgb, #06b6d4 22%, transparent), transparent 70%); }`
    case 'aurora': return `${stack} ${sel} { overflow: clip; } ${behind(sel, 'inset: -30%; background: radial-gradient(40% 50% at 20% 30%, color-mix(in srgb, var(--primary) 45%, transparent), transparent 70%), radial-gradient(35% 45% at 80% 20%, color-mix(in srgb, #8b5cf6 40%, transparent), transparent 70%), radial-gradient(40% 50% at 60% 90%, color-mix(in srgb, #06b6d4 35%, transparent), transparent 70%); filter: blur(40px);')} @media (prefers-reduced-motion: no-preference) { ${sel}::before { animation: br-aurora 18s ease-in-out infinite alternate; } }`
    case 'grid': return `${stack} ${behind(sel, 'background-image: linear-gradient(color-mix(in srgb, currentColor 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, currentColor 9%, transparent) 1px, transparent 1px); background-size: 44px 44px; -webkit-mask-image: radial-gradient(ellipse at 50% 0%, #000 25%, transparent 75%); mask-image: radial-gradient(ellipse at 50% 0%, #000 25%, transparent 75%);')}`
    case 'dots': return `${stack} ${behind(sel, 'background-image: radial-gradient(color-mix(in srgb, currentColor 18%, transparent) 1.2px, transparent 1.6px); background-size: 22px 22px; -webkit-mask-image: radial-gradient(ellipse at 50% 30%, #000 30%, transparent 78%); mask-image: radial-gradient(ellipse at 50% 30%, #000 30%, transparent 78%);')}`
    case 'beam': return `${stack} ${sel}::before { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; border-radius: inherit; padding: 2px; background: conic-gradient(from var(--br-angle, 0deg), transparent 55%, ${ACCENTS}, transparent 92%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; } @media (prefers-reduced-motion: no-preference) { ${sel}::before { animation: br-beam 4s linear infinite; } }`
  }
}

function textCss(sel: string, effect: typeof TEXT_EFFECTS[number]): string {
  const heads = `${sel} :is(h1, h2, h3, h4, h5, h6), ${sel}:is(h1, h2, h3, h4, h5, h6)`
  switch (effect) {
    case 'gradient': return `${heads} { background: linear-gradient(120deg, ${ACCENTS}); -webkit-background-clip: text; background-clip: text; color: transparent; }`
    case 'shimmer': return `${heads} { background: linear-gradient(110deg, var(--primary) 20%, #ffffff 40%, #8b5cf6 60%, var(--primary) 80%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; } @media (prefers-reduced-motion: no-preference) { ${heads} { animation: br-shimmer 4s linear infinite; } }`
    case 'glow': return `${heads} { text-shadow: 0 0 26px color-mix(in srgb, var(--primary) 55%, transparent), 0 0 2px color-mix(in srgb, var(--primary) 40%, transparent); }`
    case 'outline': return `${heads} { -webkit-text-stroke: 1.5px currentColor; color: transparent; }`
  }
}

/** Whether anything is set (the inspector shows a dot on the tab). */
export const hasAdvancedStyle = (adv: AdvancedStyle | undefined) => !!adv && Object.keys(adv).length > 0
