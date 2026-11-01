import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auditAdminStrict } from '@/platform/audit/server'
import { reindexItem } from '@/modules/search/server/search'
import { knownCodes } from '@/modules/vocabulary/server/vocabulary'
import { cleanText, PromptError, templateInput } from '../domain/prompts'
import { promptTransaction, positiveId } from './transaction'
import { policy } from './queries'

export async function saveTemplate(req: NextRequest, raw: Record<string, unknown>) {
  const data = templateInput(raw), id = raw.id ? positiveId(raw.id) : null
  const saved = await promptTransaction(req, true, async (tx, actor) => {
    const previous = id ? await tx.promptTemplate.findUnique({ where: { id } }) : null
    if (id && !previous) throw new PromptError('الگو پیدا نشد', 404)
    if (previous && data.slug !== previous.slug) throw new PromptError('برای حفظ نشانی عمومی، نشانی الگوی ثبت‌شده تغییر نمی‌کند', 409)
    if (data.category && !(await knownCodes(tx, 'prompts', 'CATEGORY', [data.category], previous ? [previous.category] : [])).includes(data.category)) throw new PromptError('دسته را از فهرست فعال انتخاب کنید')
    const changes = { ...data, publishedAt: data.status === 'PUBLISHED' ? previous?.publishedAt || new Date() : null }
    if (previous) {
      const claim = await tx.promptTemplate.updateMany({ where: { id: previous.id, version: positiveId(raw.version) }, data: { ...changes, version: { increment: 1 } } })
      if (claim.count !== 1) throw new PromptError('الگو توسط مدیر دیگری تغییر کرده؛ نسخهٔ تازه را باز کنید', 409)
    }
    const result = previous ? await tx.promptTemplate.findUniqueOrThrow({ where: { id: previous.id } }) : await tx.promptTemplate.create({ data: changes })
    await auditAdminStrict({ req, actor, action: 'prompts.template.save', targetType: 'prompt-template', targetId: result.id, metadata: { kind: data.kind, status: data.status, version: result.version } }, tx)
    return result
  })
  await reindexItem({ type: 'prompt', id: saved.id })
  return saved
}
export async function deleteTemplate(req: NextRequest, raw: Record<string, unknown>) {
  const id = positiveId(raw.id), version = positiveId(raw.version)
  await promptTransaction(req, true, async (tx, actor) => {
    const removed = await tx.promptTemplate.deleteMany({ where: { id, version } })
    if (removed.count !== 1) throw new PromptError('الگو حذف یا ویرایش شده؛ فهرست را تازه کنید', 409)
    await auditAdminStrict({ req, actor, action: 'prompts.template.delete', targetType: 'prompt-template', targetId: id, metadata: { version } }, tx)
  })
  await reindexItem({ type: 'prompt', id })
  return { deleted: true }
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
