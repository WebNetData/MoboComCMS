import { db } from '@/platform/database/prisma'
import { enqueue } from '@/modules/operations/server/enqueue'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { playbackKind } from '@/modules/media/domain/media'
import { readScan, type SubtitleScan } from '@/modules/media/domain/found-subtitles'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { FOUND_KINDS, FOUND_OWNERS, scanDedupe, scanKey } from './request'
import { sidecarSubtitles, type Found } from './sidecar'
import { embeddedSubtitles } from './embedded'
import { videoSource } from './source'

/** Under the queue's ten-minute stale-lease limit, so a long read is never handed to a second runner. */
const SCAN_BUDGET_MS = 9 * 60_000
const GB = 1024 ** 3

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

/** media.subtitle-scan — subtitles beside and inside one film or episode file. */
export async function runSubtitleScan(payload: Record<string, unknown>, job: Job) {
  const linkId = Number(payload.linkId), key = String(payload.key || '')
  if (!Number.isSafeInteger(linkId) || linkId <= 0 || !/^[a-f0-9]{16}$/.test(key)) throw new Error('Invalid subtitle scan request')
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { id: true, url: true, kind: true, ownerType: true, ownerId: true, disabled: true } })
  if (!link || scanKey(link.url) !== key) return { linkId, skipped: 'changed' }
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
    // A subtitle file the editor already added as its own link is not offered twice.
    const manual = await db.mediaLink.findMany({ where: { ownerType: link.ownerType, ownerId: link.ownerId, kind: 'SUBTITLE' }, select: { url: true } })
    const sidecars = await sidecarSubtitles(source, new Set(manual.map(row => row.url)), notes)
    await job.checkpoint()
    const embedded = await embeddedSubtitles(source, { maxBytes: settings.subtitleScanMaxGB * GB, deadline }, notes)
    await job.checkpoint()
    const found = [...sidecars, ...embedded]
    await record(linkId, key, { status: 'done', found: found.length, notes: notes.slice(0, 6) }, found)
    return { linkId, found: found.length, sidecar: sidecars.length, embedded: embedded.length }
  } catch (error) {
    // A lease that changed belongs to another runner; anything else is this file's answer until it is looked at again.
    if (/lease/i.test(String((error as Error)?.message))) throw error
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
    if (!again && readScan(row.subtitleScan)?.key === key) continue
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
  let scanned = 0, failed = 0
  const notes = new Map<string, number>()
  for (const link of links) {
    const scan = readScan(link.subtitleScan)
    if (!scan || scan.key !== scanKey(link.url)) continue
    scanned++
    if (scan.status === 'failed') failed++
    for (const note of scan.notes) notes.set(note, (notes.get(note) || 0) + 1)
  }
  const count = (origin: string) => tracks.find(row => row.origin === origin)?._count._all || 0
  return { links: links.length, scanned, failed, withSubtitles, sidecar: count('SIDECAR'), embedded: count('EMBEDDED'), waiting, notes: [...notes].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, links]) => ({ text, links })) }
}

/** Starts the look over existing links from Admin; one run at a time. */
export async function startSubtitleBackfill(again: boolean) {
  const running = await db.backgroundJob.findFirst({ where: { kind: 'media.subtitle-backfill', status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } })
  if (running) return { id: running.id, started: false }
  const run = Date.now().toString(36)
  const job = await enqueue('media.subtitle-backfill', { cursor: 0, again, run }, { dedupeKey: `media-subtitle-backfill:${run}:0` })
  return { id: job.id, started: true }
}
