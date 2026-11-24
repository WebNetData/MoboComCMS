import { latinDigits } from '@/shared/text/digits'
import { fromJalali } from '@/shared/time/jalali'

export type BankNoticeCode = 'UNSUPPORTED_BANK' | 'INVALID_FORMAT' | 'INVALID_AMOUNT' | 'INVALID_ACCOUNT' | 'INVALID_REFERENCE' | 'INVALID_TIME'
export type MelliNoticeKind = 'CARD_TRANSFER' | 'PAYA' | 'SATNA' | 'INTEREST' | 'INTERNET_PURCHASE' | 'TRANSFER_FEE' | 'BALANCE_FEE' | 'POS_PURCHASE' | 'UNKNOWN'
export interface ParsedBankNotice {
  bankId: 'MELLI'
  parserVersion: 'melli-bale-v1'
  /** Text parsing is NEVER sender authentication or bank-side payment attribution. */
  verification: 'UNVERIFIED_NOTICE'
  kind: MelliNoticeKind
  direction: 'CREDIT' | 'DEBIT'
  amountRial: string
  accountNumber: string
  transferReference: string
  /** The supplied bank template has minute precision, not an exact second. */
  occurredFrom: string
  occurredBefore: string
  timeZone: 'Asia/Tehran'
  precision: 'MINUTE'
  matching: 'TRANSFER_CANDIDATE' | 'DEBIT' | 'NON_PAYMENT_CREDIT' | 'UNKNOWN_TYPE' | 'INCONSISTENT_TYPE'
}
export type BankNoticeResult = { ok: true; notice: ParsedBankNotice } | { ok: false; code: BankNoticeCode }

const labels = ['مبلغ', 'مانده', 'شماره حساب', 'توضیحات', 'شعبه', 'شماره پیگیری', 'مقصد تراکنش', 'زمان'] as const
const kinds = new Map<string, MelliNoticeKind>([
  ['انتقال_به_کارت_-_شتاب', 'CARD_TRANSFER'], ['حواله_پایا', 'PAYA'], ['حواله_ساتنا', 'SATNA'],
  ['سود_پرداخت_شده', 'INTEREST'], ['خرید_اینترنتی', 'INTERNET_PURCHASE'],
  ['کارمزد_حواله_پل', 'TRANSFER_FEE'], ['کارمزددرخواست_مانده', 'BALANCE_FEE'], ['برداشت_با_POS', 'POS_PURCHASE'],
])
const transfers = new Set<MelliNoticeKind>(['CARD_TRANSFER', 'PAYA', 'SATNA'])
const debits = new Set<MelliNoticeKind>(['INTERNET_PURCHASE', 'TRANSFER_FEE', 'BALANCE_FEE', 'POS_PURCHASE'])
const maxRial = 9_223_372_036_854_775_807n
const fail = (code: BankNoticeCode): BankNoticeResult => ({ ok: false, code })

function normalized(input: string) {
  return latinDigits(input).replace(/\r\n?/g, '\n').replace(/\\([*_])/g, '$1').replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/[\u200e\u200f]/g, '').replace(/[\u00a0\u202f]/g, ' ')
}
const words = (value: string) => value.replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک')

function noticeTime(value: string): { occurredFrom: string; occurredBefore: string } | null {
  const match = /^(\d{2}):(\d{2}) (\d{4})\/(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return null
  const [, hh, mm, yy, mo, dd] = match, year = Number(yy), month = Number(mo), day = Number(dd)
  // This bank adapter supports modern post-DST notices only. Older text stays review-only.
  if (year < 1402 || year > 1499 || month < 1 || month > 12 || day < 1 || day > 31 || Number(hh) > 23 || Number(mm) > 59) return null
  try {
    const utc = fromJalali(year, month, day).getTime() + (Number(hh) * 60 + Number(mm) - 210) * 60_000
    return { occurredFrom: new Date(utc).toISOString(), occurredBefore: new Date(utc + 60_000).toISOString() }
  } catch { return null }
}

/** One original message body, not a pasted batch; no raw text/balance/counterparty is returned. */
function parseMelli(input: unknown): BankNoticeResult {
  if (typeof input !== 'string' || input.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(input)) return fail('INVALID_FORMAT')
  const lines = normalized(input).split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length !== 10 || lines.some(line => line.includes('*')) || !['بانک ملی ایران', 'اطلاع‌رسانی بانک ملی ایران: بانک ملی ایران'].includes(words(lines[0]))) return fail('INVALID_FORMAT')
  const type = /^#([\p{L}\p{N}_-]{1,80})$/u.exec(words(lines[1]))
  if (!type) return fail('INVALID_FORMAT')
  const fields = new Map<string, string>()
  for (const line of lines.slice(2)) {
    const at = line.indexOf(':')
    if (at === -1) return fail('INVALID_FORMAT')
    const label = words(line.slice(0, at).trim()), value = line.slice(at + 1).trim()
    if (!labels.some(known => known === label) || fields.has(label) || value.length > 600) return fail('INVALID_FORMAT')
    fields.set(label, value)
  }
  if (fields.size !== labels.length) return fail('INVALID_FORMAT')
  // Only the explicit signed amount field is money; NEVER the balance or description.
  const amount = /^([1-9]\d{0,18}|[1-9]\d{0,2}(?:[,٬]\d{3}){1,6})([+-]) ریال$/.exec(fields.get('مبلغ') || '')
  if (!amount) return fail('INVALID_AMOUNT')
  const amountRial = amount[1].replace(/[,٬]/g, '')
  if (BigInt(amountRial) > maxRial) return fail('INVALID_AMOUNT')
  const account = /^#(\d{13})$/.exec(fields.get('شماره حساب') || '')
  if (!account) return fail('INVALID_ACCOUNT')
  const transferReference = fields.get('شماره پیگیری') || ''
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(transferReference)) return fail('INVALID_REFERENCE')
  const time = noticeTime(fields.get('زمان') || '')
  if (!time) return fail('INVALID_TIME')
  const kind = kinds.get(type[1]) || 'UNKNOWN', direction = amount[2] === '+' ? 'CREDIT' : 'DEBIT'
  const matching: ParsedBankNotice['matching'] = kind === 'UNKNOWN' ? 'UNKNOWN_TYPE'
    : direction === 'DEBIT' ? 'DEBIT' : debits.has(kind) ? 'INCONSISTENT_TYPE'
    : transfers.has(kind) ? 'TRANSFER_CANDIDATE' : 'NON_PAYMENT_CREDIT'
  return { ok: true, notice: { bankId: 'MELLI', parserVersion: 'melli-bale-v1', verification: 'UNVERIFIED_NOTICE', kind, direction, amountRial, accountNumber: account[1], transferReference, ...time, timeZone: 'Asia/Tehran', precision: 'MINUTE', matching } }
}

/** Other banks require their own verified templates; no generic amount/sign fallback. */
export function parsePayBankNotice(bankId: string, input: unknown): BankNoticeResult {
  return bankId === 'MELLI' ? parseMelli(input) : fail('UNSUPPORTED_BANK')
}
