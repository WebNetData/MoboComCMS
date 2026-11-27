import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import type { AuthedUser } from '@/modules/identity/server/access'
import { validFollowUpId } from '../../domain/crm-follow-ups'
import { isClosedOpportunity, isOpportunityStage, opportunityAmount, opportunitySource, opportunityTargetDay, opportunityTitle } from '../../domain/crm-opportunities'
import { ChatError } from '../../domain/livechat'
import { assigneeFor, crmFollowUpCustomer, mayManageFollowUps } from '../crm-follow-ups'
import { authorizeOpportunitySource } from '../crm-opportunity-source'
import { currentOpportunityActor, lockOpportunityUsers } from './access'

function sourceOf(value: unknown) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChatError('منبع فرصت معتبر نیست')
  const { type, id } = value as Record<string, unknown>
  return opportunitySource(type, id)
}

export async function createOpportunity(req: NextRequest, actor: AuthedUser, input: Record<string, unknown>) {
  const source = sourceOf(input.source)
  const title = opportunityTitle(input.title)
  const amount = opportunityAmount(input.amount ?? '0', input.currency ?? 'IRT')
  const targetDay = opportunityTargetDay(input.targetDay ?? null)
  const initial = source ? await authorizeOpportunitySource(req, actor, db, source, 'read') : null
  const userId = initial?.userId ?? input.userId
  if (!validFollowUpId(userId)) throw new ChatError('یک مشتری موجود را انتخاب کنید')
  if (input.userId !== undefined && input.userId !== userId) throw new ChatError('مشتری انتخاب‌شده با منبع فرصت یکسان نیست', 409)
  const assignee = input.assigneeId ?? actor.id
  if (!validFollowUpId(assignee)) throw new ChatError('مسئول فرصت معتبر نیست')
  try {
    return await db.$transaction(async tx => {
      await lockOpportunityUsers(tx, actor.id, userId, assignee)
      const current = await currentOpportunityActor(req, tx, actor.id)
      if (!await tx.user.findFirst({ where: { ...crmFollowUpCustomer, id: userId }, select: { id: true } })) {
        throw new ChatError('مشتری پیدا نشد', 404)
      }
      if (source) {
        const linked = await authorizeOpportunitySource(req, current, tx, source, 'convert')
        if (linked.userId !== initial?.userId) throw new ChatError('حساب مرتبط با منبع تغییر کرده است. صفحه را تازه کنید', 409)
      }
      const assigneeId = await assigneeFor(tx, current, assignee)
      const saved = await tx.crmOpportunity.create({
        data: {
          userId, title, ...amount, targetDay, assigneeId, createdById: current.id,
          formSubmissionId: source?.type === 'FORM' ? source.id : null,
          ticketId: source?.type === 'TICKET' ? source.id : null,
          transitions: { create: { actorId: current.id, toStage: 'NEW' } },
        },
        select: { id: true, version: true },
      })
      await auditAdminStrict({
        req, actor: current, action: 'crm.opportunity.create', targetType: 'user', targetId: userId,
        metadata: { opportunityId: saved.id, assigneeId, sourceType: source?.type },
      }, tx)
      return saved
    })
  } catch (error) {
    if (source && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ChatError('برای این منبع قبلاً یک فرصت فروش ثبت شده است', 409)
    }
    throw error
  }
}

export async function updateOpportunity(req: NextRequest, actor: AuthedUser, input: Record<string, unknown>) {
  const { id, version } = input
  if (!validFollowUpId(id) || !validFollowUpId(version)) throw new ChatError('شناسه یا نسخهٔ فرصت معتبر نیست')
  return db.$transaction(async tx => {
    const row = await tx.crmOpportunity.findFirst({
      where: { id, user: crmFollowUpCustomer, ...(!mayManageFollowUps(actor) ? { assigneeId: actor.id } : {}) },
    })
    if (!row) throw new ChatError('فرصت فروش پیدا نشد', 404)
    const assignee = input.assigneeId
    if (assignee !== undefined && !validFollowUpId(assignee)) throw new ChatError('مسئول فرصت معتبر نیست')
    await lockOpportunityUsers(tx, actor.id, row.userId, ...(assignee ? [assignee] : []))
    const current = await currentOpportunityActor(req, tx, actor.id)
    if (row.assigneeId !== current.id && !mayManageFollowUps(current)) throw new ChatError('فرصت فروش پیدا نشد', 404)
    if (row.version !== version || isClosedOpportunity(row.stage)) throw new ChatError('فرصت بسته شده یا تغییر کرده است. صفحه را تازه کنید', 409)

    const stage = input.stage ?? row.stage
    if (!isOpportunityStage(stage)) throw new ChatError('مرحلهٔ فرصت معتبر نیست')
    const moved = stage !== row.stage
    const closing = moved && isClosedOpportunity(stage)
    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
    if (moved && (reason.length > 300 || (stage === 'LOST' && reason.length < 5))) throw new ChatError('برای از دست رفتن فرصت، دلیل را در ۵ تا ۳۰۰ نویسه ثبت کنید')
    const fields: Prisma.CrmOpportunityUncheckedUpdateManyInput = {}
    if (input.title !== undefined) fields.title = opportunityTitle(input.title)
    if (input.targetDay !== undefined) fields.targetDay = opportunityTargetDay(input.targetDay)
    if (input.amount !== undefined || input.currency !== undefined) {
      Object.assign(fields, opportunityAmount(input.amount, input.currency ?? row.currency))
    }
    const assigneeId = assignee !== undefined && assignee !== row.assigneeId ? await assigneeFor(tx, current, assignee) : row.assigneeId
    if (assigneeId !== row.assigneeId) fields.assigneeId = assigneeId
    if (moved) {
      fields.stage = stage
      fields.stageChangedAt = new Date()
      if (closing) fields.closedAt = fields.stageChangedAt
    }
    if (!Object.keys(fields).length) return { id, version }
    const changed = await tx.crmOpportunity.updateMany({
      where: { id, user: crmFollowUpCustomer, version, stage: row.stage, assigneeId: row.assigneeId },
      data: { ...fields, version: { increment: 1 } },
    })
    if (!changed.count) throw new ChatError('فرصت تغییر کرده است. صفحه را تازه کنید', 409)
    if (moved) {
      await tx.crmOpportunityTransition.create({ data: { opportunityId: id, actorId: current.id, fromStage: row.stage, toStage: stage, reason } })
    }
    if (closing) {
      await tx.crmFollowUp.updateMany({ where: { opportunityId: id, userId: row.userId, status: 'OPEN' }, data: { status: 'CANCELLED', version: { increment: 1 } } })
    }
    await auditAdminStrict({
      req, actor: current, action: 'crm.opportunity.update', targetType: 'user', targetId: row.userId,
      metadata: { opportunityId: id, stage, assigneeId, version: version + 1 },
    }, tx)
    return { id, version: version + 1 }
  })
}
