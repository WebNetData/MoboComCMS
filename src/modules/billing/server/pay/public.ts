import { randomUUID } from 'node:crypto'
import { getExtensionState } from '@/extensions/server/state'
import { PayError } from '@/modules/billing/domain/pay'
import { httpsUrl, text } from '@/modules/billing/domain/pay-policy'
import { payAudit, payContext, payTransaction, type PayActor } from './context'

/** A request creates no payment capability; an administrator must activate it. */
export async function applyPayMerchant(actor: PayActor, input: Record<string, unknown>) {
  if (actor.machine || Object.keys(input).some(key => !['name', 'website', 'note'].includes(key))) throw new PayError('درخواست معتبر نیست', 422)
  const name = text(input.name, 100)
  if (!name) throw new PayError('نام کسب‌وکار لازم است', 422)
  const website = input.website === undefined || input.website === '' ? '' : httpsUrl(input.website)
  const note = input.note === undefined || input.note === '' ? '' : text(input.note, 300)
  return payTransaction(async tx => {
    await payContext(actor, tx)
    const settings = (await getExtensionState('mobocom-pay', [], tx, true)).settings
    if (settings['public.applications-enabled'] === false) throw new PayError('ثبت درخواست پذیرندگی فعلاً بسته است', 403)
    const existing = await tx.payMerchant.findUnique({ where: { userId: actor.id }, select: { status: true } })
    if (existing) return { status: existing.status }
    const row = await tx.payMerchant.create({ data: { id: randomUUID(), userId: actor.id, name, website, status: 'PENDING' } })
    await payAudit(tx, actor, 'merchant.application', row.id, { note })
    return { status: row.status }
  })
}
