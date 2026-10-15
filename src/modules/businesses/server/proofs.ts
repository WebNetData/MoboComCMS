import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { businessTransaction } from './commands'
import { businessId } from '../domain/profiles'
import { BusinessError } from '../domain/businesses'
import { trustNote } from '../domain/trust'
import { trustTarget } from './trust-content'
import { businessTrustPolicy } from './trust-policy'
import { auditAdminStrict } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { readPrivateImage, removePrivateImages, savePrivateImages, type PrivateImage } from '@/shared/files/private-images'

export async function submitPurchaseProof(req: NextRequest, input: Record<string, unknown>, file: PrivateImage) {
  const id = businessId(input.businessId), reviewId = businessId(input.reviewId)
  await savePrivateImages('business-proofs', [file])
  try {
    return await businessTransaction(req, false, async (tx, actor) => {
      if (!(await businessTrustPolicy(tx)).proofs) throw new BusinessError('ثبت مدرک فعلاً غیرفعال است', 403)
      const { business, review, digest } = await trustTarget(tx, id, reviewId)
      if (business.kind !== 'EXTERNAL' || review.userId !== actor.id || review.status === 'REJECTED') throw new BusinessError('مدرک فقط برای تجربهٔ خودتان از کسب‌وکار بیرونی قابل ثبت است', 403)
      if (await tx.businessPurchaseProof.findFirst({ where: { reviewId, status: 'PENDING' } })) throw new BusinessError('مدرکی در انتظار بررسی دارید؛ ابتدا نتیجه را ببینید یا آن را پس بگیرید', 409)
      await tx.businessPurchaseProof.updateMany({ where: { reviewId, userId: actor.id, status: 'APPROVED' }, data: { status: 'WITHDRAWN' } })
      const proof = await tx.businessPurchaseProof.create({ data: { businessId: id, reviewId, userId: actor.id, reviewDigest: digest, filename: file.filename, originalName: file.originalName, mimeType: file.mimeType, size: file.size, sha256: createHash('sha256').update(file.bytes).digest('hex') } })
      await auditAdminStrict({ req, actor, action: 'businesses.proof.submit', targetType: 'business-proof', targetId: proof.id, metadata: { businessId: id, reviewId } }, tx)
      return { id: proof.id, status: proof.status }
    })
  } catch (error) { await removePrivateImages('business-proofs', [file]); throw error }
}

export async function decidePurchaseProof(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.proofId), note = trustNote(input.decisionNote)
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') throw new BusinessError('تصمیم معتبر نیست')
  const decision = input.decision, expected = input.expectedStatus === 'APPROVED' ? 'APPROVED' : 'PENDING'
  if (expected === 'APPROVED' && decision !== 'REJECTED') throw new BusinessError('مدرک تأییدشده فقط قابل لغو تأیید است')
  if (decision === 'APPROVED' && input.acknowledgeProof !== true) throw new BusinessError('مشاهدهٔ مدرک و تطبیق آن با تجربه را تأیید کنید')
  return businessTransaction(req, true, async (tx, actor) => {
    const proof = await tx.businessPurchaseProof.findUnique({ where: { id } })
    if (!proof || proof.status !== expected) throw new BusinessError('وضعیت مدرک تغییر کرده است', 409)
    const { business, review, digest } = await trustTarget(tx, proof.businessId, proof.reviewId, false)
    if (proof.userId === actor.id || business.representativeId === actor.id) throw new BusinessError('مدرک باید توسط مدیر مستقلی بررسی شود', 403)
    if (decision === 'APPROVED' && (business.kind !== 'EXTERNAL' || proof.userId !== review.userId || digest !== proof.reviewDigest || review.status === 'REJECTED')) throw new BusinessError('تجربه پس از ارسال مدرک تغییر کرده است؛ مدرک جدید لازم است', 409)
    const changed = await tx.businessPurchaseProof.updateMany({ where: { id, status: expected }, data: { status: decision, reviewerId: actor.id, decisionNote: note, reviewedAt: new Date() } })
    if (changed.count !== 1) throw new BusinessError('وضعیت مدرک تغییر کرده است', 409)
    await auditAdminStrict({ req, actor, action: 'businesses.proof.decide', targetType: 'business-proof', targetId: id, metadata: { businessId: proof.businessId, decision, previous: expected } }, tx)
    return { status: decision }
  })
}

export async function withdrawPurchaseProof(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.proofId)
  const proof = await businessTransaction(req, false, async (tx, actor) => {
    const row = await tx.businessPurchaseProof.findFirst({ where: { id, userId: actor.id } })
    if (!row) throw new BusinessError('مدرک پیدا نشد', 404)
    if (row.status !== 'WITHDRAWN') {
      const changed = await tx.businessPurchaseProof.updateMany({ where: { id, userId: actor.id, status: row.status }, data: { status: 'WITHDRAWN' } })
      if (changed.count !== 1) throw new BusinessError('وضعیت مدرک تغییر کرده است', 409)
      await auditAdminStrict({ req, actor, action: 'businesses.proof.withdraw', targetType: 'business-proof', targetId: id }, tx)
    }
    return row
  })
  await removePrivateImages('business-proofs', [proof])
  return { status: 'WITHDRAWN' }
}

export async function privatePurchaseProof(req: NextRequest, id: number) {
  return businessTransaction(req, false, async (tx, actor) => {
    const proof = await tx.businessPurchaseProof.findUnique({ where: { id } })
    if (!proof || proof.status === 'WITHDRAWN' || (proof.userId !== actor.id && !await requirePerm(req, 'businesses.manage', tx))) throw new BusinessError('فایل پیدا نشد', 404)
    let bytes: Buffer
    try { bytes = await readPrivateImage('business-proofs', proof.filename) } catch { throw new BusinessError('فایل پیدا نشد', 404) }
    if (bytes.length !== proof.size || createHash('sha256').update(bytes).digest('hex') !== proof.sha256) throw new BusinessError('فایل پیدا نشد', 404)
    return { bytes, mimeType: proof.mimeType }
  })
}
