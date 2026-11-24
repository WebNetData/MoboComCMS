import { createHash } from 'node:crypto'
import type { PayBaleCollection, PayBaleNotice, Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { baleBinding } from '@/modules/billing/domain/pay-bale'
import { isModuleEnabled } from '@/extensions/server/modules'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { autoTransferConfig } from '@/modules/billing/domain/auto-transfer'

/** Both automatic matching and reviewed admission recheck the same CURRENT authority. */
export async function collectionSourceActor(tx: Prisma.TransactionClient, row: PayBaleCollection, notice: PayBaleNotice) {
  if (notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || notice.amountMinor !== row.collectedRial || notice.bankAccountId !== row.bankAccountId)
    throw new PayError('مدرک واریز با مبلغ و مقصد درخواست برابر نیست', 409)
  if (!(await isModuleEnabled('mobocom-pay', tx)) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true' || !(await paySettings.read(tx)).bale.enabled)
    throw new PayError('تأیید خودکار متوقف است', 503)
  const bindings = JSON.parse(row.sourceBindings) as { bale: { instanceId: string; accountId: string; peerId: string } | null; sms: { id: string; version: number }[] }
  let actor: { id: number; email: string } | null = null
  if (notice.sourceType === 'SMS' && notice.smsSourceId && JSON.parse(row.sourceTypes).includes('SMS')) {
    const source = await tx.paySmsSource.findUnique({ where: { id: notice.smsSourceId } })
    if (source?.active && source.verified && source.bankAccountId === row.bankAccountId && bindings.sms.some(s => s.id === source.id && s.version === source.version) &&
      notice.instanceId === createHash('sha256').update(`${source.id}:${source.version}`).digest('hex')) actor = await sourceOwner(source.ownerUserId, tx)
  } else if (notice.sourceType === 'BALE' && JSON.parse(row.sourceTypes).includes('BALE')) {
    const binding = baleBinding(process.env), frozen = bindings.bale
    if (binding && frozen && process.env.MOBOCOM_PAY_BALE_VERIFIED === 'true' && binding.bankAccountId === row.bankAccountId &&
      binding.instanceId === frozen.instanceId && binding.accountId === frozen.accountId && binding.bankPeerId === frozen.peerId &&
      notice.instanceId === frozen.instanceId && notice.sourceAccountId === frozen.accountId && notice.bankPeerId === frozen.peerId) actor = await sourceOwner(binding.ownerUserId, tx)
  }
  if (!actor) throw new PayError('منبع تأیید خودکار این درخواست معتبر نیست', 503)
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId }, include: { gateway: true, payCollection: { include: { merchant: true, terminal: true } } } })
  const bank = await tx.bankAccount.findUnique({ where: { id: row.bankAccountId } })
  if (!invoice.gateway?.active || !bank?.active || bank.collectionUse !== 'MOBOCOM_PAY' || (invoice.payCollection && (!invoice.payCollection.merchant.baleAllowed || !invoice.payCollection.terminal.baleEnabled || invoice.payCollection.merchant.status !== 'ACTIVE' || !invoice.payCollection.terminal.active)))
    throw new PayError('دریافت این روش متوقف است', 503)
  if (invoice.gateway.provider === 'CARD_TRANSFER') {
    const config = autoTransferConfig(invoice.gateway.config)
    if (!config.autoVerify || config.autoBankAccountId !== row.bankAccountId || !config.autoSources.includes(notice.sourceType as 'SMS' | 'BALE')) throw new PayError('تنظیمات روش تأیید تغییر کرده است', 503)
  }
  return { actor, invoice }
}
