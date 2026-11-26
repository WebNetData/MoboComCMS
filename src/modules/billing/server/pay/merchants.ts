import { randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { httpsUrl, text, rial, integer } from '@/modules/billing/domain/pay-policy'
import { parseChannelDestination } from '@/modules/billing/domain/pay-channels'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from './context'
import { assertMerchantAdministration, merchantAdminNote } from './merchant-admin/access'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'
import { findPhoneCustomer, PhoneCustomerError } from '@/modules/identity/server/phone-customer'
import { normalizeMobile } from '@/modules/sms/domain/sms'

export async function enrollMerchant(actor: PayActor, input: Record<string, unknown>) {
  const selectors = ['userId', 'email', 'phone', 'self'].filter(key => input[key] !== undefined)
  if (Object.keys(input).some(k => !['name','website','userId','email','phone','self','note'].includes(k)) || selectors.length !== 1 || input.self !== undefined && input.self !== true) throw new PayError('فقط یک شماره موبایل، شناسهٔ حساب، ایمیل دقیق یا حساب خودتان را انتخاب کنید', 422)
  const name = text(input.name, 100),
    website = input.website === undefined || input.website === '' ? '' : httpsUrl(input.website), note = merchantAdminNote(input.note)
  if (!name) throw new PayError('نام کسب‌وکار لازم است', 422)
  const userId = input.self === true ? actor.id : typeof input.userId === 'number' ? input.userId : NaN, email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '', phone = input.phone !== undefined ? normalizeMobile(input.phone) : ''
  if (input.phone !== undefined ? !phone : selectors[0] === 'email' ? !email || email.length > 254 : !Number.isSafeInteger(userId) || userId < 1) throw new PayError('شماره موبایل، شناسه یا ایمیل دقیق حساب موجود معتبر نیست', 422)
  return payTransaction(async (tx) => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    let phoneAccount: Awaited<ReturnType<typeof findPhoneCustomer>> = null
    if (phone) {
      try { phoneAccount = await findPhoneCustomer(phone, tx) }
      catch (error) { if (error instanceof PhoneCustomerError) throw new PayError(error.message, 409); throw error }
      if (!phoneAccount) throw new PayError('حسابی با این شماره موبایل پیدا نشد؛ ابتدا حساب موبوکام را ایجاد کنید', 409)
    }
    const user = await tx.user.findUnique({ where: phoneAccount ? { id: phoneAccount.id } : Number.isSafeInteger(userId) && userId > 0 ? { id: userId } : { email } })
    if (!user || !await resolveCurrentUser(user.id, Date.now(), tx) || !await userOpensSection('mobocom-pay', user.id)) throw new PayError('حساب فعال و مجاز پیدا نشد', 409)
    await assertMerchantAdministration(actor, user.id, tx)
    const previous = await tx.payMerchant.findUnique({ where: { userId: user.id } })
    if (previous) throw new PayError('این حساب از قبل پذیرنده دارد', 409)
    const row = await tx.payMerchant.create({ data: { id: randomUUID(), userId: user.id, name, website } })
    await payAudit(tx, actor, 'merchant.provision', row.id, { userId: user.id, note })
    return row
  })
}
export async function createTerminal(actor: PayActor, input: Record<string, unknown>) {
  if (Object.hasOwn(input, 'baleEnabled')) throw new PayError('فعال‌سازی تأیید خودکار فقط از مدیریت موبوکام انجام می‌شود', 403, 'PAY_AUTO_ADMIN_ONLY')
  if (Object.keys(input).some(k => !['name', 'returnUrl', 'channelType', 'channelUrl'].includes(k))) throw new PayError('تنظیم پایانه معتبر نیست')
  const name = text(input.name, 100)
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    const destination = parseChannelDestination(input, merchant.website)
    if ((await tx.payTerminal.count({ where: { merchantId: merchant.id } })) >= 20)
      throw new PayError('حداکثر ۲۰ پایانه قابل ثبت است')
    const row = await tx.payTerminal.create({
      data: { id: randomUUID(), merchantId: merchant.id, name, ...destination, baleEnabled: false },
    })
    await payAudit(tx, actor, 'terminal.create', row.id)
    return row
  })
}
export async function changeTerminal(actor: PayActor, input: Record<string, unknown>) {
  if (Object.hasOwn(input, 'baleEnabled')) throw new PayError('فعال‌سازی تأیید خودکار فقط از مدیریت موبوکام انجام می‌شود', 403, 'PAY_AUTO_ADMIN_ONLY')
  if (Object.keys(input).some(key => !['id','active'].includes(key))) throw new PayError('تنظیم پایانه معتبر نیست',422)
  const id = text(input.id, 60)
  if (typeof input.active !== 'boolean') throw new PayError('وضعیت معتبر لازم است')
  const active = input.active
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true)
    const changed = await tx.payTerminal.updateMany({
      where: { id, merchantId: merchant.id },
      data: { active },
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
    await assertMerchantAdministration(actor, previous.userId, tx)
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
    await assertMerchantAdministration(actor, row.userId, tx)
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
    await assertMerchantAdministration(actor, row.userId, tx)
    const claim = await tx.payMerchant.updateMany({ where: { id, version: row.version }, data: { baleAllowed: input.baleAllowed as boolean, version: { increment: 1 } } })
    if (claim.count !== 1) throw new PayError('مجوز هم‌زمان تغییر کرده است', 409)
    await payAudit(tx, actor, 'merchant.bale-access', id, { baleAllowed: input.baleAllowed })
    return tx.payMerchant.findUniqueOrThrow({ where: { id } })
  })
}
