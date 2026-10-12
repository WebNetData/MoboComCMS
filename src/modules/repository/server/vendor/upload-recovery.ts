import type { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { RepoError, checkReleaseManifest } from '@/modules/repository/domain/repository'
import { sha256 } from '../crypto'
import { assertVendorLicenseAuthority, commitVendorCommand, type VendorLicenseContext } from './license-command'
import { VENDOR_CONFIG_KEY } from './catalog-commands'
import { inspectRecoveryFile } from './recovery-file'
import { releaseDirectory, cleanUnreferencedArchive } from './release-commands'

async function recoveryEnabled(tx: Prisma.TransactionClient) {
  const setting = await tx.setting.findUnique({ where: { key: VENDOR_CONFIG_KEY } })
  if (!setting) return false
  try { const value = JSON.parse(setting.value); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value.archiveRecoveryEnabled === true }
  catch { throw new RepoError('تنظیمات بازیابی معتبر نیست', 409) }
}
async function subject(id: number, tx: Prisma.TransactionClient) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new RepoError('شناسهٔ نسخه معتبر نیست', 400)
  const row = await tx.repoRelease.findUnique({ where: { id }, include: { product: { select: { name: true, slug: true, kind: true } } } })
  if (!row) throw new RepoError('نسخه پیدا نشد', 404)
  return row
}
type Subject = Awaited<ReturnType<typeof subject>>
const evidenceOf = (row: Subject) => sha256(JSON.stringify(row))
const pending = (row: Subject) => row.storageState === 'STAGING' && row.published === false && /^[a-f0-9]{64}$/.test(row.uploadTokenHash || '')

export async function previewUploadRecovery(id: number, context: VendorLicenseContext) {
  const read = await db.$transaction(async tx => { await assertVendorLicenseAuthority(context, tx); return { row: await subject(id, tx), enabled: await recoveryEnabled(tx) } })
  const file = pending(read.row) ? await inspectRecoveryFile(read.row) : { state: 'not-pending' }
  await db.$transaction(tx => assertVendorLicenseAuthority(context, tx))
  return { releaseId: id, productId: read.row.productId, product: read.row.product.name, version: read.row.version, storageState: read.row.storageState, size: read.row.size, reservedAt: read.row.createdAt.toISOString(), fileState: file.state, enabled: read.enabled, canPromote: read.enabled && file.state === 'valid', evidence: evidenceOf(read.row) }
}

export async function recoverUpload(id: number, input: { evidence?: unknown; acknowledgeReviewed?: unknown }, context: VendorLicenseContext) {
  if (input.acknowledgeReviewed !== true || typeof input.evidence !== 'string' || !/^[a-f0-9]{64}$/.test(input.evidence)) throw new RepoError('بررسی نسخه را تأیید کنید', 400)
  const row = await db.$transaction(async tx => { await assertVendorLicenseAuthority(context, tx); if (!await recoveryEnabled(tx)) throw new RepoError('بازیابی نسخه غیرفعال است', 403); return subject(id, tx) })
  if (!pending(row) || evidenceOf(row) !== input.evidence) throw new RepoError('وضعیت نسخه تغییر کرده است؛ دوباره بررسی کنید', 409)
  const file = await inspectRecoveryFile(row)
  if (file.state !== 'valid' || !file.buffer) throw new RepoError('فایل برای بازیابی معتبر نیست', 409)
  const fileId = `${randomUUID()}.zip`
  let owned = false
  try {
    await mkdir(releaseDirectory(), { recursive: true })
    const copy = await open(join(releaseDirectory(), fileId), 'wx', 0o600); owned = true
    try { await copy.writeFile(file.buffer) } finally { await copy.close() }
    return await commitVendorCommand(context, async tx => {
      if (!await recoveryEnabled(tx)) throw new RepoError('بازیابی نسخه غیرفعال است', 403)
      const current = await subject(id, tx)
      if (!pending(current) || evidenceOf(current) !== input.evidence) throw new RepoError('وضعیت نسخه تغییر کرده است؛ دوباره بررسی کنید', 409)
      const others = await tx.repoRelease.findMany({ where: { productId: current.productId, id: { not: id } }, select: { version: true } })
      checkReleaseManifest({ id: current.product.slug, kind: current.product.kind === 'THEME' ? 'theme' : 'plugin', version: current.version }, current.product, others.map(item => item.version))
      const claim = await tx.repoRelease.updateMany({ where: { id, storageState: 'STAGING', uploadTokenHash: current.uploadTokenHash, fileId: current.fileId }, data: { storageState: 'READY', uploadTokenHash: null, published: true, fileId, createdAt: new Date() } })
      if (claim.count !== 1) throw new RepoError('وضعیت نسخه تغییر کرده است', 409)
      return { releaseId: id, fileId, priorFileId: current.fileId, reservedAt: current.createdAt.toISOString() }
    }, result => ({ action: 'release.recover', targetId: id, metadata: result }))
  } catch (error) { if (owned) await cleanUnreferencedArchive(fileId); throw error }
}
