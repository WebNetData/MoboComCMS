import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { PayError } from '@/modules/billing/domain/pay'
import { applyGatewayPolicy, type GatewayPolicy } from '@/modules/billing/domain/pay-gateway-access'
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
type Destination = { fixedBankAccountId?: number; assignedBankAccountId?: number | null; routingKey?: string }

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
  if (!policy.enabled || !await isModuleEnabled('mobocom-pay', tx) || ((!merchant || destination.assignedBankAccountId) && !smsEnabled))
    throw new PayError('مبلغ یکتای کارت‌به‌کارت فعال نیست', 503, 'BALE_COLLECTION_OFF')
  const gateway = gatewayId ? await tx.gateway.findUnique({ where: { id: gatewayId } }) : null
  const config = autoTransferConfig(gateway?.config)
  if (!gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(gateway.provider) || (!merchant && !config.autoVerify))
    throw new PayError('درگاه باید به حساب اختصاصی پیامک متصل باشد', 503)
  const ids = config.autoBankAccountId ? [config.autoBankAccountId] : settings.bankAccountIds
  const selected = destination.fixedBankAccountId ?? destination.assignedBankAccountId
  const fallback = !config.autoVerify && merchant && !destination.assignedBankAccountId
    ? destination.fixedBankAccountId || merchant.bankAccountId
      ? await tx.bankAccount.findFirst({ where: { id: destination.fixedBankAccountId || merchant.bankAccountId!, active: true, collectionUse: 'GENERAL' } })
      : await payCollectionBank(tx, settings.bankAccountIds)
    : null
  const configuredPool = config.autoVerify
    ? await tx.bankAccount.findMany({ where: { id: { in: ids }, active: true, archivedAt: null, ...(!merchant && { collectionUse: 'MOBOCOM_PAY' }) }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    : fallback ? [fallback] : []
  const banks = selected ? configuredPool.filter(bank => bank.id === selected) : configuredPool
  const configured = config.autoVerify && smsEnabled && banks.length
    ? await tx.paySmsSource.findMany({ where: { bankAccountId: { in: banks.map(row => row.id) }, active: true, verified: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    : []
  const sources = await Promise.all(configured.filter(smsCredentialsReady).map(async source => ({ source, owner: await sourceOwner(source.ownerUserId, tx) })))
  const candidates = banks.flatMap(bank => {
    const display = config.autoVerify ? config.autoDisplay : {
      ...transferDisplayDefaults(), cardNumber: Boolean(bank.cardNumber), accountNumber: !bank.cardNumber && !bank.sheba && Boolean(bank.accountNumber),
      iban: !bank.cardNumber && Boolean(bank.sheba), bankName: true, holderName: true,
    }
    if (destination.assignedBankAccountId && !(display.cardNumber && bank.cardNumber)) return []
    if (!(display.cardNumber && bank.cardNumber || display.accountNumber && bank.accountNumber || display.iban && bank.sheba)) return []
    const needsAccount = bank.collectionUse === 'GENERAL' || configuredPool.length > 1
    const valid = sources.filter(({ source, owner }) => {
      if (!owner || source.bankAccountId !== bank.id) return false
      if (!needsAccount) return true
      return Boolean(smsAccountDigits(bank.accountNumber) && smsSourceConfig(JSON.parse(source.templateJson)).template.creditTemplate.includes('{account}'))
    })
    return [{ bank, display, sms: valid.map(item => item.source), owner: valid[0]?.owner }]
  })
  const automatic = candidates.filter(candidate => candidate.sms.length > 0)
  const pool = automatic.length || !merchant || destination.assignedBankAccountId ? automatic : candidates
  if (!pool.length) throw new PayError(banks.length && !merchant ? 'منبع پیامک معتبر و تأییدشده برای حساب‌های دریافت آماده نیست' : 'برای کارت‌به‌کارت یک حساب مقصد فعال و قابل نمایش لازم است', 503)
  const offset = destination.routingKey ? createHash('sha256').update(destination.routingKey).digest().readUInt32BE() % pool.length : 0
  const choice = pool[offset]
  const owner = choice.owner ?? (merchant?.merchantUserId
    ? await tx.user.findUnique({ where: { id: merchant.merchantUserId }, select: { id: true, email: true } })
    : null)
  return { ...choice, sourceTypes: config.autoSources, policy, settings, owner }
}
export async function baleGatewayReady(reader?: Prisma.TransactionClient, gatewayId?: number, proposedPolicy?: BaleCollectionPolicy, checkout: 'site' | 'pay' = 'site', assignedBankAccountId?: number | null): Promise<boolean> {
  const merchant = checkout === 'pay' ? {} : undefined
  const check = (tx: Prisma.TransactionClient) => baleCollectionContext(tx, gatewayId, proposedPolicy, merchant, { assignedBankAccountId })
  try { if (reader) await check(reader); else await db.$transaction(check); return true }
  catch (error) { if (error instanceof PayError) return false; throw error }
}

export async function terminalBankAccounts(tx: Prisma.TransactionClient, bankAccountId?: number, retainedIds: number[] = []) {
  const settings = await paySettings.read(tx)
  const banks = await tx.bankAccount.findMany({
    where: { OR: [{ archivedAt: null }, { id: { in: retainedIds } }], ...(bankAccountId === undefined ? {} : { id: bankAccountId }) },
    select: { id: true, bankName: true, holderName: true, cardNumber: true, active: true, archivedAt: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  const gateways = await tx.gateway.findMany({
    where: { active: true, provider: { in: ['MOBOCOM_PAY','CARD_TRANSFER'] } },
    select: { id: true, config: true },
  })
  const scopes = gateways.flatMap(gateway => {
    try {
      const config = autoTransferConfig(gateway.config)
      return config.autoVerify && config.autoDisplay.cardNumber
        ? [{ id: gateway.id, accounts: config.autoBankAccountId ? [config.autoBankAccountId] : settings.bankAccountIds }] : []
    } catch (error) {
      if (error instanceof PayError) return []
      throw error
    }
  })
  return Promise.all(banks.map(async ({ id, bankName, holderName, cardNumber, active, archivedAt }) => {
    const matching = scopes.filter(scope => scope.accounts.includes(id))
    let reason = archivedAt ? 'حساب بایگانی شده است؛ مقصد دیگری انتخاب کنید'
      : !active ? 'حساب غیرفعال است' : !cardNumber ? 'شماره کارت ثبت نشده است'
      : !matching.length ? 'یک درگاه فعال با این حساب و نمایش شماره کارت لازم است' : ''
    const gatewayRefs: { ref: string }[] = []
    if (!reason) {
      for (const gateway of matching) {
        if (await baleGatewayReady(tx, gateway.id, settings.bale, 'pay', id)) gatewayRefs.push({ ref: `db:${gateway.id}` })
      }
      if (!gatewayRefs.length) reason = 'سیاست دریافت خودکار یا منبع پیامک معتبر و تأییدشده آماده نیست'
    }
    return { id, bankName, holderName, cardLast4: cardNumber.slice(-4), eligible: !reason, reason, gatewayRefs }
  }))
}

export function terminalBankAccountIssue(
  account: Awaited<ReturnType<typeof terminalBankAccounts>>[number],
  merchantPolicy: GatewayPolicy,
  terminalPolicy: GatewayPolicy,
) {
  if (account.reason) return account.reason
  return applyGatewayPolicy(applyGatewayPolicy(account.gatewayRefs, merchantPolicy), terminalPolicy).length
    ? '' : 'درگاه سازگار با سیاست این پذیرنده و پایانه فعال نیست'
}
