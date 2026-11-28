import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import { PayError } from '@/modules/billing/domain/pay'

/** A full-access merchant may approve a receipt for their own Pay collection. */
export async function canApproveOwnPayReceipt(tx: Prisma.TransactionClient, req: NextRequest, actorId: number) {
  const admin = await requirePerm(req, 'mobocom-pay.manage', tx)
  return Boolean(admin && admin.id === actorId && actorHasFullAccess(admin))
}

export async function assertOwnPayReceiptApproval(
  tx: Prisma.TransactionClient, req: NextRequest, actorId: number, eligibleReceipt: boolean,
) {
  if (!eligibleReceipt) throw new PayError('این بررسی توسط صاحب پرداخت مجاز نیست', 403)
  if (!await canApproveOwnPayReceipt(tx, req, actorId)) {
    throw new PayError('تأیید دستی رسید پذیرندگی خودتان به دسترسی مدیر کل نیاز دارد', 403)
  }
}
