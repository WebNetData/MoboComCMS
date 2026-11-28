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
import { createHash } from 'node:crypto'
import { smsAccountDigits } from '../sms/account'

type MerchantScope = { merchantUserId?: number; bankAccountId?: number | null }
type Destination = { fixedBankAccountId?: number; routingKey?: string }

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

export async function baleCollectionContext(tx: Prisma.TransactionClient, gatewayId?: number, proposedPolicy?: BaleCollectionPolicy, merchant?: MerchantScope, destination: Destination = {}) {
  const settings = await paySettings.read(tx)
  const policy = proposedPolicy ?? settings.bale
  const smsEnabled = (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
  if (!policy.enabled || !await isModuleEnabled('mobocom-pay', tx) || (!merchant && !smsEnabled))
    throw new PayError('مبلغ یکتای کارت‌به‌کارت فعال نیست', 503, 'BALE_COLLECTION_OFF')
  const gateway = gatewayId ? await tx.gateway.findUnique({ where: { id: gatewayId } }) : null
  const config = autoTransferConfig(gateway?.config)
  if (!gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(gateway.provider) || (!merchant && !config.autoVerify))
    throw new PayError('درگاه باید به حساب اختصاصی پیامک متصل باشد', 503)
  const ids = config.autoBankAccountId ? [config.autoBankAccountId] : settings.bankAccountIds
  const allowed = destination.fixedBankAccountId
    ? ids.filter(id => id === destination.fixedBankAccountId) : ids
  const fallback = !config.autoVerify && merchant
    ? destination.fixedBankAccountId || merchant.bankAccountId
      ? await tx.bankAccount.findFirst({ where: { id: destination.fixedBankAccountId || merchant.bankAccountId!, active: true, collectionUse: 'GENERAL' } })
      : await payCollectionBank(tx, settings.bankAccountIds)
    : null
  const banks = config.autoVerify
    ? await tx.bankAccount.findMany({ where: { id: { in: allowed }, active: true, ...(!merchant && { collectionUse: 'MOBOCOM_PAY' }) }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    : fallback ? [fallback] : []
  const configured = config.autoVerify && smsEnabled && banks.length
    ? await tx.paySmsSource.findMany({ where: { bankAccountId: { in: banks.map(row => row.id) }, active: true, verified: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    : []
  const sources = await Promise.all(configured.filter(smsCredentialsReady).map(async source => ({ source, owner: await sourceOwner(source.ownerUserId, tx) })))
  const candidates = banks.flatMap(bank => {
    const display = config.autoVerify ? config.autoDisplay : {
      ...transferDisplayDefaults(), cardNumber: Boolean(bank.cardNumber), accountNumber: !bank.cardNumber && !bank.sheba && Boolean(bank.accountNumber),
      iban: !bank.cardNumber && Boolean(bank.sheba), bankName: true, holderName: true,
    }
    if (!(display.cardNumber && bank.cardNumber || display.accountNumber && bank.accountNumber || display.iban && bank.sheba)) return []
    const needsAccount = bank.collectionUse === 'GENERAL' || ids.length > 1
    const valid = sources.filter(({ source, owner }) => {
      if (!owner || source.bankAccountId !== bank.id) return false
      if (!needsAccount) return true
      return Boolean(smsAccountDigits(bank.accountNumber) && smsSourceConfig(JSON.parse(source.templateJson)).template.creditTemplate.includes('{account}'))
    })
    return [{ bank, display, sms: valid.map(item => item.source), owner: valid[0]?.owner }]
  })
  const automatic = candidates.filter(candidate => candidate.sms.length > 0)
  const pool = automatic.length || !merchant ? automatic : candidates
  if (!pool.length) throw new PayError(banks.length && !merchant ? 'منبع پیامک معتبر و تأییدشده برای حساب‌های دریافت آماده نیست' : 'برای کارت‌به‌کارت یک حساب مقصد فعال و قابل نمایش لازم است', 503)
  const offset = destination.routingKey ? createHash('sha256').update(destination.routingKey).digest().readUInt32BE() % pool.length : 0
  const choice = pool[offset]
  const owner = choice.owner ?? (merchant?.merchantUserId
    ? await tx.user.findUnique({ where: { id: merchant.merchantUserId }, select: { id: true, email: true } })
    : null)
  return { ...choice, sourceTypes: config.autoSources, policy, settings, owner }
}
export async function baleGatewayReady(reader?: Prisma.TransactionClient, gatewayId?: number, proposedPolicy?: BaleCollectionPolicy, checkout: 'site' | 'pay' = 'site'): Promise<boolean> {
  const merchant = checkout === 'pay' ? {} : undefined
  try { if (reader) await baleCollectionContext(reader, gatewayId, proposedPolicy, merchant); else await db.$transaction(tx => baleCollectionContext(tx, gatewayId, proposedPolicy, merchant)); return true }
  catch (error) { if (error instanceof PayError) return false; throw error }
}
