import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { reference } from '@/modules/billing/domain/pay-policy'

/** Keep the existing approved-receipt reference fence when the customer omits it. */
export async function approvalReference(
  tx: Prisma.TransactionClient,
  receipt: { id: number; trackingCode: string; bankAccountId: number | null },
  supplied: unknown,
) {
  const trackingCode = receipt.trackingCode || reference(supplied)
  const duplicate = await tx.paymentReceipt.findFirst({
    where: {
      id: { not: receipt.id }, userId: null, status: 'APPROVED',
      bankAccountId: receipt.bankAccountId, trackingCode: { equals: trackingCode, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (duplicate) throw new PayError('این شمارهٔ پیگیری قبلاً برای رسید دیگری تأیید شده است', 409)
  return trackingCode
}
