import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import type { MerchantDetail, MerchantDirectory } from '@/modules/billing/domain/pay-merchant-admin'
import { payContext, payTransaction, type PayActor } from '../context'
import { merchantView, terminalView } from '../views'
import { assetBalances } from '../balances'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { requirePerm } from '@/modules/identity/server/access'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'

export function merchantDirectory(actor: PayActor, params: URLSearchParams): Promise<MerchantDirectory> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('page'))) || 1)), q = (params.get('q') || '').trim().slice(0, 100), status = params.get('status') || ''
    if (status && !['ACTIVE','PENDING','SUSPENDED'].includes(status)) throw new PayError('وضعیت معتبر نیست', 422)
    const phone = normalizeMobile(q), admin = await requirePerm(actor.req, 'mobocom-pay.manage', tx)
    const where: Prisma.PayMerchantWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { user: { email: { equals: q, mode: 'insensitive' } } }, ...(phone ? [{ user: { phone: { in: [phone, `0${phone.slice(-10)}`, phone.replace('+', '')] } } }] : []), ...(Number.isSafeInteger(Number(q)) && Number(q) > 0 ? [{ userId: Number(q) }] : [])] } : {}) }
    const [total, rows] = await Promise.all([tx.payMerchant.count({ where }), tx.payMerchant.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25, include: { user: { select: { email: true, phone: true, status: true, walletAccounts: { where: { currency: 'IRR' }, select: { withdrawableMinor: true } } } }, _count: { select: { terminals: { where: { archivedAt: null } } } } } })])
    return { page, total, canProvisionSelf: !!admin && actorHasFullAccess(admin), pages: Math.max(1, Math.ceil(total / 25)), items: rows.map(row => ({ ...merchantView(row, row.user.walletAccounts[0]?.withdrawableMinor || 0n, settings), version: row.version, email: row.user.email, phone: row.user.phone, userStatus: row.user.status, terminalCount: row._count.terminals })) }
  })
}
export function merchantAdminDetail(actor: PayActor, id: string): Promise<MerchantDetail> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payMerchant.findUnique({ where: { id }, include: { user: { select: { email: true, phone: true, status: true, walletAccounts: { where: { currency: 'IRR' }, select: { withdrawableMinor: true } } } }, terminals: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, include: { botIntegration: true } } } })
    if (!row) throw new PayError('پذیرنده پیدا نشد', 404)
    const [payments, pendingSettlements, history] = await Promise.all([
      tx.payPayment.aggregate({ where: { merchantId: id, status: 'PAID' }, _sum: { totalMinor: true }, _count: true }),
      tx.paySettlement.count({ where: { merchantId: id, status: { in: ['REQUESTED','APPROVED'] } } }),
      tx.auditLog.findMany({ where: { targetType: 'mobocom-pay', targetId: id, action: { startsWith: 'mobocom-pay.merchant.' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
    ])
    const balances = await assetBalances(tx, row.userId, row.id, settings.usdtRateMaxAgeMinutes)
    return { assetBalances: balances, merchant: { ...merchantView(row, row.user.walletAccounts[0]?.withdrawableMinor || 0n, settings), version: row.version, email: row.user.email, phone: row.user.phone, userStatus: row.user.status, terminalCount: row.terminals.length }, terminals: row.terminals.map(t => ({ ...terminalView(t), bot: t.botIntegration ? { id: t.botIntegration.id, active: t.botIntegration.active, version: t.botIntegration.version, callbackUrl: t.botIntegration.callbackUrl } : null })), stats: { payments: payments._count, paidRial: (payments._sum.totalMinor || 0n).toString(), pendingSettlements }, history: history.map(h => { let note = ''; try { const m = JSON.parse(h.metadata); if (typeof m.note === 'string') note = m.note } catch {} return { id: h.id, action: h.action, note, actorId: h.actorUserId, at: h.createdAt.toISOString() } }) }
  })
}
