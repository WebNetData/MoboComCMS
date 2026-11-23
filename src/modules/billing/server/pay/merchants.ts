import { randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { httpsUrl, text } from '@/modules/billing/domain/pay-policy'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from './context'

export async function enrollMerchant(actor: PayActor, input: Record<string, unknown>) {
  const name = text(input.name, 100),
    website = httpsUrl(input.website)
  return payTransaction(async (tx) => {
    await payContext(actor, tx)
    const previous = await tx.payMerchant.findUnique({ where: { userId: actor.id } })
    if (previous) return previous
    const row = await tx.payMerchant.create({ data: { id: randomUUID(), userId: actor.id, name, website } })
    await payAudit(tx, actor, 'merchant.enroll', row.id)
    return row
  })
}
export async function createTerminal(actor: PayActor, input: Record<string, unknown>) {
  const name = text(input.name, 100),
    returnUrl = httpsUrl(input.returnUrl)
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    if (new URL(returnUrl).origin !== new URL(merchant.website).origin)
      throw new PayError('نشانی بازگشت باید متعلق به وب‌سایت ثبت‌شده باشد')
    if ((await tx.payTerminal.count({ where: { merchantId: merchant.id } })) >= 20)
      throw new PayError('حداکثر ۲۰ پایانه قابل ثبت است')
    const row = await tx.payTerminal.create({
      data: { id: randomUUID(), merchantId: merchant.id, name, returnUrl },
    })
    await payAudit(tx, actor, 'terminal.create', row.id)
    return row
  })
}
export async function changeTerminal(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60)
  if (typeof input.active !== 'boolean') throw new PayError('وضعیت معتبر لازم است')
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    const changed = await tx.payTerminal.updateMany({
      where: { id, merchantId: merchant.id },
      data: { active: input.active as boolean },
    })
    if (changed.count !== 1) throw new PayError('پایانه پیدا نشد', 404)
    await payAudit(tx, actor, 'terminal.status', id, { active: input.active })
    return tx.payTerminal.findUniqueOrThrow({ where: { id } })
  })
}
export async function changeMerchant(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60),
    status = text(input.status, 20)
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw new PayError('وضعیت پذیرنده معتبر نیست')
  return payTransaction(async (tx) => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const previous = await tx.payMerchant.findUnique({ where: { id } })
    if (!previous) throw new PayError('پذیرنده پیدا نشد', 404)
    if (previous.userId === actor.id) throw new PayError('تأیید پذیرندگی خودتان مجاز نیست', 403)
    const user = await tx.user.findUnique({ where: { id: previous.userId } })
    if (!user || user.status !== 'ACTIVE') throw new PayError('حساب پذیرنده فعال نیست', 409)
    const claimed = await tx.payMerchant.updateMany({
      where: { id, status: previous.status, version: previous.version },
      data: { status, version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new PayError('وضعیت تغییر کرده است', 409)
    await payAudit(tx, actor, 'merchant.status', id, { before: previous.status, status })
    return tx.payMerchant.findUniqueOrThrow({ where: { id } })
  })
}
