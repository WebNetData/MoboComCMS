import { createHash } from 'node:crypto'
import { uniqueBaleJson } from '@/modules/billing/domain/pay-bale'
import { forwardedSmsIdentity } from '@/modules/billing/domain/pay-sms-source'
import { PayError } from '@/modules/billing/domain/pay'
import { receiveAuthenticatedSms } from './intake'

/** Exact three-field SMS Forwarder contract. No invented sender or device timestamp. */
export function receiveForwardedSms(id: string, raw: Buffer) {
  if (!raw.length || raw.length > 24000) throw new PayError('حجم پیام معتبر نیست', 413)
  if (!raw.equals(Buffer.from(raw.toString('utf8')))) throw new PayError('کدگذاری پیام معتبر نیست', 422)
  const body = uniqueBaleJson(raw.toString('utf8'))
  if (Object.keys(body).length !== 3 || !['sms','bank','token'].every(key => Object.hasOwn(body, key)) || typeof body.sms !== 'string' || !body.sms.trim() || body.sms.length > 4096 || typeof body.bank !== 'string' || !/^[a-z0-9_]{3,40}$/.test(body.bank) || typeof body.token !== 'string') throw new PayError('ساختار پیامک باید فقط sms، bank و token داشته باشد', 422)
  const identity = forwardedSmsIdentity(id, body.bank, body.sms), digest = createHash('sha256').update(identity).digest('hex')
  return receiveAuthenticatedSms({ id, bearer: body.token, mode: 'FORWARDER_V1', messageId: 'forwarder:' + digest, message: body.sms, bankCode: body.bank, payloadHash: digest })
}
