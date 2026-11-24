import { latinDigits } from '@/shared/text/digits'

type BaleAmount = { ok: true; amountRial: string; direction: 'CREDIT' | 'DEBIT'; kind: 'TRANSFER' | 'INTEREST' | 'OTHER' } | { ok: false; code: string }
const transfers = new Set(['انتقال_به_کارت_-_شتاب', 'حواله_پایا', 'حواله_ساتنا'])
const debits = new Set(['خرید_اینترنتی', 'کارمزد_حواله_پل', 'کارمزددرخواست_مانده', 'برداشت_با_POS'])
const normalize = (text: string) => latinDigits(text).replace(/\r\n?/g, '\n').replace(/\\([*_])/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/[\u200e\u200f]/g, '').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')

/** Parses only a known bank template's kind and amount. Source authenticity is the caller's responsibility. */
export function parseBaleAmount(text: string): BaleAmount {
  if (typeof text !== 'string' || text.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(text)) return { ok: false, code: 'INVALID_FORMAT' }
  const lines = normalize(text).split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length !== 10 || !['بانک ملی ایران', 'اطلاع‌رسانی بانک ملی ایران: بانک ملی ایران'].includes(lines[0]) || lines.some(line => line.includes('*'))) return { ok: false, code: 'INVALID_FORMAT' }
  const type = /^#([\p{L}\p{N}_-]{1,80})$/u.exec(lines[1])?.[1]
  const amounts = lines.slice(2).filter(line => /^مبلغ\s*:/.test(line))
  if (!type || amounts.length !== 1) return { ok: false, code: 'INVALID_FORMAT' }
  const match = /^مبلغ\s*:\s*([1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{0,2}(?:٬\d{3})+)([+-]) ریال$/.exec(amounts[0])
  if (!match || BigInt(match[1].replace(/[,٬]/g, '')) > 9223372036854775807n) return { ok: false, code: 'INVALID_AMOUNT' }
  const direction = match[2] === '+' ? 'CREDIT' : 'DEBIT'
  const kind = type === 'سود_پرداخت_شده' ? 'INTEREST' : transfers.has(type) && direction === 'CREDIT' ? 'TRANSFER' : 'OTHER'
  // Known debit types and any negative amount can never become a transfer credit.
  return { ok: true, amountRial: match[1].replace(/[,٬]/g, ''), direction, kind: debits.has(type) ? 'OTHER' : kind }
}
