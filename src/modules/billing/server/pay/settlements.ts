import { createHash, randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { formatAtoms, idempotencyKey, quoteAmounts, rial, text } from '@/modules/billing/domain/pay-policy'
import { cleanSheba, validSheba } from '@/modules/billing/domain/card-transfer'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from './context'
import { fingerprint } from './payments'

function validTron(value: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n = 0n
  for (const char of value) n = n * 58n + BigInt(alphabet.indexOf(char))
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 25 || bytes[0] !== 0x41) return false
  const checksum = createHash('sha256')
    .update(createHash('sha256').update(bytes.subarray(0, 21)).digest())
    .digest()
    .subarray(0, 4)
  return checksum.equals(bytes.subarray(21))
}
function destinationFor(asset: string, input: unknown) {
  const value = text(input, 150)
  if (asset === 'IRR') {
    if (!validSheba(value)) throw new PayError('شمارهٔ شبای معتبر لازم است')
    return cleanSheba(value)
  }
  if (!validTron(value)) throw new PayError('آدرس شبکهٔ TRON معتبر نیست')
  return value
}
export async function createPayQuote(actor: PayActor, input: Record<string, unknown>) {
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true),
      { settings } = await payContext(actor, tx)
    const rail = settings.rails.find((item) => item.id === input.railId)
    if (!rail) throw new PayError('مسیر تسویه پیدا نشد')
    if (rial(input.amountRial) < BigInt(settings.minSettlementRial))
      throw new PayError('مبلغ کمتر از حداقل تسویه است')
    const amounts = quoteAmounts(input.amountRial, rail)
    const wallet = await tx.walletAccount.findUnique({
      where: { userId_currency: { userId: actor.id, currency: 'IRR' } },
    })
    if (!wallet || wallet.withdrawableMinor < amounts.amountMinor)
      throw new PayError('درآمد قابل‌تسویه کافی نیست', 409)
    const row = await tx.paySettlementQuote.create({
      data: {
        id: randomUUID(),
        merchantId: merchant.id,
        railId: rail.id,
        asset: rail.asset,
        network: rail.network,
        decimals: rail.decimals,
        ...amounts,
        rialPerUnit: rail.rialPerUnit,
        expiresAt: new Date(Date.now() + 5 * 60000),
      },
    })
    return {
      id: row.id,
      railId: rail.id,
      asset: row.asset,
      network: row.network,
      amountRial: row.amountMinor.toString(),
      feeRial: row.feeMinor.toString(),
      payoutAmount: formatAtoms(row.payoutAtoms, row.decimals),
      rateRialPerUnit: row.rialPerUnit,
      expiresAt: row.expiresAt.toISOString(),
    }
  })
}
export async function requestPaySettlement(actor: PayActor, input: Record<string, unknown>, key: string) {
  const quoteId = text(input.quoteId, 60),
    idem = idempotencyKey(key),
    rawDestination = text(input.destination, 150)
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    const hash = fingerprint({ quoteId, destination: rawDestination })
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
    if (await tx.paySettlement.count({ where: { quoteId } }))
      throw new PayError('این پیش‌فاکتور قبلاً استفاده شده است', 409)
    const destination = destinationFor(quote.asset, rawDestination),
      id = randomUUID()
    const reserved = await moveWallet(
      {
        userId: actor.id,
        amount: '-' + quote.amountMinor.toString(),
        currency: 'IRR',
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
        amountMinor: quote.amountMinor,
        feeMinor: quote.feeMinor,
        payoutAtoms: quote.payoutAtoms,
        asset: quote.asset,
        network: quote.network,
        decimals: quote.decimals,
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
    })
    return row
  })
}
export async function decidePaySettlement(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60),
    action = text(input.action, 20)
  if (!['approve', 'reject', 'paid'].includes(action)) throw new PayError('عملیات معتبر نیست')
  return payTransaction(async (tx) => {
    await payContext(actor, tx, 'mobocom-pay.settle')
    const row = await tx.paySettlement.findUnique({ where: { id }, include: { merchant: true } })
    if (!row) throw new PayError('درخواست پیدا نشد', 404)
    if (row.merchant.userId === actor.id) throw new PayError('بررسی تسویهٔ خودتان مجاز نیست', 403)
    const reason = action === 'reject' ? text(input.reason, 500) : ''
    const ref = action === 'paid' ? text(input.reference, 120) : ''
    if (
      action === 'paid' &&
      (row.asset === 'IRR' ? !/^[A-Za-z0-9_-]{6,100}$/.test(ref) : !/^[a-fA-F0-9]{64}$/.test(ref))
    )
      throw new PayError('مرجع انتقال بانکی یا هش تراکنش معتبر لازم است')
    if (
      action === 'paid' &&
      (await tx.paySettlement.count({
        where: { asset: row.asset, network: row.network, reference: ref, status: 'PAID', id: { not: id } },
      }))
    )
      throw new PayError('مرجع انتقال قبلاً استفاده شده است', 409)
    const status = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'PAID'
    const expected =
      action === 'paid'
        ? 'APPROVED'
        : row.status === 'APPROVED' && action === 'reject'
          ? 'APPROVED'
          : 'REQUESTED'
    const claimed = await tx.paySettlement.updateMany({
      where: { id, status: expected },
      data: {
        status,
        reason,
        reference: ref,
        ...(action === 'approve' ? { approvedById: actor.id } : { completedById: actor.id }),
      },
    })
    if (claimed.count !== 1) throw new PayError('درخواست قبلاً بررسی یا تسویه شده است', 409)
    if (action === 'reject') {
      const release = await moveWallet(
        {
          userId: row.merchant.userId,
          amount: row.amountMinor.toString(),
          currency: 'IRR',
          type: 'PAY_RELEASE',
          funds: 'WITHDRAWABLE',
          idempotencyKey: 'pay-release:' + id,
          description: 'بازگشت رزرو تسویهٔ ردشده',
        },
        tx,
      )
      if (!release.ok || !release.txId) throw new PayError('بازگشت رزرو انجام نشد', 409)
      const linked = await tx.paySettlement.updateMany({
        where: { id, status: 'REJECTED', releaseWalletTxId: null },
        data: { releaseWalletTxId: release.txId },
      })
      if (linked.count !== 1) throw new PayError('رزرو هم‌زمان تغییر کرده است', 409)
    }
    await payAudit(tx, actor, 'settlement.' + action, id, {
      before: row.status,
      status,
      reference: ref,
      reason,
    })
    await createInboxEvent(
      {
        userId: row.merchant.userId,
        kind: 'MOBOCOM_PAY',
        dedupeKey: 'pay-settlement:' + id + ':' + status,
        titleFa:
          action === 'paid'
            ? 'تسویه ثبت شد'
            : action === 'reject'
              ? 'درخواست تسویه رد شد'
              : 'درخواست تسویه تأیید شد',
        titleEn: 'Settlement updated',
        bodyFa: reason,
        href: '/pay/merchant',
        channels: [],
      },
      tx,
    )
    return tx.paySettlement.findUniqueOrThrow({ where: { id } })
  })
}
