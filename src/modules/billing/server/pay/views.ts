import { minorToDecimal } from '@/shared/money'
import { assetBalances } from './balances'
import { creditCurrency } from './assets'
import type { Prisma, PayMerchant, PaySettlement, PayTerminal } from '@prisma/client'
import { PayError, type PayMerchantView, type PayPaymentView, type PaySettlementView } from '@/modules/billing/domain/pay'
import { formatAtoms, merchantFeeTerms, defaults } from '@/modules/billing/domain/pay-policy'
import { isModuleEnabled } from '@/extensions/server/modules'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { payContext, payTransaction, type PayActor } from './context'
import { bankFeedReady, paySettings } from './settings'
import { publicPayment } from './payments'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'

export const terminalView = (row: PayTerminal) => ({
  channelType: row.channelType as import('@/modules/billing/domain/pay').PayChannelType, channelUrl: row.channelUrl,
  baleEnabled: row.baleEnabled,
  id: row.id,
  name: row.name,
  returnUrl: row.returnUrl,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
})
export const merchantView = (row: PayMerchant, proceeds = 0n, settings = defaults()): PayMerchantView => ({
  baleAllowed: row.baleAllowed,
  creditCurrency: creditCurrency(row.creditCurrency),
  fees: merchantFeeTerms(settings, row),
  id: row.id,
  userId: row.userId,
  name: row.name,
  website: row.website,
  status: row.status as PayMerchantView['status'],
  proceedsRial: proceeds.toString(),
  createdAt: row.createdAt.toISOString(),
})
export { paymentView } from './payment-view'
import { paymentView, collectionProjection, paymentStatusFilter } from './payment-view'
export const settlementView = (row: PaySettlement): PaySettlementView => ({
  sourceCurrency: creditCurrency(row.sourceCurrency), sourceAmount: minorToDecimal(row.sourceMinor, row.sourceCurrency), feeCurrency: creditCurrency(row.feeCurrency), feeAmount: row.feeAmount,
  id: row.id,
  amountRial: row.amountMinor.toString(),
  feeRial: row.feeMinor.toString(),
  payoutAmount: formatAtoms(row.payoutAtoms, row.decimals),
  asset: row.asset,
  network: row.network,
  destination: row.destination,
  status: row.status as PaySettlementView['status'],
  reference: row.reference,
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export { checkoutView } from './checkout-view'
async function merchantRead(actor: PayActor, tx: Prisma.TransactionClient) {
  await payContext(actor, tx)
  const merchant = await tx.payMerchant.findUnique({ where: { userId: actor.id } })
  if (!merchant || merchant.status !== 'ACTIVE') throw new PayError('این پنل فقط برای پذیرندگان فعال است', 403, 'PAY_MERCHANT_INACTIVE')
  return merchant
}
export async function payOverview(actor: PayActor) {
  return payTransaction(async (tx) => {
    const merchant = await merchantRead(actor, tx),
      settings = await paySettings.read(tx)
    const wallet = await tx.walletAccount.findUnique({
      where: { userId_currency: { userId: actor.id, currency: 'IRR' } },
    })
    const where = { merchantId: merchant?.id || '__none__' }
    const [terminals, payments, settlements, totals, pendingCount, reserved, collectionFees] = await Promise.all([
      tx.payTerminal.findMany({ where, orderBy: { createdAt: 'desc' } }),
      tx.payPayment.findMany({
        where,
        include: { terminal: true, invoice: collectionProjection },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      tx.paySettlement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10 }),
      tx.payPayment.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: { totalMinor: true, feeMinor: true, netMinor: true, creditRoundingRial: true },
        _count: true,
      }),
 tx.payPayment.count({ where: { ...where, ...paymentStatusFilter('PENDING', new Date()) } }),
      tx.paySettlement.aggregate({
        where: { ...where, sourceCurrency: 'IRR', status: { in: ['REQUESTED', 'APPROVED'] } },
        _sum: { amountMinor: true },
      }),
      tx.payBaleCollection.aggregate({
        where: { status: 'PAID', invoice: { payCollection: { merchantId: merchant.id, status: 'PAID' } } },
        _sum: { paidCollectedRial: true, principalRial: true },
      }),
    ])
    const trend = []
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    for (let offset = 13; offset >= 0; offset--) {
      const start = new Date(today.getTime() - offset * 86400000),
        end = new Date(start.getTime() + 86400000)
      const day = await tx.payPayment.aggregate({
        where: { ...where, status: 'PAID', paidAt: { gte: start, lt: end } },
        _sum: { totalMinor: true },
        _count: true,
      })
      trend.push({
        date: start.toISOString().slice(0, 10),
        grossRial: (day._sum.totalMinor || 0n).toString(),
        count: day._count,
      })
    }
    const proceeds = wallet?.withdrawableMinor || 0n
    const balances = await assetBalances(tx, actor.id, merchant.id, settings.usdtRateMaxAgeMinutes)
    return {
      assetBalances: balances,
      merchant: merchant ? merchantView(merchant, proceeds, settings) : null,
      terminals: terminals.map(terminalView),
      rails: settings.rails.map(({ id, asset, network, enabled }) => ({ id, asset, network, enabled })),
      payments: payments.map(paymentView),
      settlements: settlements.map(settlementView),
      stats: {
        creditedRial: ((totals._sum.netMinor || 0n) - (totals._sum.creditRoundingRial || 0n)).toString(),
        serviceFeeRial: ((collectionFees._sum.paidCollectedRial || 0n) - (collectionFees._sum.principalRial || 0n)).toString(),
        platformFeeRial: ((totals._sum.feeMinor || 0n) + (totals._sum.creditRoundingRial || 0n) + (collectionFees._sum.paidCollectedRial || 0n) - (collectionFees._sum.principalRial || 0n)).toString(),
        availableRial: proceeds.toString(),
        walletRial: (wallet?.balanceMinor || 0n).toString(),
        proceedsRial: proceeds.toString(),
        pendingSettlementRial: (reserved._sum.amountMinor || 0n).toString(),
        grossRial: (totals._sum.totalMinor || 0n).toString(),
        feeRial: (totals._sum.feeMinor || 0n).toString(),
        netRial: (totals._sum.netMinor || 0n).toString(),
        paidCount: totals._count,
        pendingCount,
        trend,
      },
      readiness: {
        incomingEnabled: settings.incomingEnabled,
        bankFeedReady: bankFeedReady(settings.providerId),
      },
    }
  })
}
export async function payList(actor: PayActor, resource: 'payments' | 'settlements', sp: URLSearchParams) {
  return payTransaction(async (tx) => {
    const merchant = await merchantRead(actor, tx)
    const page = Math.max(1, Math.min(100000, Number(sp.get('page')) || 1)),
      take = sp.get('format') === 'csv' ? 1000 : 25
    if (!Number.isSafeInteger(page)) throw new PayError('شماره صفحه معتبر نیست')
    const status = sp.get('status') || '',
      q = (sp.get('q') || '').trim().slice(0, 100)
    const scope = { merchantId: merchant?.id || '__none__' }
    if (resource === 'payments') {
      const where: Prisma.PayPaymentWhereInput = { ...scope, ...(q ? { externalId: { contains: q } } : {}) }
 if (status === 'EXPIRED' || status === 'PENDING' || status === 'UNDER_REVIEW') Object.assign(where, paymentStatusFilter(status, new Date()))
      else if (status === 'PAID') where.status = status
      else if (status) throw new PayError('وضعیت معتبر نیست')
      const [rows, total] = await Promise.all([
        tx.payPayment.findMany({
          where,
          include: { terminal: true, invoice: collectionProjection },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * take,
          take,
        }),
        tx.payPayment.count({ where }),
      ])
      return { items: rows.map(paymentView), page, pages: Math.max(1, Math.ceil(total / take)), total }
    }
    if (status && !['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'].includes(status))
      throw new PayError('وضعیت معتبر نیست')
    const where: Prisma.PaySettlementWhereInput = {
      ...scope,
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ id: { contains: q } }, { reference: { contains: q } }] } : {}),
    }
    const [rows, total] = await Promise.all([
      tx.paySettlement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * take,
        take,
      }),
      tx.paySettlement.count({ where }),
    ])
    return { items: rows.map(settlementView), page, pages: Math.max(1, Math.ceil(total / take)), total }
  })
}
export async function payPaymentById(actor: PayActor, id: string) {
  return payTransaction(async (tx) => {
    const merchant = await merchantRead(actor, tx)
    const row = merchant
      ? await tx.payPayment.findFirst({ where: { id, merchantId: merchant.id }, include: { terminal: true, invoice: collectionProjection } })
      : null
    if (!row) throw new PayError('پرداخت پیدا نشد', 404)
    return paymentView(row)
  })
}
export async function adminPayOverview(actor: PayActor) {
  return payTransaction(async (tx) => {
    // Settlement staff see only settlements; never bank configuration/merchant management.
    const { requirePerm } = await import('@/modules/identity/server/access')
    const manages = Boolean(await requirePerm(actor.req, 'mobocom-pay.manage', tx))
    await payContext(actor, tx, manages ? 'mobocom-pay.manage' : 'mobocom-pay.settle')
    const settings = await paySettings.read(tx)
    const merchants = manages
      ? await tx.payMerchant.findMany({
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: { user: { include: { walletAccounts: { where: { currency: 'IRR' } } } } },
        })
      : []
    const payments = manages
      ? await tx.payPayment.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { terminal: true, invoice: collectionProjection },
        })
      : []
    const settlements = await tx.paySettlement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { merchant: true },
    })
    const events = manages
      ? await tx.payBankEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      : []
    const bankAccounts = manages ? await tx.bankAccount.findMany({ orderBy: { id: 'asc' }, take: 200 }) : []
    return {
      permissions: {
        manage: manages,
        settle: Boolean(await requirePerm(actor.req, 'mobocom-pay.settle', tx)),
      },
      merchants: merchants.map((row) =>
        merchantView(row, row.user.walletAccounts[0]?.withdrawableMinor || 0n, settings),
      ),
      payments: payments.map(paymentView),
      settlements: settlements.map((row) => ({ ...settlementView(row), merchantName: row.merchant.name })),
      bankEvents: events.map((row) => ({
        id: row.id,
        providerId: row.providerId,
        externalId: row.externalId,
        amountRial: row.amountMinor.toString(),
        transferReference: row.transferReference,
        status: row.status,
        occurredAt: row.occurredAt.toISOString(),
        paymentId: row.paymentId,
      })),
      bankAccounts: bankAccounts.map((row) => ({
        id: row.id,
        collectionUse: row.collectionUse,
        title: row.bankName,
        bankName: row.bankName,
        cardNumber: row.cardNumber,
        active: row.active,
      })),
      settings: manages ? settings : { ...settings, bankAccountIds: [], providerId: '' },
      settingsRevision: manages ? sectionSettingsRevision(settings) : '',
      readiness: {
        bankFeedReady: manages && bankFeedReady(settings.providerId),
        providerId: manages ? settings.providerId : '',
      },
    }
  })
}
