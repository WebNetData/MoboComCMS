import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import type { MerchantPortalAccess } from '@/modules/billing/domain/pay-merchant-admin'
import { payActor, payContext, payTransaction } from '../context'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import type { PayActor } from '../context'

/** Membership administration is distinct from reviewing the owner's own money. */
export async function assertMerchantAdministration(actor: PayActor, targetUserId: number, tx: Prisma.TransactionClient) {
  const admin = await requirePerm(actor.req, 'mobocom-pay.manage', tx)
  if (!admin || admin.id !== actor.id || actor.machine) throw new PayError('مدیریت پذیرندگی به نشست معتبر مدیر نیاز دارد', 403)
  if (targetUserId === actor.id && !actorHasFullAccess(admin)) throw new PayError('مدیریت پذیرندگی حساب خودتان به دسترسی مدیر کل نیاز دارد', 403)
}

export async function merchantPortalAccess(req: NextRequest): Promise<MerchantPortalAccess> {
  // Identity is resolved by the canonical current-session guard, never copied from a client role.
  if (!await requireUser(req)) return { status: 'GUEST', name: '' }
  try {
    const actor = await payActor(req)
    return await payTransaction(async tx => {
      await payContext(actor, tx)
      const row = await tx.payMerchant.findUnique({ where: { userId: actor.id }, select: { status: true, name: true } })
      return { status: row && ['ACTIVE','PENDING','SUSPENDED'].includes(row.status) ? row.status as 'ACTIVE' | 'PENDING' | 'SUSPENDED' : 'DENIED', name: row?.name || '' }
    })
  } catch (error) { if (error instanceof PayError && [401,403].includes(error.status)) return { status: 'DENIED', name: '' }; throw error }
}

export function merchantAdminNote(value: unknown) {
  const note = typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f-\x9f<>]/g, ' ').trim() : ''
  if (note.length < 3 || note.length > 300) throw new PayError('دلیل تغییر را در ۳ تا ۳۰۰ نویسه بنویسید', 422)
  return note
}
