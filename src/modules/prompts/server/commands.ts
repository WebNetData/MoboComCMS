import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auditAdminStrict, auditSystemStrict } from '@/platform/audit/server'
import { reindexItem } from '@/modules/search/server/search'
import { knownCodes } from '@/modules/vocabulary/server/vocabulary'
import { cleanText, PromptError, templateInput } from '../domain/prompts'
import { promptTransaction, positiveId } from './transaction'
import { policy } from './queries'
import { trashData, restoreData } from '@/modules/content/domain/trash'
import { tellTrashDecision } from '@/modules/content/server/trash-notice'
import { completeOwnerCase, reopenOwnerCase } from '@/modules/moderation/server/cases'

export async function restoreTemplate(req: NextRequest, raw: Record<string, unknown>) {
  const id = positiveId(raw.id), version = positiveId(raw.version)
  const outcome = await promptTransaction(req, true, async (tx, actor) => {
    const row = await tx.promptTemplate.findUnique({ where: { id } })
    if (!row) throw new PromptError('الگو پیدا نشد', 404)
    if (row.status !== 'TRASHED') throw new PromptError('الگو در سطل زباله نیست', 409)
    const claim = await tx.promptTemplate.updateMany({ where: { id, version, status: 'TRASHED' }, data: { ...restoreData(row), version: { increment: 1 } } })
    if (claim.count !== 1) throw new PromptError('الگو هم‌زمان تغییر کرده؛ فهرست را تازه کنید', 409)
    await completeOwnerCase(tx, 'trash-prompts', id, actor.id, 'reject')
    if (row.trashedStatus === 'PENDING') await reopenOwnerCase(tx, 'review-prompts', id)
    await auditAdminStrict({ req, actor, action: 'prompts.template.restore', targetType: 'prompt-template', targetId: id, metadata: { version } }, tx)
    return { row, actorId: actor.id }
  })
  await reindexItem({ type: 'prompt', id })
  await tellTrashDecision({ askedById: outcome.row.trashedById, askedAt: outcome.row.trashedAt, decidedById: outcome.actorId, decision: 'restored', kind: 'prompts', id, title: outcome.row.title, href: '/admin/prompts?edit=' + id })
  return { restored: true }
}

export async function saveTemplate(req: NextRequest, raw: Record<string, unknown>) {
  const saved = await promptTransaction(req, 'content', (tx, actor, authorId) => writePromptTemplate(tx, actor, raw, authorId, req))
  await reindexItem({ type: 'prompt', id: saved.id })
  return saved
}

/** Canonical transactional write; callers supply current owner authority and commit-bound audit. */
export async function writePromptTemplate(tx: Prisma.TransactionClient, actor: { id: number; email: string }, raw: Record<string, unknown>, authorId: number | null = null, req?: NextRequest) {
  const data = templateInput(raw), id = raw.id ? positiveId(raw.id) : null
  const previous = id ? await tx.promptTemplate.findFirst({ where: { id, ...(authorId ? { createdById: authorId } : {}) } }) : null
  if (id && !previous) throw new PromptError('الگو پیدا نشد', 404)
  if (previous?.status === 'TRASHED') throw new PromptError('الگو در سطل زباله است؛ ابتدا مدیر آن را بازیابی کند', 409)
  if (previous && data.slug !== previous.slug) throw new PromptError('برای حفظ نشانی عمومی، نشانی الگوی ثبت‌شده تغییر نمی‌کند', 409)
  if (data.category && !(await knownCodes(tx, 'prompts', 'CATEGORY', [data.category], previous ? [previous.category] : [])).includes(data.category)) throw new PromptError('دسته را از فهرست فعال انتخاب کنید')
  const settings = await policy(tx)
  if (authorId) {
    if (data.featured !== (previous?.featured ?? false) || data.sortOrder !== (previous?.sortOrder ?? 0)) throw new PromptError('انتخاب سردبیر و ترتیب نمایش به مدیر اختصاص دارد', 403)
    if (settings.reviewAuthors && data.status === 'PUBLISHED') throw new PromptError('الگو را برای بازبینی بفرستید؛ انتشار به مدیر اختصاص دارد', 403)
    if (settings.reviewAuthors && previous?.status === 'PUBLISHED') throw new PromptError('ویرایش الگوی منتشرشده در حالت بازبینی به مدیر اختصاص دارد', 409)
  }
  const reviewNote = authorId ? (data.status === 'PENDING' ? '' : previous?.reviewNote || '') : cleanText(raw.reviewNote ?? previous?.reviewNote, 1000)
  const changes = { ...data, reviewNote, publishedAt: data.status === 'PUBLISHED' ? previous?.publishedAt || new Date() : null }
  if (!authorId && previous?.status === 'PENDING' && data.status === 'DRAFT' && !reviewNote) throw new PromptError('دلیل بازگشت به پیش‌نویس را در یادداشت بازبینی بنویسید')
  if (previous) {
    const claim = await tx.promptTemplate.updateMany({ where: { id: previous.id, version: positiveId(raw.version), status: previous.status }, data: { ...changes, version: { increment: 1 } } })
    if (claim.count !== 1) throw new PromptError('الگو هم‌زمان تغییر کرده؛ نسخهٔ تازه را باز کنید', 409)
  }
  const result = previous ? await tx.promptTemplate.findUniqueOrThrow({ where: { id: previous.id } }) : await tx.promptTemplate.create({ data: { ...changes, createdById: actor.id } })
  if (previous?.status === 'PENDING' && data.status !== 'PENDING') await completeOwnerCase(tx, 'review-prompts', result.id, actor.id, data.status === 'PUBLISHED' ? 'approve' : 'reject', reviewNote || undefined)
  if (result.status === 'PENDING' && previous?.status !== 'PENDING') await reopenOwnerCase(tx, 'review-prompts', result.id)
  const audit = { actor, action: 'prompts.template.save', targetType: 'prompt-template', targetId: result.id, metadata: { kind: data.kind, status: data.status, version: result.version } }
  await (req ? auditAdminStrict({ ...audit, req }, tx) : auditSystemStrict(audit, tx))
  return result
}
export async function deleteTemplate(req: NextRequest, raw: Record<string, unknown>) {
  const id = positiveId(raw.id), version = positiveId(raw.version)
  const outcome = await promptTransaction(req, 'content', async (tx, actor, authorId) => {
    const row = await tx.promptTemplate.findFirst({ where: { id, ...(authorId ? { createdById: authorId } : {}) } })
    if (!row) throw new PromptError('الگو پیدا نشد', 404)
    if (authorId && row.status === 'TRASHED') throw new PromptError('الگو از قبل در سطل زباله است', 409)
    const where = { id, version, status: row.status }
    const claim = authorId ? await tx.promptTemplate.updateMany({ where, data: { ...trashData(row, actor.id), version: { increment: 1 } } }) : await tx.promptTemplate.deleteMany({ where })
    if (claim.count !== 1) throw new PromptError('الگو حذف یا ویرایش شده؛ فهرست را تازه کنید', 409)
    if (authorId) await reopenOwnerCase(tx, 'trash-prompts', id)
    else if (row.status === 'TRASHED') await completeOwnerCase(tx, 'trash-prompts', id, actor.id, 'approve')
    if (row.status === 'PENDING') await completeOwnerCase(tx, 'review-prompts', id, actor.id, 'reject')
    await auditAdminStrict({ req, actor, action: authorId ? 'prompts.template.trash' : 'prompts.template.delete', targetType: 'prompt-template', targetId: id, metadata: { version } }, tx)
    return { row, actorId: actor.id, trashed: !!authorId }
  })
  await reindexItem({ type: 'prompt', id })
  if (!outcome.trashed) await tellTrashDecision({ askedById: outcome.row.trashedById, askedAt: outcome.row.trashedAt, decidedById: outcome.actorId, decision: 'deleted', kind: 'prompts', id, title: outcome.row.title, href: '/admin/prompts' })
  return outcome.trashed ? { trashed: true } : { deleted: true }
}

export async function pruneHistory(tx: Prisma.TransactionClient, userId: number, limit: number) {
  const older = await tx.promptGeneration.findMany({ where: { userId, pinned: false }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: limit, select: { id: true } })
  if (older.length) await tx.promptGeneration.deleteMany({ where: { userId, id: { in: older.map(row => row.id) }, pinned: false } })
}
export async function changeHistory(req: NextRequest, raw: Record<string, unknown>) {
  const id = positiveId(raw.id), version = positiveId(raw.version)
  return promptTransaction(req, false, async (tx, actor) => {
    const item = await tx.promptGeneration.findFirst({ where: { id, userId: actor.id } })
    if (!item) throw new PromptError('خروجی پیدا نشد', 404)
    const where = { id, userId: actor.id, version }
    if (raw.action === 'delete') {
      if ((await tx.promptGeneration.deleteMany({ where })).count !== 1) throw new PromptError('خروجی تغییر کرده؛ فهرست را تازه کنید', 409)
      return { deleted: true }
    }
    let data: Prisma.PromptGenerationUpdateManyMutationInput
    if (raw.action === 'pin') {
      if (raw.pinned !== true && raw.pinned !== false) throw new PromptError('وضعیت نگه‌داری معتبر نیست')
      if (raw.pinned && !item.pinned && await tx.promptGeneration.count({ where: { userId: actor.id, pinned: true } }) >= (await policy(tx)).pinLimit) throw new PromptError('سقف نگه‌داری خروجی‌ها پر شده؛ یکی از موارد را آزاد کنید', 409)
      data = { pinned: raw.pinned, version: { increment: 1 } }
    } else if (raw.action === 'edit') {
      const output = cleanText(raw.output, 24000)
      if (output.length < 10) throw new PromptError('متن خروجی حداقل ۱۰ نویسه داشته باشد')
      data = { output, title: cleanText(raw.title, 160) || item.title, engine: 'EDITED', version: { increment: 1 } }
    } else throw new PromptError('عملیات معتبر نیست')
    if ((await tx.promptGeneration.updateMany({ where, data })).count !== 1) throw new PromptError('خروجی تغییر کرده؛ فهرست را تازه کنید', 409)
    await pruneHistory(tx, actor.id, (await policy(tx)).historyLimit)
    return { item: await tx.promptGeneration.findFirst({ where: { id, userId: actor.id } }) }
  })
}
