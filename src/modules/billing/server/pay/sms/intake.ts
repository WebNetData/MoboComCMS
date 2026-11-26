import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { isModuleEnabled } from '@/extensions/server/modules'
import { uniqueSmsJson } from '@/modules/billing/domain/pay-sms-json'
import { PayError } from '@/modules/billing/domain/pay'
import { parseSmsAmount } from '@/modules/billing/domain/pay-sms-template'
import { smsSourceConfig, type SmsSourceFormat } from '@/modules/billing/domain/pay-sms-source'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { auditSystemStrict } from '@/platform/audit/server'
import { sourceOwner } from '../bale/access'
import { matchBaleNotice } from '../bale/collection-match'
import { payTransaction } from '../context'
import { queueTransferMatch } from '../bale/match-job'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export async function receiveSmsNotice(id: string, bearer: string, raw: Buffer) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(bearer)) throw new PayError('کلید منبع معتبر نیست', 401)
  if (!raw.length || raw.length > 24000) throw new PayError('حجم پیام معتبر نیست', 413)
  if (!raw.equals(Buffer.from(raw.toString('utf8')))) throw new PayError('کدگذاری پیام معتبر نیست', 422)
  const body = uniqueSmsJson(raw.toString('utf8'))
  if (Object.keys(body).length !== 4 || !['message_id', 'sender', 'message', 'received_at'].every(key => Object.hasOwn(body, key)) || typeof body.message_id !== 'string' || !body.message_id.length || body.message_id.length > 120 || /[\x00-\x1f\x7f-\x9f]/.test(body.message_id) || typeof body.sender !== 'string' || !body.sender.trim() || body.sender.length > 80 || typeof body.message !== 'string' || !body.message.length || body.message.length > 4096 || typeof body.received_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(body.received_at) || !Number.isFinite(Date.parse(body.received_at))) throw new PayError('ساختار پیام معتبر نیست', 422)
  const messageId = body.message_id, sender = body.sender, message = body.message, sentAt = new Date(body.received_at), payloadHash = hash(raw)
  return receiveAuthenticatedSms({ id, bearer, mode: 'EXTENDED_V1', messageId, sender, message, sentAt, payloadHash })
}

type SmsInput = { id: string; bearer: string; mode: SmsSourceFormat; messageId: string; sender?: string; message: string; sentAt?: Date; payloadHash: string; bankCode?: string }
/** Both wire formats share the same source authority, durable notice and financial matcher. */
export async function receiveAuthenticatedSms(input: SmsInput) {
  const { id, bearer, messageId, message, payloadHash, mode } = input
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(bearer)) throw new PayError('کلید منبع معتبر نیست', 401)
  const received = await payTransaction(async tx => {
    if (!await isModuleEnabled('mobocom-pay', tx) || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true') throw new PayError('دریافت پیامک غیرفعال است', 403)
    const source = await tx.paySmsSource.findUnique({ where: { id }, include: { bankAccount: true } })
    if (!source || !source.active || !source.verified) throw new PayError('منبع پیامک غیرفعال است', 401)
    const secret = decryptPanelCredential(source.secretCiphertext), expected = Buffer.from(secret), supplied = Buffer.from(bearer)
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new PayError('کلید منبع معتبر نیست', 401)
    const owner = await sourceOwner(source.ownerUserId, tx)
    if (!owner || !source.bankAccount.active || source.bankAccount.collectionUse !== 'MOBOCOM_PAY') throw new PayError('مجوز منبع معتبر نیست', 403)
    let config
    try { config = smsSourceConfig(JSON.parse(source.templateJson)) } catch { throw new PayError('قالب منبع معتبر نیست', 503) }
    if (config.format !== mode) throw new PayError('قالب ارسال منبع با این مسیر مطابقت ندارد', 422, 'SMS_FORMAT_MISMATCH')
    const template = config.template
    if (template.bankCode !== source.bankCode || mode === 'FORWARDER_V1' && input.bankCode !== source.bankCode) throw new PayError('کد بانک با این منبع مطابقت ندارد', 403, 'SMS_BANK_MISMATCH')
    const instanceId = hash(`${source.id}:${source.version}`), sourceEventId = hash(`${source.id}:${messageId}`)
    const previous = await tx.payBaleNotice.findFirst({ where: { smsSourceId: source.id, sourceEventId } })
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new PayError('شناسهٔ پیام تکراری با محتوای متفاوت است', 409)
      await queueTransferMatch(tx,previous)
      return { received: true as const, id: previous.id, status: previous.status, duplicate: true }
    }
    const now = new Date(), sentAt = input.sentAt || now
    if (sentAt.getTime() > now.getTime() + 60000 || sentAt.getTime() < now.getTime() - 300000) throw new PayError('زمان دریافت گوشی معتبر نیست', 422)
    if (await tx.payBaleNotice.count({ where: { smsSourceId: source.id, receivedAt: { gte: new Date(now.getTime() - 86400000) } } }) >= 10000) throw new PayError('سقف روزانهٔ پیامک پر شده است', 429)
    if (mode === 'EXTENDED_V1' && input.sender?.trim().toLowerCase() !== template.sender.trim().toLowerCase()) throw new PayError('فرستندهٔ پیامک مطابقت ندارد', 403)
    const parsed = parseSmsAmount(template, message), credit = parsed.ok && parsed.direction === 'CREDIT'
    const code = mode === 'FORWARDER_V1' ? 'SMS_FORWARDER_' + (credit ? 'CREDIT' : parsed.ok ? 'DEBIT' : parsed.code) : credit ? 'SMS_CREDIT' : parsed.ok ? 'SMS_DEBIT' : parsed.code
    // These IDs are internal deduplication identifiers, not bank-provided evidence.
    const row = await tx.payBaleNotice.create({ data: { id: randomUUID(), instanceId, sourceAccountId: String(source.bankAccountId), sourceEventId, messageId: (BigInt('0x' + hash(messageId).slice(0, 15)) + 1n).toString(), bankPeerId: '1', bankAccountId: source.bankAccountId, payloadHash, status: credit ? 'ORIGINAL_TRANSFER' : parsed.ok ? 'IGNORED' : 'REJECTED', code, kind: credit ? 'CARD_TRANSFER' : 'UNKNOWN', direction: parsed.ok ? parsed.direction : '', amountMinor: parsed.ok ? BigInt(parsed.amountRial) : null, occurredFrom: null, occurredBefore: null, transferReference: '', sourceSentAt: sentAt, receivedAt: now, sourceType: 'SMS', bankCode: source.bankCode, smsSourceId: source.id } })
    await auditSystemStrict({ actor: owner, action: 'mobocom-pay.sms.received', targetType: 'mobocom-pay', targetId: row.id, metadata: { sourceId: id, status: row.status, code: row.code, format: mode, timeBasis: mode === 'FORWARDER_V1' ? 'SERVER_RECEIPT' : 'PHONE_RECEIPT' } }, tx)
    await queueTransferMatch(tx,row)
    return { received: true as const, id: row.id, status: row.status, duplicate: false }
  })
  try { return { ...received, ...await matchBaleNotice(received.id) } }
  catch (error) {
    if (mode === 'FORWARDER_V1' && error instanceof PayError && error.code === 'PAY_PURCHASE_TIME_REQUIRED') return { ...received, financialApproval: false, reviewRequired: true, code: error.code }
    throw error
  }
}
