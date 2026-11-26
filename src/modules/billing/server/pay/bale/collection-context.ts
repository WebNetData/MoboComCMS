import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { PayError } from '@/modules/billing/domain/pay'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { autoTransferConfig } from '@/modules/billing/domain/auto-transfer'
import { smsSourceConfig } from '@/modules/billing/domain/pay-sms-source'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'

export function smsCredentialsReady(source: { templateJson: string; secretCiphertext: string }) {
  try {
    smsSourceConfig(JSON.parse(source.templateJson))
    return source.secretCiphertext.startsWith('encv1:') && /^[A-Za-z0-9_-]{43}$/.test(decryptPanelCredential(source.secretCiphertext))
  } catch { return false }
}

export function matchesFrozenSms(row: { sourceTypes: string; sourceBindings: string }, source: { id: string; version: number }) {
  try {
    const types: unknown = JSON.parse(row.sourceTypes)
    const bindings = JSON.parse(row.sourceBindings) as { sms?: { id: string; version: number }[] } | null
    return Array.isArray(types) && types.includes('SMS') && Array.isArray(bindings?.sms)
      && bindings.sms.some(binding => binding?.id === source.id && binding.version === source.version)
  } catch { return false }
}

export async function baleCollectionContext(tx: Prisma.TransactionClient, gatewayId?: number) {
  const settings = await paySettings.read(tx)
  if (!settings.bale.enabled ||
    !await isModuleEnabled('mobocom-pay', tx) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true')
    throw new PayError('تطبیق خودکار پیامک هنوز فعال نیست', 503, 'BALE_COLLECTION_OFF')
  const gateway = gatewayId ? await tx.gateway.findUnique({ where: { id: gatewayId } }) : null
  const config = autoTransferConfig(gateway?.config)
  if (!gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(gateway.provider) || !config.autoVerify || !config.autoBankAccountId)
    throw new PayError('درگاه باید به حساب اختصاصی پیامک متصل باشد', 503)
  const bank = await tx.bankAccount.findUnique({ where: { id: config.autoBankAccountId } })
  if (!bank?.active || bank.collectionUse !== 'MOBOCOM_PAY') throw new PayError('حساب اختصاصی تأیید خودکار آماده نیست', 503)
  const display = config.autoDisplay
  if (!(display.cardNumber && bank.cardNumber || display.accountNumber && bank.accountNumber || display.iban && bank.sheba)) throw new PayError('شمارهٔ مقصد قابل نمایش را در تنظیمات درگاه و حساب بانکی کامل کنید', 503)
  const configured = await tx.paySmsSource.findMany({ where: { bankAccountId: bank.id, active: true, verified: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const sms = configured.filter(smsCredentialsReady)
  const smsOwners = await Promise.all(sms.map(source => sourceOwner(source.ownerUserId, tx)))
  const owner = smsOwners.find(Boolean)
  if (!owner) throw new PayError('منبع پیامک معتبر و تأییدشده برای این حساب آماده نیست', 503)
  return { sms: sms.filter((_, index) => smsOwners[index]), sourceTypes: config.autoSources, policy: settings.bale, settings, owner, bank }
}
export async function baleGatewayReady(reader?: Prisma.TransactionClient, gatewayId?: number): Promise<boolean> {
  try { if (reader) await baleCollectionContext(reader, gatewayId); else await db.$transaction(tx => baleCollectionContext(tx, gatewayId)); return true }
  catch (error) { if (error instanceof PayError) return false; throw error }
}
