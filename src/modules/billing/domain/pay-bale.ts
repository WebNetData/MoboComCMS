import { PayError } from './pay'

export const BALE_BANK_USERNAME = 'bam_bmi'
export type BaleBinding = { alias: string; instanceId: string; accountId: string; bankPeerId: string; bankAccountId: number; ownerUserId: number }
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new PayError('ساختار پیام بله معتبر نیست', 422)
  return v as Record<string, unknown>
}
const decimalId = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) && BigInt(v) <= 4294967295n

/** Deployment-owned binding, never inferred from an incoming event or display name. */
export function baleBinding(env: Record<string, string | undefined>): BaleBinding | null {
  const alias = env.MOBOCOM_PAY_BALE_SESSION || '', instanceId = env.MOBOCOM_PAY_BALE_INSTANCE || ''
  const accountId = env.MOBOCOM_PAY_BALE_ACCOUNT || '', bankPeerId = env.MOBOCOM_PAY_BALE_BANK_PEER || ''
  const id = env.MOBOCOM_PAY_BALE_BANK_ACCOUNT || '', bankAccountId = Number(id)
  const owner = env.MOBOCOM_PAY_BALE_OWNER_USER_ID || '', ownerUserId = Number(owner)
  if (env.MOBOCOM_PAY_BALE_ENABLED !== 'true' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(alias) ||
    !/^[a-f0-9]{64}$/.test(instanceId) || !decimalId(accountId) || !decimalId(bankPeerId) || accountId === bankPeerId ||
    !/^[1-9]\d{0,9}$/.test(id) || !Number.isSafeInteger(bankAccountId) || bankAccountId > 2147483647 ||
    !/^[1-9]\d{0,9}$/.test(owner) || !Number.isSafeInteger(ownerUserId) || ownerUserId > 2147483647 ||
    (env.MOBOCOM_PAY_BALE_WEBHOOK_SECRET || '').length < 32) return null
  return { alias, instanceId, accountId, bankPeerId, bankAccountId, ownerUserId }
}

/** JSON.parse accepts duplicate identity keys. Check decoded keys at every depth first. */
export function uniqueBaleJson(raw: string): Record<string, unknown> {
  if (raw.length > 24000) throw new PayError('حجم پیام بله معتبر نیست', 413)
  let at = 0
  const white = () => { while (/^[\t\n\r ]$/.test(raw[at] || 'x')) at++ }
  const string = (): string => {
    const start = at++
    while (at < raw.length) {
      if (raw[at] === '\\') { at += 2; continue }
      if (raw[at++] === '"') return JSON.parse(raw.slice(start, at)) as string
    }
    throw new Error('string')
  }
  const value = (depth: number): void => {
    if (depth > 24) throw new Error('depth')
    white()
    if (raw[at] === '"') { string(); return }
    if (raw[at] === '{') {
      at++; white(); const keys = new Set<string>()
      if (raw[at] === '}') { at++; return }
      while (at < raw.length) {
        white(); if (raw[at] !== '"') throw new Error('key')
        const key = string(); if (keys.has(key)) throw new Error('duplicate'); keys.add(key)
        white(); if (raw[at++] !== ':') throw new Error('colon')
        value(depth + 1); white(); const end = raw[at++]
        if (end === '}') return
        if (end !== ',') throw new Error('comma')
      }
    } else if (raw[at] === '[') {
      at++; white(); if (raw[at] === ']') { at++; return }
      while (at < raw.length) { value(depth + 1); white(); const end = raw[at++]; if (end === ']') return; if (end !== ',') throw new Error('comma') }
    } else {
      const start = at
      while (at < raw.length && !/[\s,\]}]/.test(raw[at])) at++
      if (at === start) throw new Error('primitive')
      JSON.parse(raw.slice(start, at)); return
    }
    throw new Error('end')
  }
  try { value(0); white(); if (at !== raw.length) throw new Error('trailing'); return object(JSON.parse(raw)) }
  catch { throw new PayError('JSON پیام بله مبهم یا نامعتبر است', 422) }
}

export type BaleOriginalMessage = { eventId: string; messageId: string; sentAt: Date; text: string }
/** GoOmni2.4.2 message contract; no best-effort identity/provenance fallback. */
export function originalBaleMessage(raw: string, eventHeader: string, binding: BaleBinding): BaleOriginalMessage {
  const e = uniqueBaleJson(raw), peer = object(e.peer), p = object(e.payload), c = object(e.content)
  const fail = () => { throw new PayError('پیام اصلی از بازوی بانکی مجاز دریافت نشده است', 422) }
  if (e.provider !== 'bale' || e.session_id !== binding.alias || e.instance_id !== binding.instanceId || e.device_id !== binding.accountId ||
    peer.type !== 'user' || peer.id !== binding.bankPeerId || e.sender_id !== binding.bankPeerId || e.direction !== 'incoming' ||
    e.event !== 'message' || typeof e.event_id !== 'string' || !/^[a-f0-9]{64}$/.test(e.event_id) || e.event_id !== eventHeader ||
    typeof e.message_id !== 'string' || !/^-?[1-9]\d{0,18}$/.test(e.message_id) || BigInt(e.message_id) < -9223372036854775808n || BigInt(e.message_id) > 9223372036854775807n ||
    p.id !== e.message_id || p.chat_id !== binding.bankPeerId || p.from !== binding.bankPeerId || p.is_from_me !== false || p.partial !== false ||
    p.kind !== 'text' || p.supported !== true || c.kind !== 'text' || typeof p.body !== 'string' || !p.body.length || p.body.length > 4096 || c.message !== p.body) fail()
  // Optional forward/edit fields must be absent or explicitly empty/false, never guessed away.
  for (const item of [p, c]) {
    for (const key of ['forwarded_from', 'forward', 'forwarded', 'original_message_id', 'editor_id', 'is_edited', 'edited_at', 'quoted_body', 'replied_to_id'])
      if (Object.hasOwn(item, key) && item[key] !== null && item[key] !== '' && item[key] !== false) fail()
  }
  if (typeof e.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(e.timestamp) || p.timestamp !== e.timestamp || !Number.isFinite(Date.parse(e.timestamp))) fail()
  return { eventId: e.event_id as string, messageId: e.message_id as string, sentAt: new Date(e.timestamp as string), text: p.body as string }
}
