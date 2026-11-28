import { randomBytes, randomUUID } from 'node:crypto'
import type { PaySmsSource, Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { normalizeSmsTemplate, smsBankPresets } from '@/modules/billing/domain/pay-sms-template'
import { smsSourceConfig, smsSourceStorage, type SmsSourceFormat } from '@/modules/billing/domain/pay-sms-source'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'
import { requirePerm } from '@/modules/identity/server/access'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import { smsAccountDigits } from './account'

function storedConfig(row: PaySmsSource) {
  try { return smsSourceConfig(JSON.parse(row.templateJson)) }
  catch { return null }
}

function sourceView(row: PaySmsSource, actorId: number, fullAccess: boolean) {
  const config = storedConfig(row)
  return {
    id: row.id, label: row.label, bankCode: row.bankCode, bankAccountId: row.bankAccountId,
    template: config?.template ?? null, format: config?.format ?? null, active: row.active,
    verified: row.verified, version: row.version, canEdit: fullAccess || row.ownerUserId === actorId,
  }
}

async function sourceOperator(actor: PayActor, tx: Prisma.TransactionClient) {
  await payContext(actor, tx)
  const admin = await requirePerm(actor.req, 'mobocom-pay.manage', tx)
  if (!admin || admin.id !== actor.id || actor.machine) throw new PayError('مدیریت منبع پیامک به نشست معتبر مدیر نیاز دارد', 403)
  return actorHasFullAccess(admin)
}

export async function smsSources(actor: PayActor) {
  return payTransaction(async tx => {
    const fullAccess = await sourceOperator(actor, tx)
    const rows = await tx.paySmsSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    return { items: rows.map(row => sourceView(row, actor.id, fullAccess)), presets: smsBankPresets }
  })
}
export async function saveSmsSource(actor: PayActor, input: Record<string, unknown>) {
  if (input.format !== undefined && (typeof input.format !== 'string' || !['EXTENDED_V1','FORWARDER_V1'].includes(input.format))) throw new PayError('قالب ارسال پیامک معتبر نیست', 422)
  let template
  try { template = normalizeSmsTemplate(input.template) }
  catch { throw new PayError('کد بانک، فرستنده و قالب را بررسی کنید؛ قالب واریز باید یک جای‌نگهدار {amount} داشته باشد', 422) }
  const label = typeof input.label === 'string' ? input.label.trim() : '', bankAccountId = Number(input.bankAccountId)
  if (!label || label.length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(label) || !Number.isSafeInteger(bankAccountId) || bankAccountId < 1 || typeof input.verified !== 'boolean' || typeof input.active !== 'boolean') throw new PayError('مشخصات منبع پیامک معتبر نیست', 422)
  const id = input.id
  if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(input.version) || Number(input.version) < 1)) throw new PayError('نسخهٔ منبع معتبر نیست', 422)
  return payTransaction(async tx => {
    const fullAccess = await sourceOperator(actor, tx)
    const current = typeof id === 'string' ? await tx.paySmsSource.findUnique({ where: { id } }) : null
    if (typeof id === 'string' && (!current || current.bankAccountId !== bankAccountId || current.version !== input.version))
      throw new PayError('منبع تغییر کرده یا حساب مقصد آن متفاوت است؛ فهرست را تازه کنید', 409)
    if (current && current.ownerUserId !== actor.id && !fullAccess)
      throw new PayError('ویرایش این منبع با مالک منبع یا مدیر کل است', 403)
    const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId } })
    if (!bank || !bank.active && (!current || input.active))
      throw new PayError('یک حساب بانکی فعال لازم است', 409)
    if (bank.collectionUse === 'GENERAL' && (!smsAccountDigits(bank.accountNumber) || !template.creditTemplate.includes('{account}')))
      throw new PayError('برای کارت عمومی شمارهٔ حساب را ثبت کنید و در قالب واریز از {account} استفاده کنید', 422)
    const previous = current && storedConfig(current)
    if (current && !previous && !input.format) throw new PayError('قالب ذخیره‌شده معتبر نیست؛ نوع قالب را دوباره انتخاب کنید', 422)
    const format: SmsSourceFormat = input.format as SmsSourceFormat || previous?.format || 'EXTENDED_V1'
    const data = { label, bankCode: template.bankCode, templateJson: smsSourceStorage(template, format), verified: input.verified as boolean, active: input.active as boolean }
    if (current) {
      if (previous && smsSourceStorage(previous.template, previous.format) === data.templateJson &&
          current.label === label && current.bankCode === data.bankCode && current.active === data.active && current.verified === data.verified) {
        return { source: sourceView(current, actor.id, fullAccess) }
      }
      const changed = await tx.paySmsSource.updateMany({
        where: { id: current.id, version: current.version, bankAccountId, ownerUserId: current.ownerUserId },
        data: { ...data, version: { increment: 1 } },
      })
      if (changed.count !== 1) throw new PayError('منبع هم‌زمان تغییر کرده است؛ فهرست را تازه کنید', 409)
      await payAudit(tx, actor, 'sms-source.update', current.id, { bankAccountId, sourceOwnerId: current.ownerUserId })
      const row = await tx.paySmsSource.findUniqueOrThrow({ where: { id: current.id } })
      return { source: sourceView(row, actor.id, fullAccess) }
    }
    const secret = randomBytes(32).toString('base64url')
    let ciphertext: string
    try { ciphertext = encryptPanelCredential(secret) }
    catch { throw new PayError('کلید رمزنگاری سرور PANEL_CREDENTIAL_KEY آماده نیست', 503) }
    if (!ciphertext.startsWith('encv1:')) throw new PayError('کلید رمزنگاری سرور PANEL_CREDENTIAL_KEY آماده نیست', 503)
    const row = await tx.paySmsSource.create({ data: { id: randomUUID(), bankAccountId, ownerUserId: actor.id, secretCiphertext: ciphertext, ...data } })
    await payAudit(tx, actor, 'sms-source.create', row.id, { bankAccountId })
    return { source: sourceView(row, actor.id, fullAccess), secret }
  })
}
