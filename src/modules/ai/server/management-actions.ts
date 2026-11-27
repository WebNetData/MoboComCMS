import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { addOrderNote } from '@/modules/store/server/orders'
import { assignOrder } from '@/modules/store/server/order-work'
import { applyDeskTicketReply } from '@/modules/support/server/ticket-reply'
import { actionSignals, type ActionSignal, type DeskCommand, type ManagementAction } from '../domain/management'
import { activeReviewActor, ReviewError, reviewTransaction, type ReviewSnapshot } from './management-review'
import { managementTargets } from './management-targets'
import { withPersonalAi } from './admin-context'
import { generate } from './client'

type Tx = Prisma.TransactionClient
type Input = Record<string, unknown>
const stale = () => new ReviewError('رکورد یا پیش‌نویس تغییر کرده است. پیش از اقدام دوباره بررسی کنید.', 409)

async function context(tx: Tx, req: NextRequest, input: Input) {
  if (!Number.isSafeInteger(input.id) || Number(input.id) < 1 || !Number.isSafeInteger(input.version) ||
    !actionSignals.includes(input.signalId as ActionSignal)) throw new ReviewError('درخواست اقدام معتبر نیست')
  const { actor, scopeKey } = await activeReviewActor(req, tx)
  const row = await tx.aiManagementReview.findFirst({ where: { id: Number(input.id), ownerId: actor.id, scopeKey } })
  if (!row) throw new ReviewError('بررسی پیدا نشد', 404)
  if (row.version !== input.version) throw stale()
  const snapshot: ReviewSnapshot = JSON.parse(row.findings)
  const signal = input.signalId as ActionSignal
  const finding = snapshot.findings.find(item => item.id === signal)
  if (finding?.status !== 'APPROVED') throw new ReviewError('ابتدا مورد را برای پیگیری تأیید کنید', 409)
  return { actor, row, finding, signal, snapshot }
}

type Context = Awaited<ReturnType<typeof context>>

async function selectTarget(tx: Tx, ctx: Context, input: Input) {
  const pattern = ctx.signal === 'pay.delivery' ? /^[a-f0-9-]{36}$/ : /^[1-9][0-9]{0,9}$/
  if (typeof input.targetId !== 'string' || !pattern.test(input.targetId) ||
    (ctx.signal !== 'pay.delivery' && Number(input.targetId) > 2147483647) || typeof input.stamp !== 'string' || typeof input.command !== 'string') {
    throw new ReviewError('رکورد یا فرمان معتبر نیست')
  }
  const { targets } = await managementTargets(tx, ctx.actor, ctx.signal, input.targetId)
  const target = targets[0]
  const command = input.command as DeskCommand
  if (!target || target.stamp !== input.stamp || !target.commands.includes(command)) throw stale()
  return { target, command }
}

export function listDeskTargets(req: NextRequest, input: Input) {
  return reviewTransaction(async tx => {
    const current = await context(tx, req, input)
    return managementTargets(tx, current.actor, current.signal)
  })
}

export async function suggestDeskAction(req: NextRequest, input: Input) {
  const authorize = () => reviewTransaction(async tx => {
    const current = await context(tx, req, input)
    const { command } = await selectTarget(tx, current, input)
    if (command !== 'TICKET_NOTE' && command !== 'TICKET_REPLY') throw new ReviewError('این نوع پیش‌نویس در دسترس نیست')
    return { actorId: current.actor.id, internal: command === 'TICKET_NOTE' }
  })
  const { actorId, internal } = await authorize()
  const response = await withPersonalAi(actorId, () => generate({
    system: 'متن فارسی ساده، کوتاه و قابل ویرایش بنویس. فقط JSON با کلید text برگردان. نام، زمان تحویل، علت وقفه، وعده، لینک و اطلاعات شخصی نساز.',
    user: internal ? 'پیش‌نویس یادداشت داخلی برای بررسی یک تیکت باز بدون تغییر طی ۲۴ ساعت گذشته. از مسئول بخواه وضعیت را بررسی کند.' : 'پیش‌نویس محترمانه برای اطلاع به مشتری که تیکت باز است و در حال بررسی است. تعهد زمانی یا اعلام نتیجه نده.',
    maxTokens: 300, json: true,
  }), 'operations')
  const text = note(JSON.parse(response.text).text)
  if ((await authorize()).actorId !== actorId) throw stale()
  return { text }
}

function note(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 850 ||
    /[<>\u0000-\u0009\u000b-\u001f\u202a-\u202e\u2066-\u2069]/.test(value)) throw new ReviewError('متن باید ساده و بین ۲ تا ۸۵۰ نویسه باشد')
  return value.trim()
}

async function save(tx: Tx, req: NextRequest, ctx: Context, action: string, metadata: Record<string, unknown>) {
  const changed = await tx.aiManagementReview.updateMany({ where: { id: ctx.row.id, ownerId: ctx.actor.id, version: ctx.row.version },
    data: { findings: JSON.stringify(ctx.snapshot), version: { increment: 1 } } })
  if (!changed.count) throw stale()
  await auditAdminStrict({ req, actor: ctx.actor, action, targetType: 'ai-management-review', targetId: ctx.row.id, metadata }, tx)
}

export function prepareDeskAction(req: NextRequest, input: Input) {
  return reviewTransaction(async tx => {
    const current = await context(tx, req, input)
    const { target, command } = await selectTarget(tx, current, input)
    const draft: ManagementAction = { command, target, text: command === 'ORDER_ASSIGN' ? '' : note(input.text) }
    if (command === 'ORDER_ASSIGN') {
      const { assignees } = await managementTargets(tx, current.actor, current.signal)
      const assignee = assignees.find(candidate => candidate.id === input.assigneeId)
      if (!assignee) throw new ReviewError('کارشناس مجاز سفارش را انتخاب کنید')
      draft.assigneeId = assignee.id
      draft.text = `واگذاری سفارش به ${assignee.name}`
    }
    if (command === 'PAY_ASSESSMENT') {
      if (input.assessment !== 'CONFIRMED' && input.assessment !== 'UNCONFIRMED' && input.assessment !== 'NEEDS_REVIEW') throw new ReviewError('نتیجهٔ بررسی ربات را انتخاب کنید')
      if (input.assessment === 'CONFIRMED' && input.externallyChecked !== true) throw new ReviewError('مشاهدهٔ نتیجه در پنل ربات را تأیید کنید')
      draft.assessment = input.assessment
    }
    current.finding.action = draft
    await save(tx, req, current, 'ai.management.action_prepared', { signalId: current.signal, command, target: target.id })
  })
}

async function ready(tx: Tx, req: NextRequest, input: Input) {
  const current = await context(tx, req, input)
  const draft = current.finding.action
  if (!draft || draft.result) throw new ReviewError('پیش‌نویس قابل اجرا پیدا نشد', 409)
  await selectTarget(tx, current, { targetId: draft.target.id, stamp: draft.target.stamp, command: draft.command })
  return { ...current, draft }
}

export async function executeDeskAction(req: NextRequest, input: Input) {
  if (input.confirmed !== true) throw new ReviewError('تأیید اجرای همین پیش‌نویس لازم است')
  const selection = await reviewTransaction(tx => ready(tx, req, input))
  const { draft } = selection
  let admitted: typeof selection | undefined
  const beforeWrite = async (tx: Tx) => {
    const current = await ready(tx, req, input)
    if (current.actor.id !== selection.actor.id || JSON.stringify(current.draft) !== JSON.stringify(draft)) throw stale()
    admitted = current
  }
  const commit = async (tx: Tx, result: { id: number | string }) => {
    if (!admitted) throw stale()
    const current = admitted
    const at = new Date().toISOString()
    current.draft.result = { id: result.id, at }
    current.finding.status = 'DONE'
    current.finding.outcome = draft.command === 'PAY_ASSESSMENT' ? draft.text : 'اقدام در پنل بخش ثبت شد.'
    current.finding.decidedAt = at
    await save(tx, req, current, 'ai.management.action_applied', { signalId: current.signal, command: draft.command, target: draft.target.id, resultId: result.id, assessment: draft.assessment })
  }
  const id = Number(draft.target.id)
  if (draft.command === 'TICKET_NOTE' || draft.command === 'TICKET_REPLY') {
    await applyDeskTicketReply(req, { id, stamp: draft.target.stamp, note: draft.text, internal: draft.command === 'TICKET_NOTE' }, { beforeWrite, commit })
  } else if (draft.command === 'ORDER_NOTE') {
    await addOrderNote({ orderId: id, note: draft.text, visible: false, actorId: selection.actor.id, scope: { actorId: selection.actor.id, manager: true }, beforeWrite, commit })
  } else if (draft.command === 'ORDER_ASSIGN') {
    await assignOrder(id, draft.assigneeId, { actorId: selection.actor.id, manager: true }, { beforeWrite, commit })
  } else if (draft.command === 'PAY_ASSESSMENT') {
    await reviewTransaction(async tx => {
      await beforeWrite(tx)
      await commit(tx, { id: draft.target.id })
    })
  }
}
