import dns from 'node:dns/promises'
import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { db } from '@/platform/database/prisma'
import { env } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { contentTypeFor, dispositionFor, fileNameOf } from '@/modules/downloads/domain/mask'

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
type Session = { name: string; size: number; section: string; createdAt: number }
const sessionFile = (id: string) => path.join(incoming(), `up-${id}.json`)
const partFile = (id: string) => path.join(incoming(), `up-${id}.part`)
const validId = (id: unknown) => { const value = String(id ?? ''); if (!/^[a-f0-9]{32}$/.test(value)) throw new FileError('شناسهٔ بارگذاری نامعتبر است'); return value }

export async function startUpload(input: { name?: unknown; size?: unknown; section?: unknown }) {
  const name = cleanFileName(input.name)
  const size = Math.floor(Number(input.size))
  if (!Number.isSafeInteger(size) || size <= 0) throw new FileError('حجم فایل معتبر نیست')
  if (size > MAX_UPLOAD()) throw new FileError(`حداکثر حجم فایل ${env('UPLOAD_MAX_GB') || 20} گیگابایت است`, 413)
  const disk = await fs.statfs(filesRoot()).catch(async () => { await fs.mkdir(filesRoot(), { recursive: true }); return fs.statfs(filesRoot()).catch(() => null) })
  if (disk && size > disk.bavail * disk.bsize) throw new FileError('فضای خالی دیسک سرور کافی نیست', 507)
  const section = SECTIONS.has(String(input.section)) ? String(input.section) : 'general'
  const id = randomBytes(16).toString('hex')
  await fs.mkdir(incoming(), { recursive: true })
  await fs.writeFile(sessionFile(id), JSON.stringify({ name, size, section, createdAt: Date.now() } satisfies Session))
  await fs.writeFile(partFile(id), '')
  return { id, received: 0 }
}

async function session(id: string): Promise<Session> {
  try { return JSON.parse(await fs.readFile(sessionFile(id), 'utf8')) as Session } catch { throw new FileError('این بارگذاری پیدا نشد یا منقضی شده است', 404) }
}

/** Appends one chunk at `offset` (must equal what is already stored; a retry after a lost answer is answered with the real offset). */
export async function appendChunk(idInput: unknown, offsetInput: unknown, body: ReadableStream<Uint8Array> | null) {
  const id = validId(idInput)
  const meta = await session(id)
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

export async function finishUpload(idInput: unknown) {
  const id = validId(idInput)
  const meta = await session(id)
  const stat = await fs.stat(partFile(id)).catch(() => null)
  if (!stat || stat.size !== meta.size) throw new FileError('فایل کامل بارگذاری نشده است', 409)
  const target = await uniquePath(path.join(filesRoot(), 'uploads', meta.section, month()), meta.name)
  await fs.rename(partFile(id), target)
  await fs.chmod(target, 0o644).catch(() => undefined)
  await fs.rm(sessionFile(id), { force: true })
  const relative = relativeOf(target)
  return { path: relative, url: await publicFileUrl(relative), size: meta.size, name: path.basename(target) }
}

export async function cancelUpload(idInput: unknown) {
  const id = validId(idInput)
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
export async function serveLocalFile(req: Request, segments: string[]): Promise<Response> {
  const parts = segments.map((part) => { try { return /%[0-9a-f]{2}/i.test(part) ? decodeURIComponent(part) : part } catch { return part } })
  if (!parts.length || parts.some((part) => !part || part.startsWith('.') || part.includes('/') || part.includes('\\'))) return new Response('not found', { status: 404 })
  const file = path.join(filesRoot(), ...parts)
  if (!file.startsWith(filesRoot() + path.sep)) return new Response('not found', { status: 404 })
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) return new Response('فایل پیدا نشد', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const name = parts[parts.length - 1]
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

const PRIVATE = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd]|fe[89ab])/i

async function publicHost(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FileError('فقط نشانی http و https')
  if (env('DOWNLOADS_ALLOW_PRIVATE') === '1') return
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((item) => item.address)
  if (!addresses.length || addresses.some((ip) => PRIVATE.test(ip.replace(/^::ffff:/, '')))) throw new FileError('این نشانی مجاز نیست')
}

async function fetchRemote(raw: string, maxBytes: number) {
  let url = new URL(raw)
  for (let hop = 0; hop < 5; hop++) {
    await publicHost(url)
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MoboComImporter/1.0)', Accept: '*/*', Referer: `${url.origin}/` }, signal: AbortSignal.timeout(60_000), cache: 'no-store' })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { await response.body?.cancel().catch(() => undefined); url = new URL(response.headers.get('location') as string, url); continue }
    if (!response.ok || !response.body) throw new FileError(`دریافت نشد (${response.status})`)
    const declared = Number(response.headers.get('content-length')) || 0
    if (declared > maxBytes) { await response.body.cancel().catch(() => undefined); throw new FileError('فایل بزرگ‌تر از سقف کپی خودکار است', 413) }
    return { response, url }
  }
  throw new FileError('انتقال بیش از حد')
}

/** Copies a remote image into the content images (WebP, max 2400px) and returns its address on this site. */
export async function importImage(raw: string): Promise<string> {
  const { response } = await fetchRemote(raw, 25 * 1024 * 1024)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 25 * 1024 * 1024) throw new FileError('تصویر بیش از حد بزرگ است', 413)
  const sharp = (await import('sharp')).default
  const image = sharp(buffer, { animated: true, limitInputPixels: 80_000_000 })
  const meta = await image.metadata().catch(() => null)
  if (!meta?.format) throw new FileError('فایل تصویر معتبر نیست')
  const out = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer()
  const file = `${randomUUID()}.webp`
  const dir = path.join(process.cwd(), 'storage', 'covers')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, file), out, { flag: 'wx' })
  return `/api/media/covers/${file}`
}

/** Copies a remote file (archive, audio, video, document…) into the download folder. */
export async function importFile(raw: string, section = 'posts'): Promise<string> {
  const { response, url } = await fetchRemote(raw, Math.min(MAX_UPLOAD(), 4 * 1024 ** 3))
  const name = cleanFileName(fileNameOf(url.toString(), 'file'))
  const target = await uniquePath(path.join(filesRoot(), 'uploads', SECTIONS.has(section) ? section : 'posts', month()), name)
  const temp = path.join(incoming(), `imp-${randomBytes(8).toString('hex')}`)
  await fs.mkdir(incoming(), { recursive: true })
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(temp))
    await fs.rename(temp, target)
  } finally { await fs.rm(temp, { force: true }) }
  return publicFileUrl(relativeOf(target))
}

export function logImportFailure(url: string, error: unknown) {
  logEvent('warn', 'content.import_failed', { host: (() => { try { return new URL(url).hostname } catch { return '' } })(), error: String(error instanceof Error ? error.message : error).slice(0, 200) })
}
