import { db } from '@/platform/database/prisma'
import { enqueue } from '@/modules/operations/server/enqueue'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { playbackKind } from '@/modules/media/domain/media'
import { readScan, scanSettled, type SubtitleScan } from '@/modules/media/domain/found-subtitles'
import { mediaInfo, type MediaInfo } from '@/modules/media/domain/media-info'
import { textCodec } from '@/modules/media/domain/matroska'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { FOUND_KINDS, FOUND_OWNERS, scanDedupe, scanKey } from './request'
import { sidecarSubtitles, type Found } from './sidecar'
import { SIZE_NOTE, embeddedSubtitles, embeddedTracks } from './embedded'
import { CopyError, continueCopy, copyStarted, discardCopy, lineProgress, sweepAbandonedCopies } from './copy'
import { indexedSubtitles } from './indexed'
import { videoSource } from './source'

/** Under the queue's ten-minute stale-lease limit, so a long read is never handed to a second runner. */
const SCAN_BUDGET_MS = 9 * 60_000
const GB = 1024 ** 3
/** Time left in a job below which a whole copy is handed to the next job for its tracks, rather than started on. */
const EXTRACT_MS = 2 * 60_000
/** Jobs a read through a file's index may take before it gives what is whole. */
const MAX_INDEX_RUNS = 20
const percent = (bytes: number, total: number) => Math.min(99, Math.floor((bytes / Math.max(1, total)) * 100)).toLocaleString('fa-IR')

type Job = { checkpoint: () => Promise<void>; continueWith: (kind: string, payload: Record<string, unknown>, options?: { dedupeKey?: string }) => Promise<unknown> }

/** Records what one look found, replacing what the previous look at this file found — unless the address changed meanwhile. */
async function record(linkId: number, key: string, scan: Omit<SubtitleScan, 'key' | 'at'>, found: Found[]) {
  return db.$transaction(async tx => {
    const link = await tx.mediaLink.findUnique({ where: { id: linkId }, select: { url: true } })
    if (!link || scanKey(link.url) !== key) return false
    await tx.mediaLinkSubtitle.deleteMany({ where: { linkId } })
    if (found.length) await tx.mediaLinkSubtitle.createMany({ data: found.map(row => ({ linkId, ...row })) })
    await tx.mediaLink.update({ where: { id: linkId }, data: { subtitleScan: JSON.stringify({ key, ...scan, at: new Date().toISOString() } satisfies SubtitleScan) } })
    return true
  })
}

/** A file being copied over several jobs: its progress on the link, so a page view does not start a second copy. */
async function recordReading(linkId: number, key: string, bytes: number, total: number, media: MediaInfo | undefined, note = `در حال خواندن کامل فایل برای زیرنویس داخل آن (${percent(bytes, total)}٪)`) {
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { url: true } })
  if (!link || scanKey(link.url) !== key) return false
  const scan: SubtitleScan = { key, status: 'reading', found: 0, notes: [note], at: new Date().toISOString(), read: { bytes, total }, ...(media ? { media } : {}) }
  await db.mediaLink.update({ where: { id: linkId }, data: { subtitleScan: JSON.stringify(scan) } })
  return true
}

/**
 * media.subtitle-scan — subtitles beside and inside one film or episode file. A remote file with text tracks is copied
 * in parts (copy.ts) over as many jobs as its host's speed needs; each job continues the copy and queues the next.
 */
export async function runSubtitleScan(payload: Record<string, unknown>, job: Job) {
  const linkId = Number(payload.linkId), key = String(payload.key || '')
  if (!Number.isSafeInteger(linkId) || linkId <= 0 || !/^[a-f0-9]{16}$/.test(key)) throw new Error('Invalid subtitle scan request')
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { id: true, url: true, kind: true, ownerType: true, ownerId: true, disabled: true } })
  if (!link || scanKey(link.url) !== key) return { linkId, skipped: 'changed' }
  // A copy under way belongs to its own chain of jobs; another look waits until it has stopped moving.
  const current = await db.mediaLink.findUnique({ where: { id: linkId }, select: { subtitleScan: true } })
  const scanNow = readScan(current?.subtitleScan || '')
  if (payload.part === undefined && scanNow?.status === 'reading' && scanSettled(scanNow, key)) return { linkId, skipped: 'reading' }
  if (link.disabled || !(FOUND_OWNERS as readonly string[]).includes(link.ownerType) || !(FOUND_KINDS as readonly string[]).includes(link.kind)) return { linkId, skipped: 'not-a-video' }
  const settings = await getCinemaSettings(true)
  if (!settings.findSubtitles) return { linkId, skipped: 'off' }
  const playback = playbackKind(link.url, link.kind, toEmbedUrl)
  if (playback !== 'video' && playback !== 'maybe') {
    await record(linkId, key, { status: 'done', found: 0, notes: ['این لینک فایل ویدئویی مستقیم نیست'] }, [])
    return { linkId, found: 0 }
  }
  const deadline = Date.now() + SCAN_BUDGET_MS
  const notes: string[] = []
  try {
    const source = await videoSource(link.url)
    if (!source) {
      await record(linkId, key, { status: 'failed', found: 0, notes: ['فایل در کتابخانه یا سرور دانلود پیدا نشد'] }, [])
      return { linkId, found: 0 }
    }
    const maxBytes = settings.subtitleScanMaxGB * GB
    await sweepAbandonedCopies().catch(() => undefined)
    let embedded: Found[] = []
    // What the file holds (its track list), when it was read for the subtitles: shown beside the link.
    let media: MediaInfo | undefined
    // Switched off: only files beside the video; nothing is read whole and a copy under way is dropped.
    if (settings.readEmbeddedSubtitles === false) await discardCopy(linkId, key)
    // Read by the viewer's browser: the server takes only the track list (the file's start) for the link's notes.
    else if (settings.embeddedInBrowser !== false) {
      await discardCopy(linkId, key)
      if (source.kind === 'remote') await indexedSubtitles(source, { deadline, tracksOnly: true, onTracks: tracks => { media = mediaInfo(tracks, tracks.filter(t => { const f = textCodec(t.codec); return f && f !== 'image' }).map(t => t.language)) } }, notes)
    }
    else if (source.kind === 'remote') {
      // Through the file's own index first: only its subtitle lines are read (about 2 MB for a film).
      const resumed = await copyStarted(linkId, key)
      const part = Number(payload.part || 0)
      const indexed = resumed ? null : await indexedSubtitles(source, { deadline, progress: lineProgress(linkId, key), final: part >= MAX_INDEX_RUNS, onTracks: tracks => { media = mediaInfo(tracks, tracks.filter(t => { const f = textCodec(t.codec); return f && f !== 'image' }).map(t => t.language)) } }, notes)
      if (indexed && 'pending' in indexed) {
        // Read in part: the next job continues from the lines this one kept.
        if (!await recordReading(linkId, key, indexed.pending.done, indexed.pending.total, media, `در حال خواندن زیرنویس‌های داخل فایل از روی فهرست آن (${percent(indexed.pending.done, indexed.pending.total)}٪)`)) { await discardCopy(linkId, key); return { linkId, skipped: 'changed' } }
        await job.continueWith('media.subtitle-scan', { linkId, key, part: part + 1 }, { dedupeKey: `${scanDedupe(linkId, key)}:part:${part + 1}` })
        return { linkId, reading: indexed.pending.done, total: indexed.pending.total }
      }
      // The index look is over (its saved lines go); a whole-file copy under way is left to its own jobs.
      if (!resumed) await discardCopy(linkId, key)
      if (indexed) embedded = indexed
      else if (settings.fullReadSubtitles !== true) {
        await discardCopy(linkId, key)
        notes.push('زیرنویس داخل این فایل بدون دریافت کل فایل خوانده نمی‌شود و دریافت کامل در تنظیمات خاموش است؛ فایل زیرنویس را کنار ویدئو بگذارید')
      }
      // Allowed by the owner: the track list (the file's start), and the whole file copied only when it holds text subtitles.
      else if (resumed || (await embeddedTracks(source, maxBytes, notes)).length) {
        try {
          const copy = await continueCopy(source.sign(source.url), linkId, key, { maxBytes, timeoutMs: Math.max(30_000, deadline - Date.now() - EXTRACT_MS), checkpoint: job.checkpoint })
          if (!copy.done || deadline - Date.now() < EXTRACT_MS) {
            if (!await recordReading(linkId, key, copy.bytes, copy.total, media)) { await discardCopy(linkId, key); return { linkId, skipped: 'changed' } }
            const part = Number(payload.part || 0) + 1
            await job.continueWith('media.subtitle-scan', { linkId, key, part }, { dedupeKey: `${scanDedupe(linkId, key)}:part:${part}` })
            return { linkId, reading: copy.bytes, total: copy.total }
          }
          try { embedded = await embeddedSubtitles({ kind: 'local', url: source.url, file: copy.file }, { maxBytes, deadline }, notes) } finally { await discardCopy(linkId, key) }
        } catch (error) {
          if (error instanceof CopyError && error.reason === 'space') {
            // No room for a copy: read it straight through in this job, as far as its time allows.
            notes.push(error.message)
            embedded = await embeddedSubtitles(source, { maxBytes, deadline }, notes)
          } else if (error instanceof CopyError) notes.push(error.message)
          else if (/سقف حجم/.test(String((error as Error)?.message))) notes.push(SIZE_NOTE)
          else throw error
        }
      }
    } else embedded = await embeddedSubtitles(source, { maxBytes, deadline }, notes)
    await job.checkpoint()
    // A subtitle file the editor already added as its own link is not offered twice.
    const manual = await db.mediaLink.findMany({ where: { ownerType: link.ownerType, ownerId: link.ownerId, kind: 'SUBTITLE' }, select: { url: true } })
    const sidecars = await sidecarSubtitles(source, new Set(manual.map(row => row.url)), notes)
    await job.checkpoint()
    const found = [...sidecars, ...embedded]
    await record(linkId, key, { status: 'done', found: found.length, notes: notes.slice(0, 6), ...(media ? { media } : {}) }, found)
    return { linkId, found: found.length, sidecar: sidecars.length, embedded: embedded.length }
  } catch (error) {
    // A lease that changed belongs to another runner; anything else is this file's answer until it is looked at again.
    if (/lease/i.test(String((error as Error)?.message))) throw error
    await discardCopy(linkId, key).catch(() => undefined)
    await record(linkId, key, { status: 'failed', found: 0, notes: [...notes, 'بررسی این فایل کامل نشد'].slice(0, 6) }, [])
    return { linkId, found: 0, failed: true }
  }
}

/** media.subtitle-backfill — queues a look at every film and episode file, a page at a time; `again` also repeats finished ones. */
export async function runSubtitleBackfill(payload: Record<string, unknown>, job: Job) {
  const cursor = Math.max(0, Number(payload.cursor) || 0), again = payload.again === true, run = String(payload.run || '')
  if (!/^[a-z0-9]{1,24}$/.test(run)) throw new Error('Invalid subtitle backfill request')
  const rows = await db.mediaLink.findMany({ where: { id: { gt: cursor }, ownerType: { in: [...FOUND_OWNERS] }, kind: { in: [...FOUND_KINDS] }, disabled: false }, orderBy: { id: 'asc' }, take: 200, select: { id: true, url: true, kind: true, subtitleScan: true } })
  let queued = 0
  for (const row of rows) {
    const playback = playbackKind(row.url, row.kind, toEmbedUrl)
    if (playback !== 'video' && playback !== 'maybe') continue
    const key = scanKey(row.url)
    const scanNow = readScan(row.subtitleScan)
    if (!again && scanSettled(scanNow, key)) continue
    // A copy under way is left to its own jobs, even when everything is looked at again.
    if (again && scanNow?.status === 'reading' && scanSettled(scanNow, key)) continue
    await enqueue('media.subtitle-scan', { linkId: row.id, key }, { dedupeKey: scanDedupe(row.id, key) })
    queued++
  }
  await job.checkpoint()
  const next = rows.at(-1)?.id
  if (rows.length === 200 && next) await job.continueWith('media.subtitle-backfill', { cursor: next, again, run }, { dedupeKey: `media-subtitle-backfill:${run}:${next}` })
  return { queued, cursor: next ?? cursor, done: rows.length < 200 }
}

/** What Admin sees: how many film and episode files were looked at, what was found and what waits. */
export async function foundSubtitleStatus() {
  const where = { ownerType: { in: [...FOUND_OWNERS] }, kind: { in: [...FOUND_KINDS] }, disabled: false }
  const [links, withSubtitles, tracks, waiting] = await Promise.all([
    db.mediaLink.findMany({ where, select: { subtitleScan: true, url: true } }),
    db.mediaLinkSubtitle.groupBy({ by: ['linkId'], where: { link: where } }).then(rows => rows.length),
    db.mediaLinkSubtitle.groupBy({ by: ['origin'], where: { link: where }, _count: { _all: true } }),
    db.backgroundJob.count({ where: { kind: { in: ['media.subtitle-scan', 'media.subtitle-backfill'] }, status: { in: ['QUEUED', 'RUNNING'] } } }),
  ])
  let scanned = 0, failed = 0, reading = 0
  const notes = new Map<string, number>()
  for (const link of links) {
    const scan = readScan(link.subtitleScan)
    if (!scan || scan.key !== scanKey(link.url)) continue
    if (scan.status === 'reading') { reading++; continue }
    scanned++
    if (scan.status === 'failed') failed++
    for (const note of scan.notes) notes.set(note, (notes.get(note) || 0) + 1)
  }
  const count = (origin: string) => tracks.find(row => row.origin === origin)?._count._all || 0
  return { links: links.length, scanned, failed, reading, withSubtitles, sidecar: count('SIDECAR'), embedded: count('EMBEDDED'), waiting, notes: [...notes].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, links]) => ({ text, links })) }
}

/** Starts the look over existing links from Admin; one run at a time. */
export async function startSubtitleBackfill(again: boolean) {
  const running = await db.backgroundJob.findFirst({ where: { kind: 'media.subtitle-backfill', status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } })
  if (running) return { id: running.id, started: false }
  const run = Date.now().toString(36)
  const job = await enqueue('media.subtitle-backfill', { cursor: 0, again, run }, { dedupeKey: `media-subtitle-backfill:${run}:0` })
  return { id: job.id, started: true }
}
