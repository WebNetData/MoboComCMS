import { matchBaleNotice } from './collection-match'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { isModuleEnabled } from '@/extensions/server/modules'
import { originalBaleMessage } from '@/modules/billing/domain/pay-bale'
import { selectedBaleSource } from '@/modules/billing/domain/pay-bale-sources'
import { parsePayBankNotice } from '@/modules/billing/domain/pay-bank-notice'
import { parseBaleAmount } from '@/modules/billing/domain/pay-bale-amount'
import { PayError } from '@/modules/billing/domain/pay'
import { latinDigits } from '@/shared/text/digits'
import { auditSystemStrict } from '@/platform/audit/server'
import { baleSourceOwner } from './access'
import { payTransaction } from '../context'

const hash = (raw: string | Buffer) => createHash('sha256').update(raw).digest('hex')
/** Authenticates a dedicated server connector, NOT an arbitrary bot/customer/phone. */
export async function receiveBaleBankMessage(signature: string, eventHeader: string, raw: Buffer, sourceId?: string) {
  const binding = selectedBaleSource(process.env, sourceId)
  if (!binding) throw new PayError('اتصال سروری بله آماده نیست', 503, 'BALE_SOURCE_OFF')
  if (!raw.length || raw.length > 24000) throw new PayError('حجم پیام بله معتبر نیست', 413)
  if (!/^sha256=[a-f0-9]{64}$/.test(signature) || !/^[a-f0-9]{64}$/.test(eventHeader)) throw new PayError('امضای اتصال بله معتبر نیست', 401)
  const expected = createHmac('sha256', binding.secret).update(raw).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new PayError('امضای اتصال بله معتبر نیست', 401)
  // Invalid UTF8 cannot be transformed into a different signed JSON interpretation.
  if (!raw.equals(Buffer.from(raw.toString('utf8')))) throw new PayError('کدگذاری پیام بله معتبر نیست', 422)
  const message = originalBaleMessage(raw.toString('utf8'), eventHeader, binding)
  const payloadHash = hash(raw)
  const received = await payTransaction(async tx => {
    if (!(await isModuleEnabled('mobocom-pay', tx)) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true') throw new PayError('دریافت سروری بله غیرفعال است', 403)
    const owner = await baleSourceOwner(binding, tx)
    if (!owner) throw new PayError('مجوز مالک اتصال بله معتبر نیست', 403)
    const bank = await tx.bankAccount.findUnique({ where: { id: binding.bankAccountId } })
    if (!bank?.active || !/^\d{13}$/.test(latinDigits(bank.accountNumber).trim())) throw new PayError('حساب مقصد بله آماده نیست', 503)
    const previous = await tx.payBaleNotice.findUnique({ where: { instanceId_sourceEventId: { instanceId: binding.instanceId, sourceEventId: message.eventId } } })
    if (previous) {
      if (previous.payloadHash !== payloadHash || previous.sourceAccountId !== binding.accountId || previous.bankAccountId !== binding.bankAccountId || previous.bankPeerId !== binding.bankPeerId) throw new PayError('شناسهٔ پیام بله با دادهٔ دیگری تکرار شده است', 409)
      return { received: true as const, id: previous.id, duplicate: true, status: previous.status, financialApproval: false as const }
    }
    if (message.sentAt.getTime() > Date.now() + 60000 || message.sentAt.getTime() < Date.now() - 300000) throw new PayError('زمان اصلی پیام بله معتبر نیست', 422)
    if (await tx.payBaleNotice.count({ where: { instanceId: binding.instanceId, messageId: message.messageId } })) throw new PayError('پیام اصلی با شناسهٔ رویداد دیگری تکرار شده است', 409)
    if (await tx.payBaleNotice.count({ where: { instanceId: binding.instanceId, receivedAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10000) throw new PayError('سقف روزانهٔ دریافت بله پر شده است', 429)
    const parsed = parseBaleAmount(message.text)
    const strict = parsePayBankNotice('MELLI', message.text)
    const notice = strict.ok ? strict.notice : null
    const credit = parsed.ok && parsed.kind === 'TRANSFER' && parsed.direction === 'CREDIT'
    let status = parsed.ok ? credit ? 'ORIGINAL_TRANSFER' : 'IGNORED' : 'REJECTED'
    let code = parsed.ok ? credit ? 'TRANSFER_CANDIDATE' : parsed.kind : parsed.code
    // Bank reference/time identity survives changes of connector instance and source message IDs.
    let bankFingerprint = notice && credit ? hash(JSON.stringify([bank.id, notice.transferReference, notice.occurredFrom])) : null
    let duplicateOfId: string | null = null
    if (bankFingerprint && notice) {
      const original = await tx.payBaleNotice.findUnique({ where: { bankFingerprint } })
      if (original) {
        duplicateOfId = original.id; bankFingerprint = null
        const same = parsed.ok && original.amountMinor?.toString() === parsed.amountRial && original.kind === notice.kind && original.direction === parsed.direction
        status = same ? 'DUPLICATE' : 'CONFLICT'; code = same ? 'BANK_NOTICE_REPEATED' : 'BANK_NOTICE_CONFLICT'
      }
    }
    const row = await tx.payBaleNotice.create({ data: {
      id: randomUUID(), instanceId: binding.instanceId, sourceAccountId: binding.accountId, sourceEventId: message.eventId,
      messageId: message.messageId, bankPeerId: binding.bankPeerId, bankAccountId: bank.id, payloadHash, bankFingerprint, duplicateOfId,
      status, code, kind: credit ? notice?.kind || 'CARD_TRANSFER' : notice?.kind || 'UNKNOWN', direction: parsed.ok ? parsed.direction : '', amountMinor: parsed.ok ? BigInt(parsed.amountRial) : null,
      transferReference: notice?.transferReference || '', occurredFrom: null,
      occurredBefore: null, sourceSentAt: message.sentAt, receivedAt: new Date(),
    } })
    await auditSystemStrict({ actor: { id: owner.id, email: owner.email }, action: 'mobocom-pay.bale.received', targetType: 'mobocom-pay', targetId: row.id, metadata: { status, code, source: 'SERVER_ACCOUNT', financialApproval: false } }, tx)
    // Receipt and strict audit commit BEFORE any matching attempt or provider ACK.
    return { received: true as const, id: row.id, duplicate: duplicateOfId !== null, status, financialApproval: false as const }
  })
  return { ...received, ...await matchBaleNotice(received.id) }
}
