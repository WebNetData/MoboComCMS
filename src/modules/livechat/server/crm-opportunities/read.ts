import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { OPEN_OPPORTUNITY_STAGES, OPPORTUNITY_STAGES, isClosedOpportunity, isOpportunityStage, type OpportunityFilters, type OpportunitySource } from '../../domain/crm-opportunities'
import { ChatError } from '../../domain/livechat'
import { authorizeOpportunitySource } from '../crm-opportunity-source'
import { crmFollowUpCustomer, followUpAssignees, mayManageFollowUps } from '../crm-follow-ups'
import { opportunityCommerceReport } from './quotation-report'

const pageSize = 25
const staleWhere = (now: Date) => ({
  stage: { in: OPEN_OPPORTUNITY_STAGES },
  stageChangedAt: { lte: new Date(now.getTime() - 14 * 86_400_000) },
})
const relations = { user: { select: { name: true } }, assignee: { select: { name: true } } } as const
type OpportunityRow = Prisma.CrmOpportunityGetPayload<{ include: typeof relations }>

function present(row: OpportunityRow, actor: AuthedUser) {
  const { id, userId, title, stage, amountMinor, currency, targetDay, assigneeId, updatedAt, stageChangedAt, closedAt, version } = row
  return {
    id, userId, userName: row.user.name || `مشتری ${userId}`, title, stage, amountMinor: amountMinor.toString(), currency, targetDay,
    assigneeId, assigneeName: row.assignee?.name || (assigneeId ? `همکار ${assigneeId}` : ''),
    updatedAt, stageChangedAt, closedAt, version,
    mayEdit: !isClosedOpportunity(stage) && (mayManageFollowUps(actor) || assigneeId === actor.id),
  }
}

async function salesSummary(where: Prisma.CrmOpportunityWhereInput, now: Date) {
  const [counts, stale, won] = await Promise.all([
    db.crmOpportunity.groupBy({ where, by: ['stage'], _count: { _all: true } }),
    db.crmOpportunity.count({
      where: { ...where, ...staleWhere(now) },
    }),
    db.crmOpportunity.groupBy({
      where: { ...where, stage: 'WON' }, by: ['currency'], _sum: { amountMinor: true }, orderBy: { currency: 'asc' },
    }),
  ])
  const byStage = Object.fromEntries(OPPORTUNITY_STAGES.map(stage => [stage, 0])) as Record<(typeof OPPORTUNITY_STAGES)[number], number>
  for (const row of counts) if (isOpportunityStage(row.stage)) byStage[row.stage] = row._count._all
  const closed = byStage.WON + byStage.LOST
  return {
    counts: byStage, stale, successRate: closed ? Math.round(byStage.WON * 1000 / closed) / 10 : 0,
    wonTotals: won.map(row => ({ currency: row.currency, amountMinor: String(row._sum.amountMinor ?? 0n) })),
  }
}

export async function listOpportunities(actor: AuthedUser, filter: OpportunityFilters, now = new Date()) {
  const canManage = mayManageFollowUps(actor)
  const owner = filter.owner ?? (canManage ? 'all' : 'mine')
  if (!canManage && owner !== 'mine') throw new ChatError('برای مشاهدهٔ فرصت‌های همکاران دسترسی ندارید', 403)
  const staff = canManage ? await followUpAssignees() : []
  if (typeof owner === 'number' && !staff.some(person => person.id === owner)) throw new ChatError('مسئول انتخاب‌شده معتبر نیست')
  const where: Prisma.CrmOpportunityWhereInput = {
    user: crmFollowUpCustomer, ...(filter.userId ? { userId: filter.userId } : {}),
    ...(owner === 'all' ? {} : { assigneeId: owner === 'mine' ? actor.id : owner === 'unassigned' ? null : owner }),
  }
  const stats = await salesSummary(where, now)
  const itemsWhere: Prisma.CrmOpportunityWhereInput = {
    ...where, stage: filter.stage, ...(filter.stale ? { AND: [staleWhere(now)] } : {}),
  }
  const totalOpportunities = Object.values(stats.counts).reduce((sum, count) => sum + count, 0)
  const total = filter.stale ? await db.crmOpportunity.count({ where: itemsWhere })
    : filter.stage ? stats.counts[filter.stage] : totalOpportunities
  const pageCount = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(filter.page, pageCount)
  const rows = total ? await db.crmOpportunity.findMany({
    where: itemsWhere, include: relations, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize, take: pageSize,
  }) : []
  const commerce = await opportunityCommerceReport(actor, where)
  return { rows: rows.map(row => present(row, actor)), staff, canManage, ownId: actor.id, page, pageCount, stats, commerce }
}

export async function previewOpportunitySource(req: NextRequest, actor: AuthedUser, source: OpportunitySource) {
  const { userId, href } = await authorizeOpportunitySource(req, actor, db, source, 'preview')
  const linked = await db.crmOpportunity.findUnique({
    where: source.type === 'FORM' ? { formSubmissionId: source.id } : { ticketId: source.id },
    select: { id: true },
  })
  if (linked) throw new ChatError('برای این منبع قبلاً یک فرصت فروش ثبت شده است', 409)
  const user = userId === null ? null : await db.user.findFirst({ where: { id: userId, ...crmFollowUpCustomer }, select: { id: true, name: true } })
  if (userId !== null && !user) throw new ChatError('مشتری مرتبط در دسترس نیست', 404)
  return { userId, userName: user ? user.name || `مشتری ${user.id}` : '', source: { ...source, href } }
}

async function readableSource(req: NextRequest, actor: AuthedUser, row: OpportunityRow) {
  const source: OpportunitySource | undefined = row.formSubmissionId
    ? { type: 'FORM', id: row.formSubmissionId }
    : row.ticketId ? { type: 'TICKET', id: row.ticketId } : undefined
  if (!source) return null
  try {
    const { userId, href } = await authorizeOpportunitySource(req, actor, db, source, 'read')
    return userId === null || userId === row.userId ? { ...source, href } : null
  } catch (error) {
    if (error instanceof ChatError && (error.status === 403 || error.status === 404)) return null
    throw error
  }
}

export async function opportunityDetails(req: NextRequest, actor: AuthedUser, id: number) {
  const canManage = mayManageFollowUps(actor)
  const row = await db.crmOpportunity.findFirst({
    where: { id, user: crmFollowUpCustomer, ...(canManage ? {} : { assigneeId: actor.id }) },
    include: relations,
  })
  if (!row) throw new ChatError('فرصت فروش پیدا نشد', 404)
  const [staff, history, source, followUps] = await Promise.all([
    canManage ? followUpAssignees() : [],
    db.crmOpportunityTransition.findMany({
      where: { opportunityId: id }, orderBy: { id: 'desc' }, take: 50,
      select: { id: true, fromStage: true, toStage: true, reason: true, actor: { select: { name: true } }, createdAt: true },
    }),
    readableSource(req, actor, row),
    db.crmFollowUp.findMany({
      where: { opportunityId: id, userId: row.userId }, take: 50,
      orderBy: [{ status: 'desc' }, { dueDay: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, dueDay: true, status: true, assignee: { select: { name: true } } },
    }),
  ])
  return {
    row: present(row, actor), staff, canManage, source,
    history: history.map(({ actor, ...change }) => ({ ...change, actorName: actor?.name || '' })),
    followUps: followUps.map(({ assignee, ...task }) => ({ ...task, assigneeName: assignee?.name || '' })),
  }
}
