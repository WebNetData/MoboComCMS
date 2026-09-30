import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/platform/config/env'
import { ImportFileError, parseFile, type Parsed } from '@/modules/imports/domain/parse'
import { LIMITS } from '@/modules/imports/domain/types'

/**
 * Uploaded import files live outside the public folders (storage/imports),
 * under a random name; the original name is only shown in the history.
 * Parsed files are cached briefly so the wizard's steps do not re-read them.
 */

export const importsRoot = () => path.resolve(env('IMPORTS_ROOT') || path.join(process.cwd(), 'storage', 'imports'))
const KEY = /^[0-9a-f-]{36}\.(json|csv|xlsx)$/

/**
 * Uploads arrive in chunks (the site's middleware caps one request body at
 * 10 MB, so the wizard sends 8 MB pieces, like the admin file uploader).
 * Each chunk is streamed to a private temp file — the byte limit is enforced
 * while reading, not from Content-Length — and appended only at the offset
 * the server already holds. The file is kept only if it parses.
 */
export const UPLOAD_CHUNK = 8 * 1024 * 1024
const TOKEN = /^[0-9a-f-]{36}$/
const tempOf = (token: string) => path.join(importsRoot(), `.incoming-${token}`)

export async function appendUploadChunk(tokenInput: unknown, offsetInput: unknown, body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new ImportFileError('فایلی ارسال نشده است')
  await fs.mkdir(importsRoot(), { recursive: true })
  const offset = Number(offsetInput || 0)
  let token = typeof tokenInput === 'string' ? tokenInput : ''
  if (!token) {
    if (offset !== 0) throw new ImportFileError('بارگذاری باید از ابتدای فایل شروع شود')
    token = randomUUID()
  } else if (!TOKEN.test(token)) throw new ImportFileError('بارگذاری نامعتبر است')
  const file = tempOf(token)
  const current = offset === 0 && !tokenInput ? 0 : (await fs.stat(file).catch(() => null))?.size ?? -1
  if (current < 0) throw new ImportFileError('بارگذاری پیدا نشد؛ دوباره شروع کنید')
  if (current !== offset) throw new ImportFileError('بخش‌های فایل به ترتیب نرسیدند؛ دوباره بارگذاری کنید')
  const out = createWriteStream(file, { flags: offset === 0 ? 'wx' : 'a', mode: 0o600 })
  let size = offset, chunk = 0
  try {
    const reader = body.getReader()
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      chunk += part.value.byteLength
      if (size > LIMITS.uploadBytes || chunk > UPLOAD_CHUNK + 1024) { await reader.cancel().catch(() => undefined); throw new ImportFileError(`حجم فایل بیش از ${LIMITS.uploadBytes / 1024 / 1024} مگابایت است`) }
      if (!out.write(part.value)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())))
  } catch (error) {
    out.destroy()
    // The file goes back to what it held before this chunk, so the same chunk can be sent again.
    if (offset === 0) await fs.rm(file, { force: true })
    else await fs.truncate(file, offset).catch(() => fs.rm(file, { force: true }))
    throw error
  }
  return { token, size }
}

/** The whole upload is in: parse it (validation), keep it under a random key, or throw it away. */
export async function finishUploadFile(tokenInput: unknown, name: string) {
  const token = typeof tokenInput === 'string' && TOKEN.test(tokenInput) ? tokenInput : ''
  if (!token) throw new ImportFileError('بارگذاری نامعتبر است')
  const file = tempOf(token)
  try {
    const bytes = await fs.readFile(file).catch(() => null)
    if (!bytes) throw new ImportFileError('بارگذاری پیدا نشد؛ دوباره شروع کنید')
    if (!bytes.length) throw new ImportFileError('فایل خالی است')
    const parsed = parseFile(name, bytes)
    const fileKey = `${randomUUID()}.${parsed.format}`
    await fs.rename(file, path.join(importsRoot(), fileKey))
    remember(fileKey, '', parsed)
    return { fileKey, hash: createHash('sha256').update(bytes).digest('hex'), parsed, size: bytes.length }
  } finally {
    await fs.rm(file, { force: true })
  }
}

/** Unfinished uploads older than a day. */
export async function pruneIncoming() {
  const names = await fs.readdir(importsRoot()).catch(() => [] as string[])
  for (const name of names.filter((n) => n.startsWith('.incoming-'))) {
    const stat = await fs.stat(path.join(importsRoot(), name)).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs > 86_400_000) await fs.rm(path.join(importsRoot(), name), { force: true })
  }
}

const cache = new Map<string, Parsed>()
function remember(fileKey: string, sheet: string, parsed: Parsed) {
  cache.set(`${fileKey}|${sheet}`, parsed)
  while (cache.size > 4) cache.delete(cache.keys().next().value as string)
}

export async function loadParsed(fileKey: string, fileName: string, sheet = ''): Promise<Parsed> {
  if (!KEY.test(fileKey)) throw new ImportFileError('فایل ورودی پیدا نشد')
  const hit = cache.get(`${fileKey}|${sheet}`)
  if (hit) return hit
  const bytes = await fs.readFile(path.join(importsRoot(), fileKey)).catch(() => null)
  if (!bytes) throw new ImportFileError('فایل ورودی روی سرور پیدا نشد؛ دوباره بارگذاری کنید')
  const parsed = parseFile(fileName || fileKey, bytes, sheet)
  remember(fileKey, sheet, parsed)
  return parsed
}

export async function deleteUpload(fileKey: string) {
  if (!KEY.test(fileKey)) return
  cache.forEach((_value, key) => { if (key.startsWith(`${fileKey}|`)) cache.delete(key) })
  await fs.rm(path.join(importsRoot(), fileKey), { force: true })
}
