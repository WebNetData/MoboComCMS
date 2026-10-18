import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { PersonProfileError } from '@/modules/cinema/domain/person-profile'
import { mergeProfileFavorites } from '@/modules/reviews/server/reviews'

export async function cinemaMergePreview(sourceId: number, targetId: number) {
  if (![sourceId, targetId].every(id => Number.isSafeInteger(id) && id > 0) || sourceId === targetId) throw new PersonProfileError('دو پروفایل متفاوت و معتبر انتخاب کنید')
  const rows = await db.cinemaPerson.findMany({ where: { id: { in: [sourceId, targetId] } }, select: { id: true, name: true, profileVersion: true, mergedIntoId: true, _count: { select: { credits: true } } } })
  const source = rows.find(row => row.id === sourceId), target = rows.find(row => row.id === targetId)
  if (!source || !target) throw new PersonProfileError('پروفایل پیدا نشد', 404)
  if (source.mergedIntoId || target.mergedIntoId) throw new PersonProfileError('یک پروفایل قبلاً ادغام شده است؛ مقصد اصلی را انتخاب کنید', 409)
  return { source, target, sourceVersion: source.profileVersion, targetVersion: target.profileVersion }
}

export async function mergeCinemaPeople(input: Record<string, unknown>, audit: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const sourceId = Number(input.sourceId), targetId = Number(input.targetId)
  await cinemaMergePreview(sourceId, targetId)
  if (![input.sourceVersion, input.targetVersion].every(v => Number.isSafeInteger(v) && Number(v) >= 0)) throw new PersonProfileError('پیش‌نمایش ادغام را دوباره دریافت کنید', 409)
  return db.$transaction(async tx => {
    // Lock in ID order: opposing merges cannot deadlock or create cycles.
    for (const id of [sourceId, targetId].sort((a, b) => a - b)) {
      const claimed = await tx.cinemaPerson.updateMany({ where: { id, mergedIntoId: null, profileVersion: Number(id === sourceId ? input.sourceVersion : input.targetVersion) }, data: { profileVersion: { increment: 1 } } })
      if (!claimed.count) throw new PersonProfileError('پروفایل هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409)
    }
    const source = await tx.cinemaPerson.findUniqueOrThrow({ where: { id: sourceId } }), target = await tx.cinemaPerson.findUniqueOrThrow({ where: { id: targetId } })
    const credits = await tx.cinemaCredit.findMany({ where: { personId: sourceId } })
    for (const credit of credits) {
      const duplicate = await tx.cinemaCredit.findUnique({ where: { titleId_personId_role: { titleId: credit.titleId, personId: targetId, role: credit.role } } })
      if (duplicate) await tx.cinemaCredit.delete({ where: { id: credit.id } })
      else await tx.cinemaCredit.update({ where: { id: credit.id }, data: { personId: targetId } })
    }
    await tx.cinemaPerson.updateMany({ where: { mergedIntoId: sourceId }, data: { mergedIntoId: targetId, profileVersion: { increment: 1 } } })
    await tx.cinemaPerson.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } })
    await tx.cinemaPerson.update({ where: { id: targetId }, data: { ...(target.bio ? {} : { bio: source.bio }), ...(!target.image && !target.imageLocked ? { image: source.image, imageLocked: source.imageLocked } : {}) } })
    await mergeProfileFavorites(tx, 'person', sourceId, targetId)
    await audit(tx)
    return { id: targetId, url: `/cinema/people/${targetId}`, movedCredits: credits.length }
  }, { timeout: 30_000, isolationLevel: 'Serializable' })
}
