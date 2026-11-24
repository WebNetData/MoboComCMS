import { randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { httpsUrl, text, rial, integer } from '@/modules/billing/domain/pay-policy'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from './context'
import { merchantAdminNote } from './merchant-admin/access'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'

export async function enrollMerchant(actor: PayActor, input: Record<string, unknown>) {
  if (Object.keys(input).some(k => !['name','website','userId','email','note'].includes(k)) || (input.userId !== undefined) === (input.email !== undefined)) throw new PayError('یک شناسه یا ایمیل دقیق حساب لازم است', 422)
  const name = text(input.name, 100),
    website = httpsUrl(input.website), note = merchantAdminNote(input.note)
  if (!name) throw new PayError('نام کسب‌وکار لازم است', 422)
  const userId = typeof input.userId === 'number' ? input.userId : NaN, email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if ((!Number.isSafeInteger(userId) || userId < 1) && (!email || email.length > 254)) throw new PayError('شناسه یا ایمیل دقیق حساب موجود لازم است', 422)
  return payTransaction(async (tx) => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const user = await tx.user.findUnique({ where: Number.isSafeInteger(userId) && userId > 0 ? { id: userId } : { email } })
    if (!user || !await resolveCurrentUser(user.id, Date.now(), tx) || !await userOpensSection('mobocom-pay', user.id)) throw new PayError('حساب فعال و مجاز پیدا نشد', 409)
    if (user.id === actor.id) throw new PayError('ایجاد پذیرندگی برای خودتان مجاز نیست', 403)
    const previous = await tx.payMerchant.findUnique({ where: { userId: user.id } })
    if (previous) throw new PayError('این حساب از قبل پذیرنده دارد', 409)
    const row = await tx.payMerchant.create({ data: { id: randomUUID(), userId: user.id, name, website } })
    await payAudit(tx, actor, 'merchant.provision', row.id, { userId: user.id, note })
    return row
  })
}
export async function createTerminal(actor: PayActor, input: Record<string, unknown>) {
  const name = text(input.name, 100),
    returnUrl = httpsUrl(input.returnUrl)
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    if (input.baleEnabled !== undefined && typeof input.baleEnabled !== 'boolean') throw new PayError('وضعیت درگاه موبوکام معتبر نیست')
    if (input.baleEnabled === true && !merchant.baleAllowed) throw new PayError('مدیر هنوز استفاده از درگاه موبوکام را برای این پذیرنده مجاز نکرده است', 403)
    if (new URL(returnUrl).origin !== new URL(merchant.website).origin)
      throw new PayError('نشانی بازگشت باید متعلق به وب‌سایت ثبت‌شده باشد')
    if ((await tx.payTerminal.count({ where: { merchantId: merchant.id } })) >= 20)
      throw new PayError('حداکثر ۲۰ پایانه قابل ثبت است')
    const row = await tx.payTerminal.create({
      data: { id: randomUUID(), merchantId: merchant.id, name, returnUrl, baleEnabled: input.baleEnabled === true },
    })
    await payAudit(tx, actor, 'terminal.create', row.id)
    return row
  })
}
export async function changeTerminal(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60)
  if (input.active !== undefined && typeof input.active !== 'boolean' || input.baleEnabled !== undefined && typeof input.baleEnabled !== 'boolean' || input.active === undefined && input.baleEnabled === undefined) throw new PayError('وضعیت معتبر لازم است')
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    if (input.baleEnabled === true && !merchant.baleAllowed) throw new PayError('استفاده از درگاه موبوکام برای این پذیرنده مجاز نیست', 403)
    const changed = await tx.payTerminal.updateMany({
      where: { id, merchantId: merchant.id },
      data: { ...(typeof input.active === 'boolean' ? { active: input.active } : {}), ...(typeof input.baleEnabled === 'boolean' ? { baleEnabled: input.baleEnabled } : {}) },
    })
    if (changed.count !== 1) throw new PayError('پایانه پیدا نشد', 404)
    await payAudit(tx, actor, 'terminal.status', id, { active: input.active })
    return tx.payTerminal.findUniqueOrThrow({ where: { id } })
  })
}
export async function changeMerchant(actor: PayActor, input: Record<string, unknown>) {
  if (input.action === 'bale-access') return changeMerchantBaleAccess(actor, input)
  if (input.action === 'terms') return changeMerchantTerms(actor, input)
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
async function changeMerchantTerms(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60)
  if (!['MERCHANT', 'CUSTOMER'].includes(String(input.feeBearer))) throw new PayError('پرداخت‌کنندهٔ کارمزد معتبر نیست')
  const data = { feeBearer: String(input.feeBearer), feeBps: integer(input.feeBps, 0, 3000), flatFeeMinor: rial(input.flatFeeRial, true), feeCapMinor: rial(input.feeCapRial, true) }
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payMerchant.findUnique({ where: { id } })
    if (!row) throw new PayError('پذیرنده پیدا نشد', 404)
    if (row.userId === actor.id) throw new PayError('تغییر قرارداد کارمزد خودتان مجاز نیست', 403)
    const claim = await tx.payMerchant.updateMany({ where: { id, version: row.version }, data: { ...data, version: { increment: 1 } } })
    if (claim.count !== 1) throw new PayError('قرارداد هم‌زمان تغییر کرده است', 409)
    await payAudit(tx, actor, 'merchant.terms', id, data)
    return tx.payMerchant.findUniqueOrThrow({ where: { id } })
  })
}

async function changeMerchantBaleAccess(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60)
  if (typeof input.baleAllowed !== 'boolean') throw new PayError('مجوز درگاه موبوکام معتبر نیست')
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payMerchant.findUnique({ where: { id } })
    if (!row) throw new PayError('پذیرنده پیدا نشد', 404)
    if (row.userId === actor.id) throw new PayError('تغییر مجوز پذیرندگی خودتان مجاز نیست', 403)
    const claim = await tx.payMerchant.updateMany({ where: { id, version: row.version }, data: { baleAllowed: input.baleAllowed as boolean, version: { increment: 1 } } })
    if (claim.count !== 1) throw new PayError('مجوز هم‌زمان تغییر کرده است', 409)
    await payAudit(tx, actor, 'merchant.bale-access', id, { baleAllowed: input.baleAllowed })
    return tx.payMerchant.findUniqueOrThrow({ where: { id } })
  })
}
