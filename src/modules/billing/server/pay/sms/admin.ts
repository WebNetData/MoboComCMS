import { randomBytes, randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { normalizeSmsTemplate, smsBankPresets } from '@/modules/billing/domain/pay-sms-template'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'

export async function smsSources(actor: PayActor) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const rows = await tx.paySmsSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    return { items: rows.map(row => ({ id: row.id, label: row.label, bankCode: row.bankCode, bankAccountId: row.bankAccountId, template: normalizeSmsTemplate(JSON.parse(row.templateJson)), active: row.active, verified: row.verified, version: row.version })), presets: smsBankPresets }
  })
}
export async function saveSmsSource(actor: PayActor, input: Record<string, unknown>) {
  let template
  try { template = normalizeSmsTemplate(input.template) } catch { throw new PayError('قالب پیامک معتبر نیست', 422) }
  const label = typeof input.label === 'string' ? input.label.trim() : '', bankAccountId = Number(input.bankAccountId)
  if (!label || label.length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(label) || !Number.isSafeInteger(bankAccountId) || bankAccountId < 1 || typeof input.verified !== 'boolean' || typeof input.active !== 'boolean') throw new PayError('مشخصات منبع پیامک معتبر نیست', 422)
  const id = input.id
  if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(input.version) || Number(input.version) < 1)) throw new PayError('نسخهٔ منبع معتبر نیست', 422)
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId } })
    if (!bank?.active || bank.collectionUse !== 'MOBOCOM_PAY') throw new PayError('حساب اختصاصی فعال لازم است', 409)
    const data = { label, bankCode: template.bankCode, templateJson: JSON.stringify(template), verified: input.verified as boolean, active: input.active as boolean }
    if (typeof id === 'string') {
      const changed = await tx.paySmsSource.updateMany({ where: { id, version: Number(input.version), bankAccountId, ownerUserId: actor.id }, data: { ...data, version: { increment: 1 } } })
      if (changed.count !== 1) throw new PayError('منبع تغییر کرده یا متعلق به این حساب نیست', 409)
      await payAudit(tx, actor, 'sms-source.update', id, { bankAccountId })
      const row = await tx.paySmsSource.findUniqueOrThrow({ where: { id } })
      return { source: { id: row.id, label: row.label, bankCode: row.bankCode, bankAccountId: row.bankAccountId, template, active: row.active, verified: row.verified, version: row.version } }
    }
    const secret = randomBytes(32).toString('base64url'), ciphertext = encryptPanelCredential(secret)
    if (!ciphertext.startsWith('encv1:')) throw new PayError('کلید رمزنگاری سرور آماده نیست', 503)
    const row = await tx.paySmsSource.create({ data: { id: randomUUID(), bankAccountId, ownerUserId: actor.id, secretCiphertext: ciphertext, ...data } })
    await payAudit(tx, actor, 'sms-source.create', row.id, { bankAccountId })
    return { source: { id: row.id, label: row.label, bankCode: row.bankCode, bankAccountId: row.bankAccountId, template, active: row.active, verified: row.verified, version: row.version }, secret }
  })
}
