import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { logEvent } from '@/platform/observability/logger'
import { getSettings } from '@/modules/settings/server'
import { getDownloadSettings } from '@/modules/downloads/server/guard'
import { archiveJunk, buildId3, cleanKindOf, ffmpegArgs, id3v2Size, isNoteFile, trailingTagSize, type CleanKind } from '@/modules/downloads/domain/filemeta'
import { contentTypeFor, dispositionFor } from '@/modules/downloads/domain/mask'
import type { DownloadSettings } from '@/modules/downloads/domain/downloads'

/**
 * Cleaned copies of downloaded files. When the admin switches it on for a kind
 * of file, the first download fetches the file once, rewrites what the source
 * left inside it (MP3 tags and cover, video title and comments, shortcut and
 * "visit our site" files in archives) and keeps the result on this server;
 * later downloads are served from that copy, with range support. A file that
 * is not ready in time, too large or fails is passed through unchanged.
 */

/** Details written into the cleaned file. */
export type FileTags = { title?: string; artist?: string; album?: string; cover?: string }
type Source = { url: string } | { file: string }

const root = () => path.join(process.cwd(), 'storage', 'clean-cache')
const temp = () => path.join(root(), '.tmp')
const WAIT_MS: Record<CleanKind, number> = { audio: 60_000, video: 45_000, archive: 45_000 }
const FAIL_RETRY_MS = 6 * 3600_000

type Registry = { jobs: Map<string, Promise<string | null>>; failed: Map<string, number>; running: number; queue: (() => void)[] }
const g = globalThis as typeof globalThis & { cleanRegistry?: Registry }
const registry: Registry = g.cleanRegistry ??= { jobs: new Map(), failed: new Map(), running: 0, queue: [] }

export const enabledFor = (settings: DownloadSettings, kind: CleanKind | null) =>
  kind === 'audio' ? settings.cleanAudio : kind === 'video' ? settings.cleanVideo : kind === 'archive' ? settings.cleanArchive : false

async function siteInfo() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return { brand: settings.brandName || '', url: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}

/** Same file + same cleaning → same cached copy. Signed/expiring query strings are not part of the key. */
function cacheKey(source: Source, tags: FileTags, settings: DownloadSettings) {
  let id = 'file' in source ? `file:${source.file}` : source.url
  if ('url' in source) { try { const url = new URL(source.url); id = `${url.origin}${url.pathname}` } catch { /* keep */ } }
  return createHash('sha256').update(JSON.stringify([id, tags, settings.scrubWords, settings.tagComment, 'v1'])).digest('hex').slice(0, 40)
}

async function slot() {
  if (registry.running < 2) { registry.running++; return }
  await new Promise<void>((resolve) => registry.queue.push(resolve))
  registry.running++
}
function release() {
  registry.running--
  registry.queue.shift()?.()
}

/** Runs a tool with no terminal: stdin is closed (or fed `input`), so nothing can wait for a password prompt. */
const run = (command: string, args: string[], timeoutMs: number, input?: string) => new Promise<string>((resolve, reject) => {
  const child = spawn(command, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
  let out = '', size = 0
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  child.stdout?.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 16 * 1024 * 1024) out += chunk.toString('utf8') })
  child.stderr?.resume()
  child.on('error', (error) => { clearTimeout(timer); reject(error) })
  child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error(`${command} exited ${code}`)) })
  if (input !== undefined) child.stdin?.end(input)
})

/** Which external tools this server has (video needs ffmpeg, archives need 7z). */
export async function cleanTools() {
  const has = async (command: string, args: string[]) => run(command, args, 10_000).then(() => true, () => false)
  const [ffmpeg, sevenZip, zip] = await Promise.all([has('ffmpeg', ['-version']), has('7z', ['i']), has('zip', ['-v'])])
  return { ffmpeg, sevenZip, zip }
}

// ------------------------------------------------------------------ cleaners

async function coverJpeg(cover?: string): Promise<Uint8Array | null> {
  const match = /^\/api\/media\/covers\/([\w-]+\.(?:webp|jpe?g|png))$/.exec(cover || '')
  if (!match) return null
  try {
    const sharp = (await import('sharp')).default
    return await sharp(path.join(process.cwd(), 'storage', 'covers', match[1])).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  } catch { return null }
}

async function cleanMp3(input: string, output: string, tags: FileTags, settings: DownloadSettings) {
  const handle = await fs.open(input, 'r')
  try {
    const { size } = await handle.stat()
    let start = 0
    const head = Buffer.alloc(10)
    for (let i = 0; i < 8 && start < size; i++) {
      await handle.read(head, 0, 10, start)
      const tag = id3v2Size(head)
      if (!tag) break
      start += tag
    }
    const tailLength = Math.min(size - start, 4096)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)
    const end = size - trailingTagSize(tail)
    if (end <= start) throw new Error('no audio after the tags')
    const site = await siteInfo()
    const tag = buildId3({ ...tags, comment: settings.tagComment, url: site.url }, await coverJpeg(tags.cover))
    const out = createWriteStream(output)
    await new Promise<void>((resolve, reject) => { out.write(Buffer.from(tag), (error) => (error ? reject(error) : resolve())) })
    await pipeline(createReadStream(input, { start, end: end - 1 }), out)
  } finally { await handle.close() }
}

async function cleanVideo(input: string, output: string, tags: FileTags, settings: DownloadSettings) {
  await run('ffmpeg', ffmpegArgs(input, output, { title: tags.title, comment: settings.tagComment }), 30 * 60_000)
}

async function cleanArchive(input: string, output: string, settings: DownloadSettings) {
  await fs.copyFile(input, output)
  const listing = await run('7z', ['l', '-slt', '-ba', '-p_', output], 120_000)
  const entries: { path: string; size: number; folder: boolean; encrypted: boolean }[] = []
  for (const block of listing.split(/\r?\n\r?\n/)) {
    const field = (name: string) => new RegExp(`^${name} = (.*)$`, 'm').exec(block)?.[1] ?? ''
    const entryPath = field('Path')
    if (entryPath) entries.push({ path: entryPath, size: Number(field('Size')) || 0, folder: field('Folder') === '+', encrypted: field('Encrypted') === '+' })
  }
  const files = entries.filter((entry) => !entry.folder)
  const withText = await Promise.all(files.map(async (entry) => ({
    path: entry.path,
    text: isNoteFile(entry.path) && !entry.encrypted && entry.size < 256 * 1024 ? await run('7z', ['e', '-so', '-p_', output, '--', entry.path], 60_000).catch(() => '') : '',
  })))
  const junk = archiveJunk(withText, settings.scrubWords)
  // '-p_' is a dummy password: plain archives ignore it; encrypted ones fail instead of waiting for input.
  // Never empty an archive: when everything looks like junk it is kept whole.
  if (junk.length && junk.length < files.length) await run('7z', ['d', '-p_', output, '--', ...junk], 10 * 60_000)
  if (/\.zip$/i.test(output)) await run('zip', ['-z', '-q', output], 60_000, '').catch(() => undefined)
}

// ------------------------------------------------------------------ cache

async function fetchTo(url: string, file: string, maxBytes: number) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' }, redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20 * 60_000) })
  if (!response.ok || !response.body) throw new Error(`upstream ${response.status}`)
  const declared = Number(response.headers.get('content-length')) || 0
  if (declared > maxBytes) { await response.body.cancel().catch(() => undefined); throw new Error('too large') }
  let seen = 0
  const limit = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { seen += chunk.byteLength; if (seen > maxBytes) controller.error(new Error('too large')); else controller.enqueue(chunk) },
  })
  await pipeline(Readable.fromWeb(response.body.pipeThrough(limit) as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(file))
}

async function evict(capBytes: number) {
  const names = await fs.readdir(root()).catch(() => [] as string[])
  const files = (await Promise.all(names.filter((name) => !name.startsWith('.')).map(async (name) => {
    const stat = await fs.stat(path.join(root(), name)).catch(() => null)
    return stat?.isFile() ? { name, size: stat.size, used: stat.mtimeMs } : null
  }))).filter((item): item is { name: string; size: number; used: number } => !!item).sort((a, b) => a.used - b.used)
  let total = files.reduce((sum, item) => sum + item.size, 0)
  for (const item of files) {
    if (total <= capBytes) break
    await fs.rm(path.join(root(), item.name), { force: true })
    total -= item.size
  }
}

async function build(key: string, source: Source, kind: CleanKind, ext: string, tags: FileTags, settings: DownloadSettings): Promise<string | null> {
  await slot()
  const work = path.join(temp(), `${key}-${randomBytes(4).toString('hex')}`)
  const final = path.join(root(), `${key}.${ext}`)
  try {
    await fs.mkdir(temp(), { recursive: true })
    const maxBytes = settings.cleanMaxMb * 1024 * 1024
    let input = `${work}.src.${ext}`
    if ('file' in source) {
      const stat = await fs.stat(source.file)
      if (stat.size > maxBytes) throw new Error('too large')
      input = source.file
    } else await fetchTo(source.url, input, maxBytes)
    const output = `${work}.out.${ext}`
    if (kind === 'audio') await cleanMp3(input, output, tags, settings)
    else if (kind === 'video') await cleanVideo(input, output, tags, settings)
    else await cleanArchive(input, output, settings)
    await fs.rename(output, final)
    await evict(settings.cleanCacheGb * 1024 ** 3)
    logEvent('info', 'downloads.clean_ready', { kind, key })
    return final
  } catch (error) {
    registry.failed.set(key, Date.now())
    logEvent('warn', 'downloads.clean_failed', { kind, error: String(error instanceof Error ? error.message : error).slice(0, 200) })
    return null
  } finally {
    release()
    registry.jobs.delete(key)
    for (const suffix of [`.src.${ext}`, `.out.${ext}`]) await fs.rm(`${work}${suffix}`, { force: true }).catch(() => undefined)
  }
}

/**
 * The cleaned copy of a file, or null when it is not cleaned (switched off,
 * failed recently, or not ready within the wait — the job then continues so
 * the next download gets it). `wait: false` only uses a copy that is ready.
 */
export async function cleanedCopy(source: Source, name: string, tags: FileTags, options: { wait?: boolean } = {}): Promise<string | null> {
  const kind = cleanKindOf(name)
  const settings = await getDownloadSettings()
  if (!kind || !enabledFor(settings, kind)) return null
  const ext = (name.split('.').pop() || '').toLowerCase()
  const key = cacheKey(source, tags, settings)
  const final = path.join(root(), `${key}.${ext}`)
  if (await fs.stat(final).then((stat) => stat.isFile(), () => false)) {
    const now = new Date()
    await fs.utimes(final, now, now).catch(() => undefined)
    return final
  }
  if (Date.now() - (registry.failed.get(key) || 0) < FAIL_RETRY_MS) return null
  let job = registry.jobs.get(key)
  if (!job) { job = build(key, source, kind, ext, tags, settings); registry.jobs.set(key, job) }
  // Players streaming in place never wait; they get the cleaned copy once it exists.
  if (options.wait === false) return null
  return Promise.race([job, new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS[kind]))])
}

/** Serves a cleaned copy under the visitor's file name, with range requests. */
export async function serveCleaned(req: Request, file: string, name: string, download: boolean): Promise<Response> {
  const stat = await fs.stat(file)
  const headers = new Headers({
    'Content-Type': contentTypeFor(name, null), 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString(), ETag: `"c-${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`,
    'Content-Disposition': dispositionFor(name, download), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Accel-Buffering': 'no',
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

/** Size of the cleaned-copy store, for the admin page. */
export async function cleanCacheStats() {
  const names = (await fs.readdir(root()).catch(() => [] as string[])).filter((name) => !name.startsWith('.'))
  let bytes = 0
  for (const name of names) bytes += (await fs.stat(path.join(root(), name)).catch(() => null))?.size || 0
  return { files: names.length, bytes, working: registry.jobs.size }
}

export async function clearCleanCache() {
  const names = (await fs.readdir(root()).catch(() => [] as string[])).filter((name) => !name.startsWith('.'))
  for (const name of names) await fs.rm(path.join(root(), name), { force: true })
  registry.failed.clear()
  return { removed: names.length }
}
