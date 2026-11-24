import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { baleBinding } from '@/modules/billing/domain/pay-bale'
import { PayError } from '@/modules/billing/domain/pay'
import { paySettings } from '../settings'
import { sourceOwner } from './access'
import { autoTransferConfig, type AutoTransferSource } from '@/modules/billing/domain/auto-transfer'

export async function baleCollectionContext(tx: Prisma.TransactionClient, gatewayId?: number) {
  const binding = baleBinding(process.env), settings = await paySettings.read(tx)
  if (!settings.bale.enabled ||
    !await isModuleEnabled('mobocom-pay', tx) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true')
    throw new PayError('تطبیق خودکار بله هنوز آماده یا فعال نیست', 503, 'BALE_COLLECTION_OFF')
  const gateway = gatewayId ? await tx.gateway.findUnique({ where: { id: gatewayId } }) : null
  const config = gateway?.provider === 'CARD_TRANSFER' ? autoTransferConfig(gateway.config) : { autoVerify: true, autoSources: ['BALE'] as AutoTransferSource[], autoBankAccountId: binding?.bankAccountId || null }
  if (gatewayId && (!gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(gateway.provider)) || !config.autoVerify || !config.autoBankAccountId) throw new PayError('روش تأیید خودکار آماده نیست', 503)
  const bank = await tx.bankAccount.findUnique({ where: { id: config.autoBankAccountId } })
  if (!bank?.active || bank.collectionUse !== 'MOBOCOM_PAY' || !/^\d{6,30}$/.test(bank.accountNumber)) throw new PayError('حساب اختصاصی تأیید خودکار آماده نیست', 503)
  if (gateway?.provider === 'CARD_TRANSFER') {
    const display = autoTransferConfig(gateway.config).autoDisplay
    if (!(display.cardNumber && bank.cardNumber || display.accountNumber && bank.accountNumber || display.iban && bank.sheba)) throw new PayError('شمارهٔ مقصد قابل نمایش را در تنظیمات درگاه و حساب بانکی کامل کنید', 503)
  }
  const baleOwner = binding && config.autoSources.includes('BALE') && binding.bankAccountId === bank.id && process.env.MOBOCOM_PAY_BALE_VERIFIED === 'true' ? await sourceOwner(binding.ownerUserId, tx) : null
  const sms = config.autoSources.includes('SMS') ? await tx.paySmsSource.findMany({ where: { bankAccountId: bank.id, active: true, verified: true }, orderBy: { createdAt: 'asc' } }) : []
  const smsOwners = await Promise.all(sms.map(source => sourceOwner(source.ownerUserId, tx)))
  const smsOwner = smsOwners.find(Boolean) || null
  const eligibleSms = sms.filter((_, index) => smsOwners[index])
  const owner = baleOwner || smsOwner
  if (!owner) throw new PayError('هیچ منبع تأیید خودکار معتبر و فعالی برای حساب آماده نیست', 503)
  return { binding: baleOwner ? binding : null, sms: eligibleSms, sourceTypes: config.autoSources, policy: settings.bale, settings, owner, bank }
}
export async function baleGatewayReady(reader?: Prisma.TransactionClient, gatewayId?: number): Promise<boolean> {
  try { if (reader) await baleCollectionContext(reader, gatewayId); else await db.$transaction(tx => baleCollectionContext(tx, gatewayId)); return true }
  catch (error) { if (error instanceof PayError) return false; throw error }
}
