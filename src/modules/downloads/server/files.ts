import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { db } from '@/platform/database/prisma'
import { env } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { contentTypeFor, dispositionFor, fileNameOf } from '@/modules/downloads/domain/mask'
import { IMAGE_WIDTHS } from '@/shared/media/image'

// Files hosted by this site: manual uploads from the section editors (music,
// films, software, games…) and files/images copied from pasted content. They
// live in the download folder (DOWNLOADS_ROOT) and are linked through the
// download host address when one is set (e.g. https://dl.mobocom.net),
// otherwise through /files/… on the site itself.

export class FileError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const filesRoot = () => path.resolve(env('DOWNLOADS_ROOT') || path.join(process.cwd(), 'storage', 'downloads'))
const incoming = () => path.join(filesRoot(), '.incoming')

/** Public address of a stored file (relative path under the root, e.g. "uploads/music/2026-09/a.mp3"). */
export async function publicFileUrl(relative: string): Promise<string> {
  // %20 (not "+") so nginx serving the download folder directly finds the file.
  // Readable (Persian letters kept) but safe: only spaces and URL-reserved characters are encoded.
  const encoded = relative.split('/').map((part) => part.replace(/[%#?&+'"<>\\ ]/g, (char) => encodeURIComponent(char))).join('/')
  const row = await db.setting.findUnique({ where: { key: 'server-panel.downloads.v1' } }).catch(() => null)
  let base = ''
  try { base = String(JSON.parse(row?.value || '{}').localBaseUrl || '') } catch { base = '' }
  return base ? `${base.replace(/\/+$/, '')}/${encoded}` : `/files/${encoded}`
}

const SECTIONS = new Set(['music', 'cinema', 'software', 'games', 'posts', 'products', 'general'])
const month = () => new Date().toISOString().slice(0, 7)
export function cleanFileName(input: unknown): string {
  const name = String(input ?? '').replace(/[\u0000-\u001f\u007f/\\?#%"<>|*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (!name || name.startsWith('.')) throw new FileError('نام فایل معتبر نیست')
  return name
}

async function uniquePath(dir: string, name: string) {
  await fs.mkdir(dir, { recursive: true })
  const dot = name.lastIndexOf('.')
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(dir, n === 1 ? name : `${dot > 0 ? name.slice(0, dot) : name} (${n})${dot > 0 ? name.slice(dot) : ''}`)
    if (!await fs.lstat(candidate).then(() => true, () => false)) return candidate
  }
  throw new FileError('نام آزاد برای فایل پیدا نشد', 409)
}

const relativeOf = (abs: string) => path.relative(filesRoot(), abs).split(path.sep).join('/')

// ------------------------------------------------------------------ resumable uploads

const MAX_UPLOAD = () => Math.max(1, Number(env('UPLOAD_MAX_GB') || 20)) * 1024 ** 3
type Session = { name: string; size: number; section: string; createdAt: number; ownerId?: number }
const sessionFile = (id: string) => path.join(incoming(), `up-${id}.json`)
const partFile = (id: string) => path.join(incoming(), `up-${id}.part`)
const validId = (id: unknown) => { const value = String(id ?? ''); if (!/^[a-f0-9]{32}$/.test(value)) throw new FileError('شناسهٔ بارگذاری نامعتبر است'); return value }

export async function startUpload(input: { name?: unknown; size?: unknown; section?: unknown; ownerId?: number }) {
  const name = cleanFileName(input.name)
  const size = Math.floor(Number(input.size))
  if (!Number.isSafeInteger(size) || size <= 0) throw new FileError('حجم فایل معتبر نیست')
  if (size > MAX_UPLOAD()) throw new FileError(`حداکثر حجم فایل ${env('UPLOAD_MAX_GB') || 20} گیگابایت است`, 413)
  const disk = await fs.statfs(filesRoot()).catch(async () => { await fs.mkdir(filesRoot(), { recursive: true }); return fs.statfs(filesRoot()).catch(() => null) })
  if (disk && size > disk.bavail * disk.bsize) throw new FileError('فضای خالی دیسک سرور کافی نیست', 507)
  const section = SECTIONS.has(String(input.section)) ? String(input.section) : 'general'
  const id = randomBytes(16).toString('hex')
  await fs.mkdir(incoming(), { recursive: true })
  await fs.writeFile(sessionFile(id), JSON.stringify({ name, size, section, createdAt: Date.now(), ownerId: input.ownerId } satisfies Session))
  await fs.writeFile(partFile(id), '')
  return { id, received: 0 }
}

async function session(id: string): Promise<Session> {
  try { return JSON.parse(await fs.readFile(sessionFile(id), 'utf8')) as Session } catch { throw new FileError('این بارگذاری پیدا نشد یا منقضی شده است', 404) }
}

/** Appends one chunk at `offset` (must equal what is already stored; a retry after a lost answer is answered with the real offset). */
export async function appendChunk(idInput: unknown, offsetInput: unknown, body: ReadableStream<Uint8Array> | null, ownerId?: number) {
  const id = validId(idInput)
  const meta = await session(id)
  if (ownerId !== undefined && meta.ownerId !== undefined && meta.ownerId !== ownerId) throw new FileError('این بارگذاری به حساب دیگری تعلق دارد', 403)
  const stat = await fs.stat(partFile(id)).catch(() => null)
  if (!stat) throw new FileError('این بارگذاری پیدا نشد', 404)
  const offset = Number(offsetInput)
  if (offset !== stat.size) return { received: stat.size, mismatch: true }
  if (!body) throw new FileError('داده‌ای ارسال نشد')
  let written = 0
  const limit = meta.size - stat.size
  const source = Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>)
  source.on('data', (chunk: Buffer) => { written += chunk.length; if (written > limit || written > 64 * 1024 * 1024) source.destroy(new FileError('حجم تکه بیش از حد است', 413)) })
  await pipeline(source, createWriteStream(partFile(id), { flags: 'a' }))
  return { received: stat.size + written, mismatch: false }
}

export async function finishUpload(idInput: unknown, ownerId?: number) {
  const id = validId(idInput)
  const meta = await session(id)
  if (ownerId !== undefined && meta.ownerId !== undefined && meta.ownerId !== ownerId) throw new FileError('این بارگذاری به حساب دیگری تعلق دارد', 403)
  const stat = await fs.stat(partFile(id)).catch(() => null)
  if (!stat || stat.size !== meta.size) throw new FileError('فایل کامل بارگذاری نشده است', 409)
  const target = await uniquePath(path.join(filesRoot(), 'uploads', meta.section, month()), meta.name)
  await fs.rename(partFile(id), target)
  await fs.chmod(target, 0o644).catch(() => undefined)
  await fs.rm(sessionFile(id), { force: true })
  const relative = relativeOf(target)
  return { path: relative, url: await publicFileUrl(relative), size: meta.size, name: path.basename(target) }
}

export async function cancelUpload(idInput: unknown, ownerId?: number) {
  const id = validId(idInput)
  const meta = await session(id)
  if (ownerId !== undefined && meta.ownerId !== undefined && meta.ownerId !== ownerId) throw new FileError('این بارگذاری به حساب دیگری تعلق دارد', 403)
  await fs.rm(partFile(id), { force: true }); await fs.rm(sessionFile(id), { force: true })
}

/** Unfinished uploads older than two days are removed. */
export async function pruneUploads() {
  const names = await fs.readdir(incoming()).catch(() => [] as string[])
  for (const name of names.filter((item) => item.startsWith('up-'))) {
    const full = path.join(incoming(), name)
    const stat = await fs.stat(full).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs > 2 * 86_400_000) await fs.rm(full, { force: true })
  }
}

// ------------------------------------------------------------------ serving /files/…

/** GET /files/<path> — files in the download folder (never hidden ones), with range support. */
/** A WebP copy of a stored picture at an allowed width, cached beside the files (a dot folder is never served). */
async function resizedImage(file: string, stat: { size: number; mtimeMs: number }, width: number): Promise<Buffer> {
  const key = createHash('sha256').update(`${file}:${stat.size}:${Math.round(stat.mtimeMs)}:${width}`).digest('hex').slice(0, 40)
  const cached = path.join(filesRoot(), '.resized', `${key}.webp`)
  const hit = await fs.readFile(cached).catch(() => null)
  if (hit) return hit
  const sharp = (await import('sharp')).default
  const out = await sharp(await fs.readFile(file), { animated: true, limitInputPixels: 60_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
  await fs.mkdir(path.dirname(cached), { recursive: true })
  await fs.writeFile(cached, out).catch(() => undefined)
  return out
}

export async function serveLocalFile(req: Request, segments: string[]): Promise<Response> {
  const parts = segments.map((part) => { try { return /%[0-9a-f]{2}/i.test(part) ? decodeURIComponent(part) : part } catch { return part } })
  if (!parts.length || parts.some((part) => !part || part.startsWith('.') || part.includes('/') || part.includes('\\'))) return new Response('not found', { status: 404 })
  const file = path.join(filesRoot(), ...parts)
  if (!file.startsWith(filesRoot() + path.sep)) return new Response('not found', { status: 404 })
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) return new Response('فایل پیدا نشد', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const name = parts[parts.length - 1]
  // A picture asked at an allowed width (?w=320) is served as a cached WebP copy, like the site's covers: imported
  // posters and backdrops are drawn small far more often than they are downloaded.
  const width = Number(new URL(req.url).searchParams.get('w'))
  if ((req.method === 'GET' || req.method === 'HEAD') && IMAGE_WIDTHS.includes(width as (typeof IMAGE_WIDTHS)[number]) && /\.(jpe?g|png|webp|avif)$/i.test(name)) {
    const resized = await resizedImage(file, stat, width).catch(() => null)
    if (resized) return new Response(req.method === 'HEAD' ? null : new Uint8Array(resized), { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(resized.length), 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
  }
  // Files kept here may still carry their source's tags: served from a cleaned copy when the admin switched that on.
  const playable = /\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4|m4v|webm|m3u8|ts|vtt|jpe?g|png|webp|gif|avif|pdf)$/i.test(name)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const { cleanedCopy, serveCleaned } = await import('@/modules/downloads/server/clean')
    // A download waits for its cleaned copy; a player streaming in place uses it once it is ready.
    const download = !playable || new URL(req.url).searchParams.has('dl')
    const cleaned = await cleanedCopy({ file }, name, { title: name.replace(/\.[^.]+$/, '') }, { wait: download && !req.headers.get('range') }).catch(() => null)
    if (cleaned) return serveCleaned(req, cleaned, name, !playable)
  }
  const headers = new Headers({
    'Content-Type': contentTypeFor(name, null), 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString(), ETag: `"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`,
    'Content-Disposition': dispositionFor(name, !playable),
    'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no',
  })
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '')
  let start = 0, end = stat.size - 1, status = 200
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]))
    end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    status = 206
    headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  if (req.method === 'HEAD') return new Response(null, { status, headers })
  const stream = createReadStream(file, { start, end })
  req.signal?.addEventListener('abort', () => stream.destroy())
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
}

// ------------------------------------------------------------------ copying pasted content

/** Small remote resources share the bounded, socket-guarded transport. */
export async function fetchRemoteBytes(raw: string, maxBytes: number, options: { timeoutMs?: number } = {}): Promise<Uint8Array> {
  const { Writable } = await import('node:stream')
  const chunks: Buffer[] = []
  const sink = new Writable({ write(chunk: Buffer, _encoding, done) { chunks.push(chunk); done() } })
  await (await import('./remote')).streamPublicFile(raw, sink, { maxBytes, timeoutMs: options.timeoutMs ?? 60000 })
  return Buffer.concat(chunks)
}
export async function importImage(raw: string): Promise<string> {
  return (await (await import('@/modules/imports/server/media')).importImage(raw)).url
}
export async function importFile(raw: string, section = 'posts', options: { maxBytes?: number; timeoutMs?: number; checkpoint?: () => Promise<void>; canonical?: boolean; destination?: string; name?: string; prepare?: (file: string) => Promise<void> } = {}): Promise<string> {
  const name = cleanFileName(options.name || fileNameOf(raw, 'file'))
  const dir = options.destination ? await (await import('./organization')).organizedDirectory(filesRoot(), options.destination) : path.join(filesRoot(), 'uploads', SECTIONS.has(section) ? section : 'posts', month())
  await fs.mkdir(dir, { recursive: true }); await fs.mkdir(incoming(), { recursive: true })
  const temp = path.join(incoming(), `imp-${randomBytes(12).toString('hex')}`)
  // Unique immutable storage key: logical renaming in the library never changes URLs.
  let target = path.join(dir, `${randomUUID()}-${name}`)
  try {
    await (await import('./remote')).streamPublicFile(raw, createWriteStream(temp, { flags: 'wx', mode: 0o600 }), { ...options, maxBytes: Math.min(options.maxBytes || 512 * 1024 ** 2, MAX_UPLOAD(), 4 * 1024 ** 3) })
    await options.prepare?.(temp)
    await options.checkpoint?.()
    if(options.destination)await (await import('./organization')).organizedDirectory(filesRoot(),options.destination)
    if (options.name) {
      // Atomic exclusive publication: parallel transfers never overwrite a song or a symlink.
      for (let n = 1; ; n++) {
        const dot = name.lastIndexOf('.')
        target = path.join(dir, n === 1 ? name : name.slice(0, dot)+' ('+n+')'+name.slice(dot))
        try { await fs.link(temp, target); break } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 999) throw error }
      }
    } else await fs.rename(temp, target)
    await fs.chmod(target, 0o644)
  } finally { await fs.rm(temp, { force: true }) }
  const relative=options.destination ? `${options.destination}/${path.basename(target)}` : relativeOf(target)
  return options.canonical ? `/files/${relative.split('/').map(encodeURIComponent).join('/')}` : publicFileUrl(relative)
}

export async function organizeCoverImage(url: string, destination: string, checkpoint?:()=>Promise<void>) {
  return (await import('./organization')).copyOrganizedCover(filesRoot(),url,destination,checkpoint)
}

export function logImportFailure(url: string, error: unknown) {
  logEvent('warn', 'content.import_failed', { host: (() => { try { return new URL(url).hostname } catch { return '' } })(), error: String(error instanceof Error ? error.message : error).slice(0, 200) })
}
