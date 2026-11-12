/**
 * Delivery-card designs (owner 2026-11-12: gift cards for PSN, Apple, Google… each with its own look; an account card
 * like an Apple ID one). Original art only: flat faces, a quiet line pattern and an accent; no brand marks are drawn.
 * A product may add its own logo, background photo, title and accent (`CardDesign`). Shared by the buyer's card, the
 * Admin print page and the saved image, so the three always match.
 */

export const CARD_PATTERNS = ['arcs', 'grid', 'dots', 'waves', 'diagonal', 'none'] as const
export type CardPattern = typeof CARD_PATTERNS[number]
/** `bg` 'site' follows the site's own accent colour. `stripe` is a band of colours along the bottom edge. */
export type CardPreset = { id: string; label: string; bg: string; ink: string; accent: string; pattern: CardPattern; stripe?: string[]; light?: boolean }

export const CARD_PRESETS: CardPreset[] = [
  { id: 'classic', label: 'رنگ سایت', bg: 'site', ink: '#ffffff', accent: '#ffffff', pattern: 'arcs' },
  { id: 'midnight', label: 'مشکی طلایی', bg: '#15171e', ink: '#f4f5f7', accent: '#d8b46a', pattern: 'grid' },
  { id: 'mono', label: 'مینیمال روشن (اپل)', bg: '#f5f5f7', ink: '#1d1d1f', accent: '#1d1d1f', pattern: 'arcs', light: true },
  { id: 'royal', label: 'آبی سلطنتی (پلی‌استیشن)', bg: '#0b3aa0', ink: '#ffffff', accent: '#9cc2ff', pattern: 'diagonal' },
  { id: 'four', label: 'سفید چهاررنگ (گوگل‌پلی)', bg: '#ffffff', ink: '#202124', accent: '#1a73e8', pattern: 'dots', stripe: ['#4285f4', '#ea4335', '#fbbc04', '#34a853'], light: true },
  { id: 'emerald', label: 'سبز (ایکس‌باکس)', bg: '#0f6e12', ink: '#ffffff', accent: '#b9f3b0', pattern: 'waves' },
  { id: 'steel', label: 'سرمه‌ای (استیم)', bg: '#1b2838', ink: '#e6edf3', accent: '#66c0f4', pattern: 'grid' },
  { id: 'ruby', label: 'زرشکی هدیه', bg: '#7a1f2b', ink: '#fff7ef', accent: '#ecc27f', pattern: 'waves' },
  { id: 'slate', label: 'سربی', bg: '#3a4655', ink: '#f3f5f7', accent: '#c7d2df', pattern: 'arcs' },
  { id: 'sand', label: 'کرم', bg: '#f1e8da', ink: '#2a2318', accent: '#8a5a1c', pattern: 'arcs', light: true },
  { id: 'sage', label: 'سبز ملایم', bg: '#dfe9e1', ink: '#17251c', accent: '#2f6b43', pattern: 'dots', light: true },
]

export type CardReveal = 'button' | 'scratch'
/** What a product says about its card; empty strings fall back to the preset and the site. */
export type CardDesign = { preset: string; title: string; logo: string; background: string; accent: string; reveal: CardReveal }
export const DEFAULT_CARD_DESIGN: CardDesign = { preset: 'classic', title: '', logo: '', background: '', accent: '', reveal: 'button' }

const HEX = /^#[0-9a-f]{6}$/i
const ASSET = /^(\/(?!\/)[^\s"'<>]*|https:\/\/[^\s"'<>]+)$/i
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)

/** A stored or submitted design, made safe: a known preset, a #rrggbb accent, site-relative or https images. */
export function readCardDesign(raw: unknown): CardDesign {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const asset = (input: unknown) => { const url = text(input, 600); return ASSET.test(url) ? url : '' }
  const accent = text(value.accent, 7)
  return {
    preset: CARD_PRESETS.some((preset) => preset.id === value.preset) ? String(value.preset) : DEFAULT_CARD_DESIGN.preset,
    title: text(value.title, 60),
    logo: asset(value.logo),
    background: asset(value.background),
    accent: HEX.test(accent) ? accent.toLowerCase() : '',
    reveal: value.reveal === 'scratch' ? 'scratch' : 'button',
  }
}

/** What a card needs besides its rows: the product's name, the site's name and logo, and the product's design. */
export type DeliveryCardData = { product: string; brand: { title: string; logo: string }; design: CardDesign }

export const presetOf = (id: string) => CARD_PRESETS.find((preset) => preset.id === id) || CARD_PRESETS[0]

/** The pattern laid over a face, as an SVG the page shows and the saved image draws (600 × 380). */
export function patternSvg(kind: CardPattern, color: string) {
  const line = `fill="none" stroke="${color}" stroke-opacity=".1" stroke-width="1.2"`
  const body = kind === 'arcs' ? Array.from({ length: 9 }, (_, i) => `<circle cx="600" cy="380" r="${90 + i * 46}" ${line}/>`).join('')
    : kind === 'grid' ? `<g ${line}>${Array.from({ length: 26 }, (_, i) => `<path d="M${i * 24} 0V380"/>`).join('')}${Array.from({ length: 16 }, (_, i) => `<path d="M0 ${i * 24}H600"/>`).join('')}</g>`
    : kind === 'dots' ? `<g fill="${color}" fill-opacity=".13">${Array.from({ length: 22 * 34 }, (_, i) => `<circle cx="${(i % 34) * 18 + 9}" cy="${Math.floor(i / 34) * 18 + 9}" r="1.3"/>`).join('')}</g>`
    : kind === 'waves' ? `<g ${line}>${Array.from({ length: 18 }, (_, i) => `<path d="M0 ${i * 22 + 10} C150 ${i * 22 - 14} 300 ${i * 22 + 34} 450 ${i * 22 + 10} S600 ${i * 22 - 4} 600 ${i * 22 + 10}"/>`).join('')}</g>`
    : kind === 'diagonal' ? `<g ${line}>${Array.from({ length: 40 }, (_, i) => `<path d="M${i * 26 - 380} 380L${i * 26} 0"/>`).join('')}</g>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">${body}</svg>`
}
export const patternDataUrl = (kind: CardPattern, color: string) => `data:image/svg+xml;utf8,${encodeURIComponent(patternSvg(kind, color))}`
