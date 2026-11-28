import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { PayError } from '@/modules/billing/domain/pay'
import type { BaleCollectionPolicy } from '@/modules/billing/domain/pay-bale-collection'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { autoTransferConfig, transferDisplayDefaults } from '@/modules/billing/domain/auto-transfer'
import { smsSourceConfig } from '@/modules/billing/domain/pay-sms-source'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { payCollectionBank } from '../bank-destination'

type MerchantScope = { merchantUserId?: number; bankAccountId?: number | null }

export function smsCredentialsReady(source: { bankCode: string; templateJson: string; secretCiphertext: string }) {
  try {
    const { template } = smsSourceConfig(JSON.parse(source.templateJson))
    return template.bankCode === source.bankCode && source.secretCiphertext.startsWith('encv1:')
      && /^[A-Za-z0-9_-]{43}$/.test(decryptPanelCredential(source.secretCiphertext))
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

export async function baleCollectionContext(tx: Prisma.TransactionClient, gatewayId?: number, proposedPolicy?: BaleCollectionPolicy, merchant?: MerchantScope) {
  const settings = await paySettings.read(tx)
  const policy = proposedPolicy ?? settings.bale
  const smsEnabled = (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
  if (!policy.enabled || !await isModuleEnabled('mobocom-pay', tx) || (!merchant && !smsEnabled))
    throw new PayError('مبلغ یکتای کارت‌به‌کارت فعال نیست', 503, 'BALE_COLLECTION_OFF')
  const gateway = gatewayId ? await tx.gateway.findUnique({ where: { id: gatewayId } }) : null
  const config = autoTransferConfig(gateway?.config)
  if (!gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(gateway.provider) || (!merchant && !config.autoVerify))
    throw new PayError('درگاه باید به حساب اختصاصی پیامک متصل باشد', 503)
  const bank = config.autoBankAccountId && config.autoVerify
    ? await tx.bankAccount.findFirst({ where: { id: config.autoBankAccountId, active: true, collectionUse: 'MOBOCOM_PAY' } })
    : merchant?.bankAccountId
      ? await tx.bankAccount.findFirst({ where: { id: merchant.bankAccountId, active: true, collectionUse: 'GENERAL' } })
      : merchant ? await payCollectionBank(tx, settings.bankAccountIds) : null
  if (!bank) throw new PayError('برای کارت‌به‌کارت یک حساب مقصد فعال و قابل نمایش لازم است', 503)
  const display = bank.collectionUse === 'MOBOCOM_PAY' ? config.autoDisplay : {
    ...transferDisplayDefaults(), cardNumber: Boolean(bank.cardNumber), iban: !bank.cardNumber && Boolean(bank.sheba),
    bankName: true, holderName: true,
  }
  if (!(display.cardNumber && bank.cardNumber || display.accountNumber && bank.accountNumber || display.iban && bank.sheba)) throw new PayError('شمارهٔ مقصد قابل نمایش را در تنظیمات درگاه و حساب بانکی کامل کنید', 503)
  const configured = smsEnabled && bank.collectionUse === 'MOBOCOM_PAY'
    ? await tx.paySmsSource.findMany({ where: { bankAccountId: bank.id, active: true, verified: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    : []
  const sms = configured.filter(smsCredentialsReady)
  const smsOwners = await Promise.all(sms.map(source => sourceOwner(source.ownerUserId, tx)))
  const owner = smsOwners.find(Boolean) ?? (merchant?.merchantUserId
    ? await tx.user.findUnique({ where: { id: merchant.merchantUserId }, select: { id: true, email: true } })
    : null)
  if (!owner && !merchant) throw new PayError('منبع پیامک معتبر و تأییدشده برای این حساب آماده نیست', 503)
  return { sms: sms.filter((_, index) => smsOwners[index]), sourceTypes: config.autoSources, policy, settings, owner, bank, display }
}
export async function baleGatewayReady(reader?: Prisma.TransactionClient, gatewayId?: number, proposedPolicy?: BaleCollectionPolicy, checkout: 'site' | 'pay' = 'site'): Promise<boolean> {
  const merchant = checkout === 'pay' ? {} : undefined
  try { if (reader) await baleCollectionContext(reader, gatewayId, proposedPolicy, merchant); else await db.$transaction(tx => baleCollectionContext(tx, gatewayId, proposedPolicy, merchant)); return true }
  catch (error) { if (error instanceof PayError) return false; throw error }
}
