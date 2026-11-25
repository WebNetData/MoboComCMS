import { randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { idempotencyKey, text } from '@/modules/billing/domain/pay-policy'
import { minorToDecimal } from '@/shared/money'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from '../context'
import { fingerprint } from '../payments'
import { normalizeSettlementDestination } from './validation'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { MAX_SETTLEMENT_SCHEDULE_DAYS } from '@/modules/billing/domain/pay-settlement-center'

function scheduleInput(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new PayError('زمان‌بندی باید تاریخ معتبر UTC باشد')
  return new Date(value)
}

export async function requestPaySettlement(actor: PayActor, input: Record<string, unknown>, key: string) {
  const quoteId = text(input.quoteId, 60),
    idem = idempotencyKey(key),
    rawDestination = text(input.destination, 150)
  const scheduledFor = scheduleInput(input.scheduledFor)
  const profileId = input.destinationProfileId === undefined ? null : text(input.destinationProfileId, 60)
  if (profileId && (!Number.isSafeInteger(input.destinationVersion) || Number(input.destinationVersion) < 0)) throw new PayError('نسخهٔ مقصد ذخیره‌شده لازم است')
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    const hash = fingerprint({ quoteId, destination: rawDestination, ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}), ...(profileId ? { destinationProfileId: profileId, destinationVersion: input.destinationVersion as number } : {}) })
    const previous = await tx.paySettlement.findUnique({
      where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey: idem } },
    })
    if (previous) {
      if (previous.fingerprint !== hash)
        throw new PayError('کلید تکرار با درخواست دیگری استفاده شده است', 409)
      return previous
    }
    const quote = await tx.paySettlementQuote.findFirst({ where: { id: quoteId, merchantId: merchant.id } })
    if (!quote || quote.expiresAt <= new Date())
      throw new PayError('پیش‌فاکتور تسویه منقضی شده است', 409, 'QUOTE_EXPIRED')
    const { settings } = await payContext(actor, tx)
    if (!settings.rails.some((rail) => rail.id === quote.railId && rail.enabled))
      throw new PayError('مسیر تسویه متوقف شده است', 409)
    if (scheduledFor && (scheduledFor.getTime() <= Date.now() || scheduledFor.getTime() > Date.now() + MAX_SETTLEMENT_SCHEDULE_DAYS * 86400000)) throw new PayError('زمان تسویه باید در آینده و حداکثر تا ۳۰ روز باشد', 422, 'PAY_SCHEDULE_INVALID')
    if (await tx.paySettlement.count({ where: { quoteId } }))
      throw new PayError('این پیش‌فاکتور قبلاً استفاده شده است', 409)
    if (['BSC','ETHEREUM'].includes(quote.network) && input.ackNetwork !== true) throw new PayError('شبکه و مقصد تسویه را صریحاً تأیید کنید', 422)
    const destination = normalizeSettlementDestination(quote.asset, quote.network, rawDestination),
      id = randomUUID()
    const profile = profileId ? await tx.paySettlementDestination.findFirst({ where: { id: profileId, merchantId: merchant.id, active: true, version: Number(input.destinationVersion) } }) : null
    if (profileId && (!profile || profile.railId !== quote.railId || profile.asset !== quote.asset || profile.network !== quote.network || profile.destination !== destination)) throw new PayError('مقصد یا نسخهٔ آن تغییر کرده است؛ دوباره انتخاب کنید', 409, 'PAY_DESTINATION_CHANGED')
    const approvalThresholdRial = BigInt(settings.settlementApprovalThresholdRial)
    const reserved = await moveWallet(
      {
        userId: actor.id,
        amount: minorToDecimal(-quote.sourceMinor, quote.sourceCurrency),
        currency: quote.sourceCurrency,
        type: 'PAY_RESERVE',
        funds: 'WITHDRAWABLE',
        idempotencyKey: 'pay-reserve:' + id,
        description: 'رزرو درخواست تسویهٔ موبوکام‌پی',
      },
      tx,
    )
    if (!reserved.ok || !reserved.txId) throw new PayError('درآمد قابل‌تسویه کافی نیست', 409)
    const row = await tx.paySettlement.create({
      data: {
        id,
        merchantId: merchant.id,
        quoteId,
        idempotencyKey: idem,
        fingerprint: hash,
        scheduledFor,
        destinationProfileId: profile?.id || null,
        destinationVersion: profile?.version || 0,
        destinationLabel: profile?.label || '',
        approvalThresholdRial,
        approvalPolicyRevision: sectionSettingsRevision(settings),
        requiresSecondApproval: approvalThresholdRial > 0n && quote.amountMinor >= approvalThresholdRial,
        amountMinor: quote.amountMinor,
        feeMinor: quote.feeMinor,
        payoutAtoms: quote.payoutAtoms,
        asset: quote.asset,
        network: quote.network,
        decimals: quote.decimals,
        sourceCurrency: quote.sourceCurrency, sourceMinor: quote.sourceMinor, sourceRateRial: quote.sourceRateRial, rateAt: quote.rateAt,
        feeCurrency: quote.feeCurrency, feeAmount: quote.feeAmount, feePolicySnapshot: quote.feePolicySnapshot,
        destination,
        reserveWalletTxId: reserved.txId,
      },
    })
    await payAudit(tx, actor, 'settlement.request', id, {
      amountRial: quote.amountMinor,
      asset: quote.asset,
      network: quote.network,
      quoteId,
      walletTxId: reserved.txId,
      scheduledFor: scheduledFor?.toISOString() || null,
      requiresSecondApproval: row.requiresSecondApproval,
      destinationProfileId: profile?.id || null,
    })
    return row
  })
}
