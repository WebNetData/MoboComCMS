/**
 * What a block's props may hold. A block type declares its fields; every value is checked against
 * its field on the server, whatever the editor sent. There is no field that holds markup, a style
 * string or a script: layout choices are names from a list, sizes are bounded numbers.
 */
import type { DocumentIssue } from '@/modules/editor/domain/document'
import { emptyRichText, normalizeRichText, safeLinkHref, type RichTextDoc } from '@/modules/editor/domain/rich-text'
import { embedOf, playableFile, safeMediaSrc } from '@/shared/media/editorial'
export { embedOf } from '@/shared/media/editorial'

export const BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const
export type Breakpoint = (typeof BREAKPOINTS)[number]
export type Responsive<T> = Record<Breakpoint, T>

export interface AssetValue { src: string; alt: string; caption: string; width: number; height: number; mime: string }
export interface EmbedValue { provider: string; url: string }

export type FieldSpec =
  | { kind: 'string'; max: number; default?: string; role?: 'text' | 'heading' }
  | { kind: 'enum'; values: readonly string[]; default: string }
  | { kind: 'int'; min: number; max: number; default: number }
  | { kind: 'boolean'; default: boolean }
  | { kind: 'url'; default?: string }
  | { kind: 'asset'; accept: 'image' | 'video' | 'audio' | 'file' }
  | { kind: 'embed' }
  | { kind: 'richText' }
  | { kind: 'responsive'; of: { kind: 'enum'; values: readonly string[]; default: string } | { kind: 'int'; min: number; max: number; default: number }; default?: Partial<Record<Breakpoint, string | number>> }
  | { kind: 'list'; max: number; item: Record<string, FieldSpec> }

export type FieldSchema = Record<string, FieldSpec>

const emptyAsset = (): AssetValue => ({ src: '', alt: '', caption: '', width: 0, height: 0, mime: '' })
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i

/** Where a stored file may come from: this site's own storage, or an https address. Never data:, blob: or javascript:. */
export function safeAssetSrc(value: unknown): string | null {
  return safeMediaSrc(value)
}

/** The players a page may embed. The stored address is the player's own embed address, built here from the id. */

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '')

/** The default value of a field: what a new block starts with. */
export function fieldDefault(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case 'string': return spec.default ?? ''
    case 'enum': case 'int': case 'boolean': return spec.default
    case 'url': return spec.default ?? ''
    case 'asset': return emptyAsset()
    case 'embed': return { provider: '', url: '' }
    case 'richText': return emptyRichText()
    case 'responsive': return Object.fromEntries(BREAKPOINTS.map(point => [point, checkField(spec.of, spec.default?.[point], point, [])]))
    case 'list': return []
  }
}

export const defaultProps = (schema: FieldSchema): Record<string, unknown> => Object.fromEntries(Object.entries(schema).map(([name, spec]) => [name, fieldDefault(spec)]))

/**
 * The checked value of one field. A value that is missing takes the default silently; a value that
 * is present and wrong is reported and replaced by the default, so the caller decides whether a
 * document with issues may be saved.
 */
export function checkField(spec: FieldSpec, value: unknown, path: string, issues: DocumentIssue[]): unknown {
  const bad = (code: string, message: string) => { if (issues.length < 200) issues.push({ level: 'error', path, code, message }); return fieldDefault(spec) }
  if (value === undefined || value === null) return fieldDefault(spec)
  switch (spec.kind) {
    case 'string': {
      if (typeof value !== 'string') return bad('field.string', 'must be text')
      if (value.length > spec.max) return bad('field.length', `must be at most ${spec.max} characters`)
      return text(value, spec.max)
    }
    case 'enum': return typeof value === 'string' && spec.values.includes(value) ? value : bad('field.enum', `must be one of: ${spec.values.join(', ')}`)
    case 'int': return typeof value === 'number' && Number.isInteger(value) && value >= spec.min && value <= spec.max ? value : bad('field.int', `must be a whole number from ${spec.min} to ${spec.max}`)
    case 'boolean': return typeof value === 'boolean' ? value : bad('field.boolean', 'must be true or false')
    case 'url': {
      if (value === '') return ''
      const href = safeLinkHref(value)
      return href === null ? bad('field.url', 'is not an address a page may link to') : href
    }
    case 'asset': {
      if (typeof value !== 'object' || Array.isArray(value)) return bad('field.asset', 'must be a media item')
      const raw = value as Record<string, unknown>
      const src = safeAssetSrc(raw.src)
      if (src === null) return bad('field.asset.src', 'is not a file of the media library or an https address')
      const path = src.split(/[?#]/)[0]
      if (src && spec.accept === 'image' && !IMAGE.test(path)) return bad('field.asset.type', 'must be an image')
      if (src && spec.accept === 'video' && !playableFile(src, 'video')) return bad('field.asset.type', 'must be a video')
      if (src && spec.accept === 'audio' && !playableFile(src, 'audio')) return bad('field.asset.type', 'must be audio')
      const size = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 20000 ? n : 0)
      return { src, alt: text(raw.alt, 300), caption: text(raw.caption, 500), width: size(raw.width), height: size(raw.height), mime: /^[a-z]+\/[a-z0-9.+-]{1,60}$/.test(String(raw.mime || '')) ? String(raw.mime) : '' } satisfies AssetValue
    }
    case 'embed': {
      const raw = typeof value === 'object' && value && !Array.isArray(value) ? (value as Record<string, unknown>).url : value
      if (raw === '' || raw === undefined) return { provider: '', url: '' }
      return embedOf(raw) || bad('field.embed', 'is not a video of a supported player (YouTube, Aparat, Namasha, Tamasha, Vimeo)')
    }
    case 'richText': {
      const checked = normalizeRichText(value, path)
      for (const issue of checked.issues) if (issues.length < 200) issues.push(issue)
      return checked.doc satisfies RichTextDoc
    }
    case 'responsive': {
      // One value for every screen is accepted and spread; the stored form always names the three.
      const each = (typeof value === 'object' && !Array.isArray(value) ? value : { desktop: value, tablet: value, mobile: value }) as Record<string, unknown>
      const out = {} as Record<Breakpoint, unknown>
      for (const point of BREAKPOINTS) out[point] = checkField(spec.of, each[point], `${path}.${point}`, issues)
      return out
    }
    case 'list': {
      if (!Array.isArray(value)) return bad('field.list', 'must be a list')
      if (value.length > spec.max) return bad('field.list.length', `must have at most ${spec.max} items`)
      return value.map((item, index) => checkProps(spec.item, item, `${path}[${index}]`, issues))
    }
  }
}

/** The checked props of a block: every declared field, and nothing that is not declared. */
export function checkProps(schema: FieldSchema, input: unknown, path: string, issues: DocumentIssue[]): Record<string, unknown> {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) issues.push({ level: 'error', path, code: 'props.shape', message: 'props must be an object' })
  const out: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(schema)) out[name] = checkField(spec, raw[name], `${path}.${name}`, issues)
  for (const name of Object.keys(raw)) if (!Object.hasOwn(schema, name) && issues.length < 200) issues.push({ level: 'warning', path: `${path}.${name}`, code: 'props.unknown', message: 'is not a field of this block and is not kept' })
  return out
}
