import type { NextRequest } from 'next/server'
import { PayError } from '@/modules/billing/domain/pay'
import type { MerchantPortalAccess } from '@/modules/billing/domain/pay-merchant-admin'
import { payActor, payContext, payTransaction } from '../context'
import { requireUser } from '@/modules/identity/server/access'

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
