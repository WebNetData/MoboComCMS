import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { MAX_SETTLEMENT_BATCH, type PaySettlementBatchResult } from '@/modules/billing/domain/pay-settlement-center'
import { payContext, payTransaction, type PayActor } from '../context'
import { settlementView } from '../views'
import { decidePaySettlement } from '../settlements'

export function settlementQueue(actor: PayActor, params: URLSearchParams) {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.settle'), now = new Date()
    const due = { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] }
    const phases: Record<string, Prisma.PaySettlementWhereInput> = {
      due: { status: 'REQUESTED', ...due },
      scheduled: { status: 'REQUESTED', scheduledFor: { gt: now } },
      second: { status: 'REQUESTED', requiresSecondApproval: true, approvedById: { not: null }, ...due },
      approved: { status: 'APPROVED' },
    }
    const phase = params.get('phase') || '', status = params.get('status') || '', q = (params.get('q') || '').trim()
    if (phase && !phases[phase] || status && !['REQUESTED','APPROVED','PAID','REJECTED'].includes(status) || q.length > 100) throw new PayError('فیلتر صف معتبر نیست')
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1))
    const where: Prisma.PaySettlementWhereInput = { AND: [phase ? phases[phase] : {}, status ? { status } : {}, q ? { OR: [{ id: { contains: q } }, { merchant: { name: { contains: q } } }, { reference: { contains: q } }] } : {}] }
    const [total, rows, dueCount, scheduled, secondApproval, approved] = await Promise.all([
      tx.paySettlement.count({ where }), tx.paySettlement.findMany({ where, include: { merchant: { select: { name: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (Math.trunc(page) - 1) * 25, take: 25 }),
      ...['due','scheduled','second','approved'].map(p => tx.paySettlement.count({ where: phases[p] })),
    ])
    return { page: Math.trunc(page), pages: Math.max(1, Math.ceil(total / 25)), total, items: rows.map(r => ({ ...settlementView(r), merchantName: r.merchant.name })), counts: { due: dueCount, scheduled, secondApproval, approved }, approvalThresholdRial: settings.settlementApprovalThresholdRial }
  })
}

/** Deliberately per-request transactions and version claims, never a bulk financial UPDATE. */
export async function decideSettlementBatch(actor: PayActor, input: Record<string, unknown>): Promise<PaySettlementBatchResult> {
  if (Object.keys(input).some(k => !['action','items','reason'].includes(k)) || !['approve','reject'].includes(String(input.action)) || !Array.isArray(input.items) || !input.items.length || input.items.length > MAX_SETTLEMENT_BATCH) throw new PayError('گروه بررسی باید ۱ تا ۲۵ درخواست داشته باشد')
  const items = input.items as Record<string, unknown>[]
  if (items.some(x => !x || typeof x !== 'object' || Object.keys(x).length !== 2 || typeof x.id !== 'string' || x.id.length > 60 || !Number.isSafeInteger(x.version) || Number(x.version) < 0) || new Set(items.map(x => x.id)).size !== items.length) throw new PayError('شناسه و نسخهٔ یکتای درخواست‌ها لازم است')
  await payTransaction(tx => payContext(actor, tx, 'mobocom-pay.settle'))
  const result: PaySettlementBatchResult['items'] = []
  for (const item of items) {
    try { const row = await decidePaySettlement(actor, { ...item, action: input.action, reason: input.reason }); result.push({ id: String(item.id), ok: true, status: row.status, message: row.status === 'REQUESTED' ? 'تأیید نخست ثبت شد؛ مدیر دوم باید بررسی کند' : 'تصمیم ثبت شد' }) }
    catch (error) { if (!(error instanceof PayError) && !['P2002','P2034'].includes(String((error as { code?: string }).code))) throw error; result.push({ id: String(item.id), ok: false, code: error instanceof PayError ? error.code : 'PAY_RETRY', message: error instanceof PayError ? error.message : 'درخواست هم‌زمان تغییر کرده؛ بازخوانی کنید' }) }
  }
  return { items: result }
}
