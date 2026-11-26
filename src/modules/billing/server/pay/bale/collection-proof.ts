import { createHash } from 'node:crypto'
import type { PayBaleCollection, PayBaleNotice, Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { isModuleEnabled } from '@/extensions/server/modules'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { autoTransferConfig } from '@/modules/billing/domain/auto-transfer'
import { matchesFrozenSms, smsCredentialsReady } from './collection-context'

/** Both automatic matching and reviewed admission recheck the same CURRENT authority. */
export async function collectionSourceActor(tx: Prisma.TransactionClient, row: PayBaleCollection, notice: PayBaleNotice) {
  if (notice.sourceType !== 'SMS' || !notice.smsSourceId) throw new PayError('این منبع پذیرش خودکار ندارد', 410, 'PAY_SOURCE_RETIRED')
  if (notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || notice.amountMinor !== row.collectedRial || notice.bankAccountId !== row.bankAccountId)
    throw new PayError('مدرک واریز با مبلغ و مقصد درخواست برابر نیست', 409)
  if (!(await isModuleEnabled('mobocom-pay', tx)) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true' || !(await paySettings.read(tx)).bale.enabled)
    throw new PayError('تأیید خودکار متوقف است', 503)
  const source = await tx.paySmsSource.findUnique({ where: { id: notice.smsSourceId } })
  const actor = source?.active && source.verified && source.bankAccountId === row.bankAccountId &&
    matchesFrozenSms(row, source) && smsCredentialsReady(source) &&
    notice.instanceId === createHash('sha256').update(`${source.id}:${source.version}`).digest('hex')
      ? await sourceOwner(source.ownerUserId, tx) : null
  if (!actor) throw new PayError('منبع تأیید خودکار این درخواست معتبر نیست', 503)
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId }, include: { gateway: true, payCollection: { include: { merchant: true, terminal: true } } } })
  const bank = await tx.bankAccount.findUnique({ where: { id: row.bankAccountId } })
  if (invoice.payCollection?.creditCurrency === 'USDT' && notice.code === 'SMS_FORWARDER_CREDIT') throw new PayError('برای نرخ قفل‌شده، مدرک زمان اصلی واریز یا رسید بررسی‌شده لازم است', 409, 'PAY_PURCHASE_TIME_REQUIRED')
  if (invoice.payCollection?.creditCurrency === 'USDT' && notice.sourceSentAt > invoice.payCollection.expiresAt) throw new PayError('اعلان واریز پس از انقضای نرخ خرید تتر است؛ نیاز به رسیدگی و بازگشت وجه دارد', 409, 'PAY_PURCHASE_LATE')
  if (!invoice.gateway?.active || !bank?.active || bank.collectionUse !== 'MOBOCOM_PAY' || (invoice.payCollection && (!invoice.payCollection.merchant.baleAllowed || !invoice.payCollection.terminal.baleEnabled || invoice.payCollection.merchant.status !== 'ACTIVE' || !invoice.payCollection.terminal.active)))
    throw new PayError('دریافت این روش متوقف است', 503)
  const config = autoTransferConfig(invoice.gateway.config)
  if (!config.autoVerify || config.autoBankAccountId !== row.bankAccountId) throw new PayError('تنظیمات روش تأیید تغییر کرده است', 503)
  return { actor, invoice }
}
