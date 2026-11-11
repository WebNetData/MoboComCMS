import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { streamPublicFile } from '@/modules/downloads/server/remote'

/**
 * A remote video copied into a private temporary file over several background jobs, when it cannot be read whole within
 * one (owner 2026-11-12: a 1.7 GB MKV on Arvan storage at about 4 MB/s). Each job continues from the last byte it kept,
 * as byte ranges of the same file (its ETag or date and its size); the copy is removed once its tracks are taken out, or
 * when the look ends any other way. Nothing here is served: the folder is the server's own, under storage/.
 */
const root = () => path.join(process.cwd(), 'storage', 'tmp', 'subtitle-scan')
/** Copies left by a look that never finished (a removed link, a stopped server) are cleared after a day. */
const ABANDONED_MS = 24 * 60 * 60_000
/** Room kept free beside a copy, so a scan never fills the disk the site runs from. */
const MARGIN_BYTES = 2 * 1024 ** 3
/** A copy that needs more runs than this is too slow to finish; the look ends with a note. */
export const MAX_COPY_RUNS = 12
const CONNECTIONS = 6

type Meta = { total: number; validator: string; runs: number }
const names = (linkId: number, key: string) => {
  const base = path.join(root(), `${linkId}-${key.replace(/[^a-f0-9]/g, '')}`)
  return { data: `${base}.part`, meta: `${base}.json` }
}
async function readMeta(file: string): Promise<Meta | null> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<Meta>
    return Number.isSafeInteger(value.total) && (value.total as number) > 0 && typeof value.validator === 'string' && Number.isSafeInteger(value.runs) ? value as Meta : null
  } catch { return null }
}

export async function discardCopy(linkId: number, key: string) {
  const { data, meta } = names(linkId, key)
  await Promise.all([fs.rm(data, { force: true }), fs.rm(meta, { force: true })])
}

/** Whether a copy of this file is under way (its tracks were already seen to be text, so the look goes straight on). */
export async function copyStarted(linkId: number, key: string) { return !!(await readMeta(names(linkId, key).meta)) }

export async function sweepAbandonedCopies(now = Date.now()) {
  const entries = await fs.readdir(root(), { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(part|json)$/.test(entry.name)) continue
    const file = path.join(root(), entry.name)
    const stat = await fs.stat(file).catch(() => null)
    if (stat && now - stat.mtimeMs > ABANDONED_MS) await fs.rm(file, { force: true })
  }
}

export class CopyError extends Error {
  constructor(message: string, readonly reason: 'space' | 'changed' | 'slow' | 'unreadable') { super(message) }
}

/**
 * Continues the copy for at most `timeoutMs`. `done` with the local file when it is whole; otherwise how far it got,
 * for the next job. A copy that cannot continue (the file changed, no room, a host without ranges that is too slow)
 * is removed and a CopyError says why.
 */
export async function continueCopy(url: string, linkId: number, key: string, options: { maxBytes: number; timeoutMs: number; checkpoint?: () => Promise<void> }) {
  const { data, meta } = names(linkId, key)
  await fs.mkdir(root(), { recursive: true, mode: 0o700 })
  const known = await readMeta(meta)
  const kept = known ? (await fs.stat(data).catch(() => null))?.size ?? 0 : 0
  if (known && kept > known.total) { await discardCopy(linkId, key); throw new CopyError('نسخهٔ موقت فایل معتبر نبود', 'unreadable') }
  if (known && kept === known.total) return { done: true as const, file: data, bytes: kept, total: known.total }
  if (known && known.runs >= MAX_COPY_RUNS) { await discardCopy(linkId, key); throw new CopyError('سرعت دریافت از سرور فایل برای خواندن کامل آن خیلی کم است', 'slow') }
  // Starting over: an old copy without its facts cannot be continued.
  if (!known) await fs.rm(data, { force: true })
  await fs.writeFile(meta, JSON.stringify({ total: known?.total || 0, validator: known?.validator || '', runs: (known?.runs || 0) + 1 } satisfies Meta), { mode: 0o600 })
  const sink = createWriteStream(data, { flags: 'a', mode: 0o600 })
  let started = !!known
  try {
    await streamPublicFile(url, sink, {
      maxBytes: options.maxBytes, timeoutMs: options.timeoutMs, checkpoint: options.checkpoint, parallel: CONNECTIONS,
      ...(known && kept > 0 ? { resume: { from: kept, validator: known.validator, total: known.total } } : {}),
      onStart: async file => {
        if (!known) {
          const disk = await fs.statfs(root())
          if (disk.bavail * disk.bsize < file.total + MARGIN_BYTES) throw new CopyError('فضای خالی سرور برای خواندن کامل این فایل کافی نیست', 'space')
        }
        started = true
        await fs.writeFile(meta, JSON.stringify({ total: file.total, validator: file.validator, runs: (known?.runs || 0) + 1 } satisfies Meta), { mode: 0o600 })
      },
    })
  } catch (error) {
    if (!sink.closed) await once(sink, 'close').catch(() => undefined)
    // No room, or over the owner's size limit: the look ends here, said as it is.
    if (error instanceof CopyError || /سقف حجم/.test(String((error as Error)?.message))) { await discardCopy(linkId, key); throw error }
    if ((error as { changed?: boolean }).changed) { await discardCopy(linkId, key); throw new CopyError('فایل روی سرور در میانهٔ خواندن عوض شد؛ دوباره بررسی می‌شود', 'changed') }
    const facts = await readMeta(meta)
    const size = (await fs.stat(data).catch(() => null))?.size ?? 0
    // A host without byte ranges cannot be continued: what one job could not read, the next cannot either.
    if (!started || !facts?.total) {
      await discardCopy(linkId, key)
      if ((error as Error)?.name === 'AbortError') throw new CopyError('سرعت دریافت از سرور فایل برای خواندن کامل آن کم است و این سرور ادامهٔ دریافت را پشتیبانی نمی‌کند', 'slow')
      throw new CopyError('فایل کامل از سرور دانلود دریافت نشد', 'unreadable')
    }
    if (size > facts.total) { await discardCopy(linkId, key); throw new CopyError('نسخهٔ موقت فایل معتبر نبود', 'unreadable') }
    return { done: size === facts.total, file: data, bytes: size, total: facts.total }
  }
  if (!sink.closed) await once(sink, 'close').catch(() => undefined)
  const facts = await readMeta(meta)
  const size = (await fs.stat(data).catch(() => null))?.size ?? 0
  // A host without ranges was read whole in one go: its size is what arrived.
  const total = facts?.total || size
  if (!facts?.total) await fs.writeFile(meta, JSON.stringify({ total, validator: '', runs: 1 } satisfies Meta), { mode: 0o600 })
  return { done: size === total, file: data, bytes: size, total }
}
