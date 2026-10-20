import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import type { RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
import {
  DEFAULT_WATERMARK, appearanceKey, fileOfUrl, markSize, normalizeWatermark, placement, shouldWatermark,
  type Role, type Usage, type WatermarkSettings,
} from '@/modules/watermark/domain/watermark'

/**
 * Draws the site watermark on stored images as they are served
 * (/api/media/covers/…). Which images get it depends on where they are used,
 * so a usage index maps every stored image to its sections and roles.
 */

const KEY = 'media.watermark.v1'
const coversDir = () => path.join(process.cwd(), 'storage', 'covers')
const cacheDir = () => path.join(coversDir(), '.cache')
const FONT = () => path.join(process.cwd(), 'public', 'fonts', 'Vazirmatn-Bold.ttf')

type State = { settings?: { value: WatermarkSettings; at: number }; index?: { value: Map<string, Usage>; at: number }; building?: Promise<Map<string, Usage>>; marks: Map<string, Buffer> }
const g = globalThis as typeof globalThis & { watermarkState?: State }
const state: State = g.watermarkState ??= { marks: new Map() }
const SETTINGS_TTL = 30_000
const INDEX_TTL = 10 * 60_000

export async function getWatermark(): Promise<WatermarkSettings> {
  if (state.settings && Date.now() - state.settings.at < SETTINGS_TTL) return state.settings.value
  const stored = await readJsonSetting(KEY).catch(() => undefined)
  const value = stored ? normalizeWatermark(stored, DEFAULT_WATERMARK) : structuredClone(DEFAULT_WATERMARK)
  state.settings = { value, at: Date.now() }
  return value
}

const watermarkHistory = () => createSectionSettingsHistory(KEY, 'settings-watermark', raw => normalizeWatermark((raw || {}) as Record<string, unknown>, DEFAULT_WATERMARK), settings => ({ enabled: settings.enabled, scope: settings.scope, position: settings.position }), { action: 'watermark.update', targetId: KEY })
export const watermarkSettingsState = () => watermarkHistory().current()

/** After a committed change: fresh settings in memory, and marked copies remade when the look changed or marking stopped. */
async function watermarkChanged(previous: WatermarkSettings, next: WatermarkSettings) {
  state.settings = { value: next, at: Date.now() }
  state.marks.clear()
  if (appearanceKey(previous) !== appearanceKey(next) || !next.enabled) await clearWatermarkCache()
}

export async function saveWatermark(input: Record<string, unknown>, context?: SectionSettingsContext): Promise<WatermarkSettings> {
  const previous = await watermarkHistory().read()
  const next = await watermarkHistory().save(input, context)
  await watermarkChanged(previous, next)
  return next
}

export async function restoreWatermarkSettings(id: number, snapshot: Snapshot, commit: RestoreCommit) {
  const previous = await watermarkHistory().read()
  const result = await watermarkHistory().restore(id, snapshot, commit)
  await watermarkChanged(previous, await watermarkHistory().read())
  return result
}

/** Removes the watermarked copies (they are made again on the next request). */
export async function clearWatermarkCache() {
  const names = await fs.readdir(cacheDir()).catch(() => [] as string[])
  for (const name of names) if (name.includes('-wm')) await fs.rm(path.join(cacheDir(), name), { force: true }).catch(() => undefined)
}

// ------------------------------------------------------------------ usage index

type Source = { model: string; section: string; main?: string[]; lists?: string[]; content?: string[] }
const SOURCES: Source[] = [
  { model: 'post', section: 'blog', main: ['cover'], content: ['content', 'contentEn'] },
  { model: 'product', section: 'store', main: ['image'], lists: ['gallery'], content: ['description', 'descriptionEn'] },
  { model: 'musicArtist', section: 'music', main: ['image', 'cover'], content: ['bio'] },
  { model: 'musicAlbum', section: 'music', main: ['cover'], content: ['description'] },
  { model: 'musicTrack', section: 'music', main: ['cover'], content: ['lyrics'] },
  { model: 'musicPlaylist', section: 'music', main: ['cover'], content: ['description'] },
  { model: 'cinemaTitle', section: 'cinema', main: ['poster', 'backdrop'], content: ['summary', 'summaryEn'] },
  { model: 'cinemaSeason', section: 'cinema', main: ['poster'] },
  { model: 'gameTitle', section: 'games', main: ['cover', 'backdrop'], lists: ['screenshots'], content: ['summary', 'content'] },
  { model: 'gameFranchise', section: 'games', main: ['image'] },
  { model: 'softwareTitle', section: 'software', main: ['cover'], lists: ['screenshots'], content: ['summary', 'content', 'changelog'] },
]
type Delegate = { findMany(args: object): Promise<(Record<string, unknown> & { id: number })[]> }
const FIND = /\/api\/media\/covers\/([0-9a-f-]{36}\.(?:webp|png|jpg))/g

async function buildIndex(): Promise<Map<string, Usage>> {
  const index = new Map<string, Usage>()
  const add = (file: string, section: string, role: Role) => {
    if (!file) return
    const entry = index.get(file) || { sections: [], roles: [] }
    if (!entry.sections.includes(section)) entry.sections.push(section)
    if (!entry.roles.includes(role)) entry.roles.push(role)
    index.set(file, entry)
  }
  for (const source of SOURCES) {
    const table = (db as unknown as Record<string, Delegate>)[source.model]
    if (!table) continue
    const fields = [...(source.main || []), ...(source.lists || []), ...(source.content || [])]
    let cursor = 0
    for (;;) {
      const rows = await table.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 500, select: Object.fromEntries(['id', ...fields].map((field) => [field, true])) }).catch(() => [])
      if (!rows.length) break
      for (const row of rows) {
        for (const field of source.main || []) add(fileOfUrl(String(row[field] ?? '')), source.section, 'main')
        for (const field of [...(source.lists || []), ...(source.content || [])]) {
          const role: Role = (source.lists || []).includes(field) ? 'main' : 'content'
          for (const match of String(row[field] ?? '').matchAll(FIND)) add(match[1], source.section, role)
        }
      }
      cursor = rows[rows.length - 1].id
    }
  }
  return index
}

/** Where each stored image is used; rebuilt every few minutes in the background. */
export async function usageIndex(fresh = false): Promise<Map<string, Usage>> {
  const current = state.index
  if (!fresh && current && Date.now() - current.at < INDEX_TTL) return current.value
  if (!state.building) {
    state.building = buildIndex().then((value) => { state.index = { value, at: Date.now() }; return value }).finally(() => { state.building = undefined })
  }
  // A stale index is good enough while the new one is built.
  return !fresh && current ? current.value : state.building
}

// ------------------------------------------------------------------ drawing

const escapeMarkup = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The mark at a large size, before scaling: rendered text (with its soft outline) or the logo. */
async function baseMark(settings: WatermarkSettings): Promise<Buffer | null> {
  const key = appearanceKey(settings)
  const cached = state.marks.get(key)
  if (cached) return cached
  const sharp = (await import('sharp')).default
  let mark: Buffer | null = null
  if (settings.kind === 'text' && settings.text.trim()) {
    const render = (color: string) => sharp({ text: { text: `<span foreground="${color}">${escapeMarkup(settings.text.trim())}</span>`, font: 'Vazirmatn Bold', fontfile: FONT(), rgba: true, dpi: 400 } }).png().toBuffer()
    const fill = await render(settings.color)
    if (settings.shadow) {
      const meta = await sharp(fill).metadata()
      const pad = Math.max(4, Math.round((meta.height || 40) * 0.12))
      const blurred = await sharp(await render('#000000')).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(Math.max(1, pad / 2)).png().toBuffer()
      mark = await sharp(await withOpacity(blurred, 60)).composite([{ input: fill, left: pad, top: pad }]).png().toBuffer()
    } else mark = fill
  } else if (settings.kind === 'image') {
    const file = fileOfUrl(settings.image)
    const bytes = file ? await fs.readFile(path.join(coversDir(), file)).catch(() => null) : null
    if (bytes) mark = await sharp(bytes).ensureAlpha().trim({ threshold: 1 }).png().toBuffer().catch(() => sharp(bytes).ensureAlpha().png().toBuffer())
  }
  if (state.marks.size > 20) state.marks.clear()
  if (mark) state.marks.set(key, mark)
  return mark
}

/** Multiplies the mark's alpha by the opacity. */
async function withOpacity(mark: Buffer, opacity: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  if (opacity >= 100) return mark
  const { data, info } = await sharp(mark).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity / 100)
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

/** The image with the watermark drawn on it, in `format`. Animated images are returned unchanged. */
export async function drawWatermark(input: Buffer, settings: WatermarkSettings, format: 'webp' | 'png' | 'jpg', quality = 82): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const image = sharp(input, { animated: true })
  const meta = await image.metadata()
  if ((meta.pages || 1) > 1 || !meta.width || !meta.height) return input
  const base = await baseMark(settings)
  if (!base) return input
  const baseMeta = await sharp(base).metadata()
  const size = markSize({ width: meta.width, height: meta.height }, { width: baseMeta.width || 1, height: baseMeta.height || 1 }, settings.size)
  let mark = await withOpacity(await sharp(base).resize(size.width, size.height, { fit: 'fill' }).png().toBuffer(), settings.opacity)
  let layer: { input: Buffer; left?: number; top?: number; tile?: boolean; gravity?: string }
  if (settings.position === 'tile') {
    // Diagonal repeat with breathing room between copies.
    const gap = Math.round(size.width * 0.6)
    mark = await sharp(mark).extend({ top: gap / 2 | 0, bottom: gap / 2 | 0, left: gap / 2 | 0, right: gap / 2 | 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .rotate(-30, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    const tileMeta = await sharp(mark).metadata()
    if ((tileMeta.width || 0) > meta.width || (tileMeta.height || 0) > meta.height) mark = await sharp(mark).resize(meta.width, meta.height, { fit: 'inside' }).png().toBuffer()
    layer = { input: mark, tile: true, gravity: 'northwest' }
  } else {
    layer = { input: mark, ...placement({ width: meta.width, height: meta.height }, size, settings.position, settings.margin) }
  }
  const out = sharp(input).composite([layer])
  return format === 'png' ? out.png({ compressionLevel: 9 }).toBuffer() : format === 'jpg' ? out.jpeg({ quality, mozjpeg: true }).toBuffer() : out.webp({ quality }).toBuffer()
}

/**
 * The watermarked bytes for a stored image served at `width` (0 = original),
 * or null when this image is served without a watermark. Results are cached.
 */
export async function watermarkedImage(file: string, width: number, original: () => Promise<Buffer>): Promise<{ bytes: Buffer; type: string } | null> {
  const settings = await getWatermark()
  if (!settings.enabled) return null
  const sharp = (await import('sharp')).default
  const usage = (await usageIndex()).get(file)
  // Cheap check first: most images are decided without reading them.
  if (!shouldWatermark(file, Number.MAX_SAFE_INTEGER, settings, usage)) return null
  let source: Buffer | null = null
  if (!width) {
    source = await original()
    const originalWidth = (await sharp(source).metadata().catch(() => ({ width: 0 }))).width || 0
    if (!shouldWatermark(file, originalWidth, settings, usage)) return null
  } else if (!shouldWatermark(file, width, settings, usage)) return null
  const ext = width ? 'webp' : (file.split('.').pop() as 'webp' | 'png' | 'jpg')
  const cached = path.join(cacheDir(), `${file.replace(/\.\w+$/, '')}-${width || 'o'}-wm${appearanceKey(settings)}.${ext}`)
  const hit = await fs.readFile(cached).catch(() => null)
  const type = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg'
  if (hit) return { bytes: hit, type }
  source ??= await original()
  const resized = width ? await sharp(source, { animated: true }).resize({ width, withoutEnlargement: true }).toBuffer() : source
  const bytes = await drawWatermark(resized, settings, ext, width ? 80 : 88)
  await fs.mkdir(cacheDir(), { recursive: true })
  await fs.writeFile(cached, bytes).catch(() => undefined)
  return { bytes, type }
}

/** Cache header for stored images: short while a watermark is in use, so changes reach visitors. */
export async function imageCacheControl() {
  const settings = await getWatermark()
  return settings.enabled ? 'public, max-age=3600, stale-while-revalidate=86400' : 'public, max-age=86400, stale-while-revalidate=604800'
}

// ------------------------------------------------------------------ admin

export type ImageRow = { file: string; url: string; sections: string[]; roles: Role[]; state: 'include' | 'exclude' | 'default'; marked: boolean }

/** Stored images, newest first, with where they are used and whether they carry the mark. */
export async function listImages(input: { page?: unknown; section?: unknown; filter?: unknown }) {
  const settings = await getWatermark()
  const index = await usageIndex()
  const names = (await fs.readdir(coversDir()).catch(() => [] as string[])).filter((name) => /^[0-9a-f-]{36}\.(webp|png|jpg)$/.test(name))
  const stats = await Promise.all(names.map(async (name) => ({ name, at: (await fs.stat(path.join(coversDir(), name)).catch(() => null))?.mtimeMs || 0 })))
  stats.sort((a, b) => b.at - a.at)
  const section = String(input.section || '')
  const filter = String(input.filter || 'used')
  const rows = stats.map(({ name }): ImageRow => {
    const usage = index.get(name)
    return {
      file: name, url: `/api/media/covers/${name}`, sections: usage?.sections || [], roles: usage?.roles || [],
      state: settings.include.includes(name) ? 'include' : settings.exclude.includes(name) ? 'exclude' : 'default',
      marked: shouldWatermark(name, Number.MAX_SAFE_INTEGER, { ...settings, enabled: true }, usage),
    }
  }).filter((row) => (section ? row.sections.includes(section) : true)).filter((row) =>
    filter === 'marked' ? row.marked : filter === 'clean' ? !row.marked : filter === 'include' ? row.state === 'include' : filter === 'exclude' ? row.state === 'exclude' : filter === 'all' ? true : row.sections.length > 0)
  const perPage = 48
  const page = Math.max(1, Math.round(Number(input.page) || 1))
  return { rows: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / perPage)) }
}

/** One image's choice: always / never / follow the rules. */
export async function markImage(file: string, choice: 'include' | 'exclude' | 'default') {
  const settings = await getWatermark()
  const include = settings.include.filter((name) => name !== file)
  const exclude = settings.exclude.filter((name) => name !== file)
  if (choice === 'include') include.push(file)
  if (choice === 'exclude') exclude.push(file)
  await saveWatermark({ include, exclude })
  // This image's cached copies no longer match the choice.
  const names = await fs.readdir(cacheDir()).catch(() => [] as string[])
  const stem = file.replace(/\.\w+$/, '')
  for (const name of names) if (name.startsWith(`${stem}-`) && name.includes('-wm')) await fs.rm(path.join(cacheDir(), name), { force: true }).catch(() => undefined)
}

/** A preview of unsaved settings on a stored image (or a neutral sample), as a data URL. */
export async function previewWatermark(input: Record<string, unknown>, file: unknown) {
  const settings = normalizeWatermark({ ...input, enabled: true }, await getWatermark())
  const sharp = (await import('sharp')).default
  const name = fileOfUrl(`/api/media/covers/${String(file || '')}`)
  let image = name ? await fs.readFile(path.join(coversDir(), name)).catch(() => null) : null
  if (image) image = await sharp(image).resize({ width: 960, withoutEnlargement: true }).toBuffer()
  else image = await sharp({ create: { width: 960, height: 600, channels: 3, background: '#6b7280' } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs><rect width="960" height="600" fill="url(#g)"/></svg>') }]).jpeg().toBuffer()
  const bytes = await drawWatermark(image, settings, 'jpg', 80)
  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

export const watermarkFontReady = () => fs.access(FONT()).then(() => true, () => false)
