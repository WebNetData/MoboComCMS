import fs from 'node:fs/promises'
import path from 'node:path'
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash, randomBytes } from 'node:crypto'
import { dispositionFor } from '@/modules/downloads/domain/mask'

/** Private Media blobs are outside every public Library/download root. Back up the existing storage tree. */
const root = () => path.resolve(process.cwd(), 'storage', 'private-media')
const validKey = (key: string) => { if (!/^[a-f0-9]{48}$/.test(key)) throw new Error('Invalid private media reference'); return key }
export class PrivateFileError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export const privateFilename = (raw: string) => path.basename(String(raw).replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'download.bin'

export async function writePrivateFile(source: Readable, options: { maxBytes: number; signal?: AbortSignal }) {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 })
  const key = randomBytes(24).toString('hex'), file = path.join(root(), key), hash = createHash('sha256')
  let bytes = 0
  const limit = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; if (bytes > options.maxBytes) return done(new PrivateFileError('حجم فایل از سقف کتابخانه بیشتر است', 413)); hash.update(chunk); done(null, chunk) } })
  try {
    await pipeline(source, limit, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: options.signal })
    if (!bytes) throw new PrivateFileError('فایل خالی است')
    return { storageKey: key, sizeBytes: BigInt(bytes), sha256: hash.digest('hex') }
  } catch (error) { await fs.unlink(file).catch(() => undefined); throw error }
}

/** Only for a blob newly allocated by a failed command, never for deleting a customer's attachment. */
export async function discardPrivateFile(key: string) { await fs.unlink(path.join(root(), validKey(key))).catch(() => undefined) }
export const privateRequestSource = (body: ReadableStream<Uint8Array> | null) => { if (!body) throw new PrivateFileError('فایلی ارسال نشد'); return Readable.fromWeb(body as import('node:stream/web').ReadableStream) }
export const privateLocalSource = async (file: string) => (await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))).createReadStream()

/** Caller must first recheck its domain entitlement; a storage key is never a public capability. */
export async function servePrivateFile(req: Request, file: { storageKey: string; filename: string; sizeBytes: bigint }) {
  const key = validKey(file.storageKey), target = path.join(root(), key), realRoot = await fs.realpath(root()).catch(() => null)
  const real = await fs.realpath(target).catch(() => null)
  if (!realRoot || !real || !real.startsWith(realRoot + path.sep) || (await fs.lstat(target)).isSymbolicLink()) throw new PrivateFileError('فایل در دسترس نیست', 404)
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)), info = await handle.stat()
  if (!info.isFile() || BigInt(info.size) !== file.sizeBytes) { await handle.close(); throw new PrivateFileError('فایل در دسترس نیست', 404) }
  const headers = new Headers({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': dispositionFor(privateFilename(file.filename), true), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Accept-Ranges': 'bytes', 'Content-Security-Policy': 'sandbox' })
  let start = 0, end = info.size - 1, status = 200
  const range = req.headers.get('range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match && (match[1] || match[2])) {
      if (!match[1]) { const suffix = Number(match[2]); start = suffix > 0 ? Math.max(0, info.size - suffix) : info.size }
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
    } else start = info.size
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) { await handle.close(); headers.set('Content-Range', `bytes */${info.size}`); return new Response(null, { status: 416, headers }) }
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  if (req.method === 'HEAD') { await handle.close(); return new Response(null, { status, headers }) }
  const stream = handle.createReadStream({ start, end, autoClose: true })
  const abort = () => stream.destroy()
  req.signal.addEventListener('abort', abort, { once: true }); stream.once('close', () => req.signal.removeEventListener('abort', abort))
  if (req.signal.aborted) stream.destroy()
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
}
