/**
 * Image watermark rules. The watermark is drawn when an image is served
 * (the stored original never changes), so switching it off or changing its
 * look applies to every image at once. Pure functions only.
 */

export type Position = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'tile'
export type Scope = 'all' | 'sections' | 'selected'
/** main: covers, posters, product photos, galleries, screenshots · content: images inside post text. */
export type Role = 'main' | 'content'

export const POSITIONS: Position[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'tile']
export const SECTIONS = [
  { id: 'blog', label: 'مجله' },
  { id: 'store', label: 'فروشگاه' },
  { id: 'music', label: 'موزیک' },
  { id: 'cinema', label: 'فیلم و سریال' },
  { id: 'games', label: 'بازی' },
  { id: 'software', label: 'نرم‌افزار' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

export interface WatermarkSettings {
  enabled: boolean
  kind: 'text' | 'image'
  text: string
  color: string
  /** A site image (/api/media/covers/…), usually a transparent PNG logo. */
  image: string
  position: Position
  /** Watermark width as a percentage of the image width. */
  size: number
  opacity: number
  /** Distance from the edges, as a percentage of the image width. */
  margin: number
  /** Soft dark outline behind text so it reads on light and dark photos. */
  shadow: boolean
  scope: Scope
  sections: SectionId[]
  roles: Role[]
  /** Images shown narrower than this (thumbnails) stay clean. */
  minWidth: number
  /** Always watermarked / never watermarked, by stored file name. */
  include: string[]
  exclude: string[]
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  kind: 'text',
  text: '',
  color: '#ffffff',
  image: '',
  position: 'bottom-left',
  size: 22,
  opacity: 70,
  margin: 3,
  shadow: true,
  scope: 'all',
  sections: SECTIONS.map((section) => section.id),
  roles: ['main', 'content'],
  minWidth: 400,
  include: [],
  exclude: [],
}

export const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$/
const OWN_IMAGE = /^\/api\/media\/covers\/([0-9a-f-]{36}\.(?:webp|png|jpg))$/

/** "/api/media/covers/<id>.png" → "<id>.png" (or "" for anything else). */
export const fileOfUrl = (url: string) => OWN_IMAGE.exec(String(url || '').split('?')[0])?.[1] || ''

/** Organized pictures in the public file tree (shop/product/…/cover.webp) carry a "files/<path>" key in the usage index. */
export const ORGANIZED_IMAGE = /\/files\/((?:shop|blog|pages|download)\/[^"'\s?#<>()]+\.(?:webp|png|jpe?g))/g
export function organizedImageKey(url: string) {
  const match = /^\/files\/((?:shop|blog|pages|download)\/[^"'\s?#<>()]+\.(?:webp|png|jpe?g))$/i.exec(String(url || '').split('?')[0])
  if (!match) return ''
  let key: string
  try { key = match[1].split('/').map(decodeURIComponent).join('/') } catch { return '' }
  return key.split('/').every((part) => part && !part.startsWith('.') && !part.includes('\\') &&![...part].some((ch) => ch.charCodeAt(0) < 32)) ? `files/${key}` : ''
}
/** One flat, safe cache name stem for any image key (covers keep their own name). */
export function cacheStem(file: string) {
  if (!file.startsWith('files/')) return file.replace(/\.\w+$/, '')
  let hash = 2166136261
  for (let i = 0; i < file.length; i++) { hash ^= file.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return `files-${(hash >>> 0).toString(36)}-${file.length.toString(36)}`
}

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const files = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(String).filter((name) => FILE_NAME.test(name)))].slice(0, 5000)

export function normalizeWatermark(input: Record<string, unknown> = {}, previous: WatermarkSettings = DEFAULT_WATERMARK): WatermarkSettings {
  const pick = <K extends keyof WatermarkSettings>(key: K) => (input[key] === undefined ? previous[key] : input[key])
  const sectionIds = SECTIONS.map((section) => section.id) as string[]
  const color = String(pick('color'))
  return {
    enabled: pick('enabled') === true,
    kind: pick('kind') === 'image' ? 'image' : 'text',
    text: String(pick('text') ?? '').replace(/[\u0000-\u001f<>&]/g, ' ').trim().slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_WATERMARK.color,
    image: fileOfUrl(String(pick('image') ?? '')) ? String(pick('image')).split('?')[0] : '',
    position: POSITIONS.includes(pick('position') as Position) ? pick('position') as Position : DEFAULT_WATERMARK.position,
    size: int(pick('size'), 3, 80, DEFAULT_WATERMARK.size),
    opacity: int(pick('opacity'), 5, 100, DEFAULT_WATERMARK.opacity),
    margin: int(pick('margin'), 0, 20, DEFAULT_WATERMARK.margin),
    shadow: pick('shadow') !== false,
    scope: pick('scope') === 'sections' || pick('scope') === 'selected' ? pick('scope') as Scope : 'all',
    sections: (Array.isArray(pick('sections')) ? (pick('sections') as unknown[]).map(String).filter((id) => sectionIds.includes(id)) : []) as SectionId[],
    roles: (Array.isArray(pick('roles')) ? (pick('roles') as unknown[]).map(String).filter((role) => role === 'main' || role === 'content') : []) as Role[],
    minWidth: int(pick('minWidth'), 0, 4000, DEFAULT_WATERMARK.minWidth),
    include: files(pick('include')),
    exclude: files(pick('exclude')),
  }
}

/** Whether there is anything to draw. */
export const drawable = (settings: WatermarkSettings) => settings.kind === 'text' ? !!settings.text.trim() : !!fileOfUrl(settings.image)

/** Where an image is used on the site (from the usage index). */
export type Usage = { sections: string[]; roles: Role[] }

/** Whether this stored image, served at this width, gets the watermark. */
export function shouldWatermark(file: string, servedWidth: number, settings: WatermarkSettings, usage: Usage | undefined): boolean {
  if (!settings.enabled || !drawable(settings)) return false
  if (fileOfUrl(settings.image) === file) return false
  if (settings.exclude.includes(file)) return false
  if (servedWidth < settings.minWidth) return false
  if (settings.include.includes(file)) return true
  if (settings.scope === 'selected' || !usage) return false
  if (!usage.roles.some((role) => settings.roles.includes(role))) return false
  return settings.scope === 'all' || usage.sections.some((section) => (settings.sections as string[]).includes(section))
}

/** Settings that change how the mark looks (a new value means new cached images). */
export function appearanceKey(settings: WatermarkSettings): string {
  const parts = [settings.kind, settings.text, settings.color, settings.image, settings.position, settings.size, settings.opacity, settings.margin, settings.shadow ? 1 : 0].join('|')
  let hash = 2166136261
  for (let i = 0; i < parts.length; i++) { hash ^= parts.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

/** Mark size in pixels for an image: `size`% of its width, never taller than half of it. */
export function markSize(image: { width: number; height: number }, mark: { width: number; height: number }, sizePercent: number) {
  let width = Math.max(8, Math.round(image.width * sizePercent / 100))
  let height = Math.max(1, Math.round(width * mark.height / Math.max(1, mark.width)))
  const maxHeight = Math.round(image.height / 2)
  if (height > maxHeight) { height = maxHeight; width = Math.max(1, Math.round(height * mark.width / Math.max(1, mark.height))) }
  return { width: Math.min(width, image.width), height: Math.min(height, image.height) }
}

/** Top-left corner of the mark for a position (not used for "tile"). */
export function placement(image: { width: number; height: number }, mark: { width: number; height: number }, position: Position, marginPercent: number) {
  const m = Math.round(image.width * marginPercent / 100)
  const x = position.endsWith('left') || position === 'left' ? m
    : position.endsWith('right') || position === 'right' ? image.width - mark.width - m
      : Math.round((image.width - mark.width) / 2)
  const y = position.startsWith('top') ? m
    : position.startsWith('bottom') ? image.height - mark.height - m
      : Math.round((image.height - mark.height) / 2)
  return { left: Math.max(0, Math.min(x, image.width - mark.width)), top: Math.max(0, Math.min(y, image.height - mark.height)) }
}
