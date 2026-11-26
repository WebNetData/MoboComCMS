import { PayError } from '@/modules/billing/domain/pay'
import { merchantFor, payAudit, payTransaction, type PayActor } from './context'

/** Owners can allocate the platform fee while pricing stays under platform administration. */
export async function saveMerchantFeeShare(actor: PayActor, input: Record<string, unknown>) {
  const share = input.customerFeeShareBps
  if (actor.machine) throw new PayError('تغییر سهم کارمزد فقط در پنل پذیرنده مجاز است', 403)
  if (Object.keys(input).length !== 1 ||
      share !== null && (typeof share !== 'number' || !Number.isInteger(share) || share < 0 || share > 10000))
    throw new PayError('سهم مشتری باید بین صفر تا ۱۰۰ درصد باشد', 422)
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx, true)
    const claimed = await tx.payMerchant.updateMany({
      where: { id: merchant.id, version: merchant.version + 1, status: 'ACTIVE' },
      data: { customerFeeShareBps: share },
    })
    if (claimed.count !== 1) throw new PayError('تنظیمات هم‌زمان تغییر کرده است', 409)
    await payAudit(tx, actor, 'merchant.fee-share', merchant.id, { previous: merchant.customerFeeShareBps, customerFeeShareBps: share })
    return { customerFeeShareBps: share }
  })
}
