import { PayError } from '@/modules/billing/domain/pay'
import { text } from '@/modules/billing/domain/pay-policy'
import { minorToDecimal } from '@/shared/money'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'

export async function decidePaySettlement(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60),
    action = text(input.action, 20)
  if (!['approve', 'reject', 'paid'].includes(action)) throw new PayError('عملیات معتبر نیست')
  return payTransaction(async (tx) => {
    await payContext(actor, tx, 'mobocom-pay.settle')
    const row = await tx.paySettlement.findUnique({ where: { id }, include: { merchant: true } })
    if (!row) throw new PayError('درخواست پیدا نشد', 404)
    if (row.merchant.userId === actor.id) throw new PayError('بررسی تسویهٔ خودتان مجاز نیست', 403)
    if (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version !== row.version)) throw new PayError('درخواست تغییر کرده است؛ صف را بازخوانی کنید', 409, 'PAY_SETTLEMENT_CHANGED')
    if (row.requiresSecondApproval && input.version === undefined) throw new PayError('برای بررسی دوم، نسخهٔ درخواست لازم است', 422, 'PAY_VERSION_REQUIRED')
    if (action !== 'reject' && row.scheduledFor && row.scheduledFor > new Date()) throw new PayError('زمان بررسی این درخواست هنوز نرسیده است', 409, 'PAY_SETTLEMENT_SCHEDULED')
    const second = action === 'approve' && row.requiresSecondApproval && row.approvedById !== null
    if (second && row.approvedById === actor.id) throw new PayError('تأیید دوم باید توسط مدیر دیگری انجام شود', 403, 'PAY_SECOND_REVIEWER_REQUIRED')
    if (action === 'paid' && row.requiresSecondApproval && (!row.secondApprovedById || row.secondApprovedById === row.approvedById)) throw new PayError('تأیید مستقل مدیر دوم لازم است', 409, 'PAY_SECOND_APPROVAL_REQUIRED')
    const reason = action === 'reject' ? text(input.reason, 500) : ''
    const rawRef = action === 'paid' ? text(input.reference, 120) : ''
    const ref = row.asset !== 'IRR' ? rawRef.toLowerCase().replace(/^0x/, '') : rawRef
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
    const status = action === 'approve' ? row.requiresSecondApproval && !second ? 'REQUESTED' : 'APPROVED' : action === 'reject' ? 'REJECTED' : 'PAID'
    const expected =
      action === 'paid'
        ? 'APPROVED'
        : row.status === 'APPROVED' && action === 'reject'
          ? 'APPROVED'
          : 'REQUESTED'
    const claimed = await tx.paySettlement.updateMany({
      where: { id, status: expected, version: row.version },
      data: {
        status,
        reason,
        reference: ref,
        version: { increment: 1 },
        ...(action === 'approve' ? second ? { secondApprovedById: actor.id, secondApprovedAt: new Date() } : { approvedById: actor.id, firstApprovedAt: new Date() } : { completedById: actor.id }),
      },
    })
    if (claimed.count !== 1) throw new PayError('درخواست قبلاً بررسی یا تسویه شده است', 409)
    if (action === 'reject') {
      const release = await moveWallet(
        {
          userId: row.merchant.userId,
          amount: minorToDecimal(row.sourceMinor, row.sourceCurrency),
          currency: row.sourceCurrency,
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
        data: { releaseWalletTxId: release.txId, version: { increment: 1 } },
      })
      if (linked.count !== 1) throw new PayError('رزرو هم‌زمان تغییر کرده است', 409)
    }
    await payAudit(tx, actor, 'settlement.' + (second ? 'second-approve' : action), id, {
      before: row.status,
      status,
      reference: ref,
      reason,
      requiresSecondApproval: row.requiresSecondApproval,
      version: row.version,
    })
    await createInboxEvent(
      {
        userId: row.merchant.userId,
        kind: 'MOBOCOM_PAY',
        dedupeKey: 'pay-settlement:' + id + ':' + status + (action === 'approve' && row.requiresSecondApproval ? second ? ':second' : ':first' : ''),
        titleFa:
          action === 'paid'
            ? 'تسویه ثبت شد'
            : action === 'reject'
              ? 'درخواست تسویه رد شد'
              : status === 'REQUESTED' ? 'تأیید نخست تسویه ثبت شد؛ در انتظار مدیر دوم' : 'درخواست تسویه تأیید شد',
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
