import { createHash, randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { enqueue } from '@/modules/operations/server/enqueue'
import { auditAdminStrict } from '@/platform/audit/server'
import { checkRemoteUrl } from '@/shared/media/net'
import { LibraryError, folderId, transferUrl } from '@/modules/media/domain/library'
import { currentLibraryUser, libraryTransaction, type LibraryActor } from './authority'
import { assetUrl, registerLocalAsset } from './catalog'
import { mediaSettings } from './settings'

const safeUrl = (raw: string) => {
  if (raw.length > 4000) throw new LibraryError('نشانی بیش از حد طولانی است')
  try { return checkRemoteUrl(raw, { allowLoopback: process.env.NODE_ENV !== 'production' && process.env.IMPORT_ALLOW_LOOPBACK === '1' }).toString() }
  catch (error) { throw new LibraryError(error instanceof Error ? error.message : 'نشانی نامعتبر است') }
}
export async function requestTransfer(actor: LibraryActor, input: Record<string, unknown>, req?: NextRequest, retryId?: string) {
  const sourceUrl = safeUrl(String(input.url || '').trim())
  const kind = input.kind === 'image' ? 'image' : 'file'
  const runAt = input.runAt ? new Date(String(input.runAt)) : new Date()
  if (!Number.isFinite(runAt.getTime()) || runAt.getTime() > Date.now() + 365 * 86400000) throw new LibraryError('زمان انتقال نامعتبر است')
  const config = (await mediaSettings()).value
  if (!config.enabled) throw new LibraryError('انتقال از لینک در تنظیمات کتابخانه غیرفعال است', 409)
  const row = await libraryTransaction(async tx => {
    const user = await currentLibraryUser(actor, tx)
    const sourceHash = createHash('sha256').update(`${user.id}:${kind}:${sourceUrl}`).digest('hex')
    const known = await tx.mediaTransfer.findUnique({ where: retryId ? { id: retryId } : { sourceHash }, include: { asset: true } })
    if (retryId && (!known || (!user.manageLibrary && known.actorId !== user.id))) throw new LibraryError('انتقال پیدا نشد', 404)
    if (known && ['READY', 'QUEUED', 'RUNNING'].includes(known.status)) return known
    if (await tx.mediaTransfer.count({ where: { actorId: user.id, status: { in: ['QUEUED', 'RUNNING'] } } }) >= 100) throw new LibraryError('ابتدا انتقال‌های قبلی را تکمیل کنید', 429)
    const folder = folderId(input.folderId)
    if (folder && !await tx.mediaFolder.findUnique({ where: { id: folder } })) throw new LibraryError('پوشه پیدا نشد', 404)
    const data = { authority: actor.purpose === 'import' ? 'import' : 'media', sourceUrl, kind, actorId: user.id, authAt: actor.authAt, folderId: folder, name: String(input.name || '').slice(0, 120), section: String(input.section || 'posts'), runAt, status: 'QUEUED', lastError: '', leaseToken: '', lockedUntil: null, attempts: 0, receivedBytes: 0n, totalBytes: null }
    const transfer = known ? await tx.mediaTransfer.update({ where: { id: known.id }, data: { ...data, generation: { increment: 1 } } }) : await tx.mediaTransfer.create({ data: { ...data, sourceHash } })
    const job = await enqueue('media.transfer', { id: transfer.id, generation: transfer.generation }, { runAt, dedupeKey: `media:${transfer.id}:${transfer.generation}` }, tx)
    const updated = await tx.mediaTransfer.update({ where: { id: transfer.id }, data: { jobId: job.id }, include: { asset: true } })
    if (req) await auditAdminStrict({ req, actor: user, action: 'media.transfer.requested', targetType: 'media-transfer', targetId: transfer.id, metadata: { kind, host: new URL(sourceUrl).hostname, runAt: runAt.toISOString() } }, tx)
    return updated
  })
  if (input.mode === 'immediate' && row.status !== 'READY' && row.runAt.getTime() <= Date.now()) await runTransfer({ id: row.id, generation: row.generation })
  const final = await db.mediaTransfer.findUniqueOrThrow({ where: { id: row.id }, include: { asset: true } })
  if (input.mode === 'immediate' && final.status === 'FAILED') throw new LibraryError(final.lastError, 422)
  return { id: final.id, status: final.status, url: final.asset ? assetUrl(final.asset) : transferUrl(final.id) }
}

/** A transfer is metadata for the existing queue. Claims fence retries, cancellation and crashed workers. */
export async function runTransfer(payload: Record<string, unknown>) {
  const id = String(payload.id || ''), generation = Number(payload.generation)
  const leaseToken = randomUUID()
  const claimed = await db.mediaTransfer.updateMany({ where: { id, generation, runAt: { lte: new Date() }, OR: [{ status: { in: ['QUEUED', 'FAILED'] } }, { status: 'RUNNING', lockedUntil: { lt: new Date() } }] }, data: { status: 'RUNNING', leaseToken, lockedUntil: new Date(Date.now() + 9 * 60000), attempts: { increment: 1 }, lastError: '' } })
  if (!claimed.count) return { skipped: true }
  const row = await db.mediaTransfer.findUniqueOrThrow({ where: { id } })
  const actor = { id: row.actorId || 0, authAt: row.authAt, ...(row.authority === 'import' ? { purpose: 'import' as const } : {}) }
  const claim = { id, generation, leaseToken, status: 'RUNNING' }
  const checkpoint = async () => {
    await currentLibraryUser(actor)
    if (!(await mediaSettings()).value.enabled) throw new LibraryError('انتقال از لینک غیرفعال شده است', 403)
    if (!await db.mediaTransfer.count({ where: claim })) throw new LibraryError('این انتقال لغو یا جایگزین شده است', 409)
  }
  try {
    await checkpoint()
    const config = (await mediaSettings()).value
    let url: string
    if (row.kind === 'image') url = (await (await import('@/modules/imports/server/media')).importImage(row.sourceUrl)).url
    else url = await (await import('@/modules/downloads/server/files')).importFile(row.sourceUrl, row.section, { maxBytes: config.maxFileMB * 1024 ** 2, timeoutMs: config.timeoutSeconds * 1000, checkpoint, canonical: true })
    await checkpoint()
    const asset = await libraryTransaction(async tx => {
      await currentLibraryUser(actor, tx)
      const owned = await tx.mediaTransfer.updateMany({ where: claim, data: { leaseToken } })
      if (!owned.count) throw new LibraryError('اختیار انتقال تغییر کرده است', 409)
      const asset = await registerLocalAsset(url, actor.id, row.folderId, row.name || undefined, tx)
      const result = await tx.mediaTransfer.updateMany({ where: claim, data: { status: 'READY', assetId: asset.id, receivedBytes: asset.bytes, totalBytes: asset.bytes, lockedUntil: null } })
      if (!result.count) throw new LibraryError('اختیار انتقال تغییر کرده است', 409)
      return asset
    })
    return { id, assetId: asset.id }
  } catch (error) {
    // Never persist remote credentials/query strings or raw transport errors.
    const message = error instanceof LibraryError ? error.message : 'انتقال انجام نشد؛ نوع، حجم، دسترسی عمومی لینک یا زمان دریافت را بررسی کنید'
    await db.mediaTransfer.updateMany({ where: claim, data: { status: error instanceof LibraryError && error.status === 403 ? 'PAUSED' : 'FAILED', lastError: message, lockedUntil: null } })
    throw new LibraryError(message, 422)
  }
}
export async function listTransfers(actor: LibraryActor) {
  const user = await currentLibraryUser(actor)
  const rows = await db.mediaTransfer.findMany({ where: user.manageLibrary ? {} : { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { asset: true } })
  return rows.map(r => ({ id: r.id, name: r.name || new URL(r.sourceUrl).pathname.split('/').pop() || 'فایل', host: new URL(r.sourceUrl).hostname, status: r.status, runAt: r.runAt, attempts: r.attempts, error: r.lastError, url: r.asset ? assetUrl(r.asset) : transferUrl(r.id) }))
}
export async function transferCommand(actor: LibraryActor, input: Record<string, unknown>, req: NextRequest) {
  const user = await currentLibraryUser(actor)
  const row = await db.mediaTransfer.findUnique({ where: { id: String(input.id || '') } })
  if (!row || (!user.manageLibrary && row.actorId !== user.id)) throw new LibraryError('انتقال پیدا نشد', 404)
  if (input.action === 'transfer.retry') {
    if (!['FAILED', 'PAUSED', 'CANCELLED'].includes(row.status)) throw new LibraryError('این انتقال هنوز قابل تلاش مجدد نیست', 409)
    return requestTransfer(actor, { ...row, url: row.sourceUrl, runAt: new Date().toISOString() }, req, row.id)
  }
  if (input.action !== 'transfer.cancel') throw new LibraryError('عملیات نامعتبر است')
  return libraryTransaction(async tx => {
    const current = await currentLibraryUser(actor, tx)
    if (!current.manageLibrary && row.actorId !== current.id) throw new LibraryError('دسترسی مجاز نیست', 403)
    const result = await tx.mediaTransfer.updateMany({ where: { id: row.id, generation: row.generation, status: { not: 'READY' } }, data: { status: 'CANCELLED', generation: { increment: 1 }, lockedUntil: null } })
    if (!result.count) throw new LibraryError('انتقال تکمیل یا تغییر کرده است', 409)
    await auditAdminStrict({ req, actor: current, action: 'media.transfer.cancelled', targetType: 'media-transfer', targetId: row.id }, tx)
    return { cancelled: true }
  })
}

/** Recover an interrupted immediate request too, even if its original queue job already returned. */
export async function sweepMediaTransfers() {
  const rows = await db.mediaTransfer.findMany({ where: { runAt: { lte: new Date() }, OR: [{ status: 'RUNNING', lockedUntil: { lt: new Date() } }, { status: 'QUEUED', jobId: null }] }, orderBy: { runAt: 'asc' }, take: 50 })
  let recovered = 0
  for (const row of rows) await libraryTransaction(async tx => {
    const where = { id: row.id, generation: row.generation, status: row.status, leaseToken: row.leaseToken, lockedUntil: row.lockedUntil, jobId: row.jobId }
    if (row.attempts >= 5) {
      await tx.mediaTransfer.updateMany({ where, data: { status: 'FAILED', lockedUntil: null, lastError: 'انتقال چند بار قطع شده است؛ پس از بررسی سرور دوباره تلاش کنید' } }); return
    }
    const changed = await tx.mediaTransfer.updateMany({ where, data: { status: 'QUEUED', generation: { increment: 1 }, leaseToken: '', lockedUntil: null } })
    if (!changed.count) return
    const generation = row.generation + 1
    const job = await enqueue('media.transfer', { id: row.id, generation }, { dedupeKey: `media:${row.id}:${generation}` }, tx)
    await tx.mediaTransfer.update({ where: { id: row.id }, data: { jobId: job.id } }); recovered++
  })
  return { recovered }
}
