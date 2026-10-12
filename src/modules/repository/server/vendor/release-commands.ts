import { randomUUID } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { auditAdminStrict } from '@/platform/audit/server'
import { PACKAGE_LIMITS, PackageError, normalizeEntries, parseManifest } from '@/modules/packages/domain/format'
import { ZipError, readZip } from '@/modules/packages/domain/zip'
import { RepoError, checkReleaseManifest } from '@/modules/repository/domain/repository'
import { sha256 } from '../crypto'
import { commitVendorCommand, type VendorLicenseContext } from './license-command'

export const releaseDirectory = () => join(process.cwd(), 'storage', 'repository')

/** SQL outcome is already decided. Never delete a referenced or unverified archive. */
async function cleanUnreferencedArchive(fileId: string) {
  const deferred = (reason: string) => {
    try { logEvent('warn', 'repository.archive.cleanup-deferred', { fileId, reason }) }
    catch { /* Observability cannot change an already decided database outcome. */ }
  }
  if (!/^[0-9a-f-]{36}\.zip$/.test(fileId)) { deferred('invalid-file-id'); return }
  try {
    if (await db.repoRelease.count({ where: { fileId } })) return
  } catch { deferred('database-unavailable'); return }
  try { await unlink(join(releaseDirectory(), fileId)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') deferred('unlink-failed') }
}

export async function deleteProduct(id: number, context?: VendorLicenseContext) {
  const files = await commitVendorCommand(context, async tx => {
    const product = await tx.repoProduct.findUnique({ where: { id }, include: { releases: { select: { fileId: true, storageState: true } }, _count: { select: { licenses: true } } } })
    if (!product) return []
    if (product._count.licenses > 0) throw new RepoError('محصولی که لایسنس دارد حذف نمی‌شود؛ آن را غیرفعال کنید', 409)
    if (product.releases.some(release => release.storageState === 'STAGING')) throw new RepoError('آپلود این محصول هنوز تمام نشده است؛ ابتدا وضعیت آن را بررسی کنید', 409)
    await tx.repoProduct.delete({ where: { id } })
    return product.releases.map(release => release.fileId)
  }, () => ({ action: 'product.delete', targetId: id }))
  for (const fileId of new Set(files)) await cleanUnreferencedArchive(fileId)
}

/** Technical rollback owns only its server-generated token; revocation cannot turn it into a publish/grant. */
async function cancelOwnedReservation(fileId: string, tokenHash: string, context?: VendorLicenseContext) {
  await commitVendorCommand(undefined, async tx => {
    const row = await tx.repoRelease.findFirst({ where: { fileId, storageState: 'STAGING', uploadTokenHash: tokenHash } })
    if (!row) return
    const claim = await tx.repoRelease.deleteMany({ where: { id: row.id, storageState: 'STAGING', uploadTokenHash: tokenHash } })
    if (claim.count !== 1) throw new RepoError('وضعیت آپلود تغییر کرده است', 409)
    if (context) await auditAdminStrict({ req: context.req, actor: context.actor, action: 'repository.release.upload.cancel', targetType: 'repository', targetId: String(row.id), metadata: { fileId, version: row.version, reservedAt: row.createdAt.toISOString() } }, tx)
  }, () => ({ action: 'release.upload.cancel', targetId: fileId }))
}

/** The archive is created once outside retryable SQL work, and compensated only when unreferenced. */
export async function uploadRelease(productId: number, upload: Buffer, changelog: string, context?: VendorLicenseContext) {
  const product = await db.repoProduct.findUnique({ where: { id: productId }, include: { releases: { select: { version: true } } } })
  if (!product) throw new RepoError('محصول پیدا نشد', 404)
  if (upload.length > PACKAGE_LIMITS.uploadBytes) throw new RepoError(`حجم فایل حداکثر ${PACKAGE_LIMITS.uploadBytes / 1024 / 1024} مگابایت است`, 413)
  let manifest: ReturnType<typeof parseManifest>
  try {
    const entries = normalizeEntries(readZip(upload, PACKAGE_LIMITS))
    const source = entries.get('manifest.json')
    if (!source) throw new RepoError('manifest.json در ریشهٔ zip نیست')
    manifest = parseManifest(JSON.parse(source.toString('utf8')), new Set(entries.keys()))
  } catch (error) {
    if (error instanceof RepoError) throw error
    if (error instanceof ZipError || error instanceof PackageError) throw new RepoError(error.message)
    throw new RepoError('فایل zip یا manifest.json معتبر نیست')
  }
  checkReleaseManifest(manifest, product, product.releases.map(release => release.version))
  const fileId = `${randomUUID()}.zip`
  const tokenHash = sha256(randomUUID())
  let ownsFile = false
  try {
    const reservation = await commitVendorCommand(context, async tx => {
      const current = await tx.repoProduct.findUnique({ where: { id: productId }, include: { releases: { select: { version: true } } } })
      if (!current) throw new RepoError('محصول پیدا نشد', 404)
      checkReleaseManifest(manifest, current, current.releases.map(release => release.version))
      return tx.repoRelease.create({ data: { productId, version: manifest.version, fileId, sha256: sha256(upload), size: upload.length, changelog: String(changelog || '').slice(0, 5000), requiresCore: manifest.requiresCore || '', runtime: manifest.runtime, published: false, storageState: 'STAGING', uploadTokenHash: tokenHash } })
    }, row => ({ action: 'release.reserve', targetId: row.id, metadata: { version: row.version, fileId, reservedAt: row.createdAt.toISOString() } }))
    await mkdir(releaseDirectory(), { recursive: true })
    const file = await open(join(releaseDirectory(), fileId), 'wx', 0o600)
    ownsFile = true
    try { await file.writeFile(upload) }
    finally { await file.close() }
    return await commitVendorCommand(context, async tx => {
      const current = await tx.repoProduct.findUnique({ where: { id: productId }, include: { releases: { where: { id: { not: reservation.id } }, select: { version: true } } } })
      if (!current) throw new RepoError('محصول پیدا نشد', 404)
      checkReleaseManifest(manifest, current, current.releases.map(release => release.version))
      const claim = await tx.repoRelease.updateMany({ where: { id: reservation.id, storageState: 'STAGING', uploadTokenHash: tokenHash }, data: { storageState: 'READY', uploadTokenHash: null, published: true, createdAt: new Date() } })
      if (claim.count !== 1) throw new RepoError('وضعیت آپلود تغییر کرده است؛ نسخه منتشر نشد', 409)
      return tx.repoRelease.findUniqueOrThrow({ where: { id: reservation.id } })
    }, release => ({ action: 'release.upload', targetId: release.id, metadata: { version: release.version, reservedAt: reservation.createdAt.toISOString() } }))
  } catch (error) {
    try { await cancelOwnedReservation(fileId, tokenHash, context) }
    catch { try { logEvent('warn', 'repository.upload.reservation-retained', { fileId, reason: 'cancellation-unverified' }) } catch { /* Keep the original outcome. */ } }
    if (ownsFile) await cleanUnreferencedArchive(fileId)
    if ((error as { code?: string }).code === 'P2002') throw new RepoError('این نسخه قبلاً منتشر شده است', 409)
    throw error
  }
}
