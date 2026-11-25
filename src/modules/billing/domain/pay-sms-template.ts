import { latinDigits } from '@/shared/text/digits'

export type SmsTemplateConfig = { bankCode: string; sender: string; creditTemplate: string; debitTemplate: string; unit: 'IRR' | 'IRT'; calendar: 'JALALI' | 'GREGORIAN' }
type Token = 'amount' | 'account' | 'reference' | 'date' | 'time' | 'ignore'
const tokenPattern = /\{(amount|account|reference|date|time|ignore)\}/g
const fields: Record<Token, string> = { amount: '([0-9,٬]{1,40})', account: '([0-9]{5,30})', reference: '([A-Za-z0-9_-]{6,64})', date: '([0-9/]{4,10})', time: '([0-9]{2}:[0-9]{2})', ignore: '(?:[0-9,٬]{1,40})' }
const invalid = () => { throw new Error('Invalid SMS template configuration') }
const normalized = (value: string) => latinDigits(value).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim()
export const normalizedSmsText = normalized
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function validateTemplate(value: unknown, optional = false): string {
  if (optional && value === '') return ''
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value)) return invalid()
  const found = [...value.matchAll(tokenPattern)].map(item => item[1])
  if (found.filter(item => item === 'amount').length !== 1 || ['account', 'reference', 'date', 'time'].some(token => found.filter(item => item === token).length > 1) || found.filter(item => item === 'ignore').length > 3 || /[{}]/.test(value.replace(tokenPattern, ''))) return invalid()
  const parts = value.split(/(\{(?:amount|account|reference|date|time|ignore)\})/g)
  for (let i = 1; i + 2 < parts.length; i += 2) if (!parts[i + 1] || /^[0-9۰-۹٠-٩,٬]+$/.test(parts[i + 1])) return invalid()
  return normalized(value)
}
const staticParts = (template: string) => template.replace(tokenPattern, '')
export function normalizeSmsTemplate(input: unknown): SmsTemplateConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== 6 || !['bankCode', 'sender', 'creditTemplate', 'debitTemplate', 'unit', 'calendar'].every(key => Object.hasOwn(value, key))) return invalid()
  if (typeof value.bankCode !== 'string' || !/^[a-z0-9_]{3,40}$/.test(value.bankCode) || typeof value.sender !== 'string' || !value.sender.trim() || value.sender.length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(value.sender)) return invalid()
  if (value.unit !== 'IRR' && value.unit !== 'IRT' || value.calendar !== 'JALALI' && value.calendar !== 'GREGORIAN') return invalid()
  const creditTemplate = validateTemplate(value.creditTemplate), debitTemplate = validateTemplate(value.debitTemplate, true)
  if (!staticParts(creditTemplate).trim() || debitTemplate && staticParts(creditTemplate) === staticParts(debitTemplate)) return invalid()
  return { bankCode: value.bankCode, sender: value.sender, creditTemplate, debitTemplate, unit: value.unit, calendar: value.calendar }
}

const preset = (bankCode: string, creditTemplate: string): SmsTemplateConfig => ({ bankCode, sender: bankCode, creditTemplate, debitTemplate: '', unit: 'IRR', calendar: 'JALALI' })
export const smsBankPresets: SmsTemplateConfig[] = [
  preset('bankmellat', 'حساب{account} واریز{amount} مانده{ignore} {date}-{time}'),
  preset('bankmehriran', '{account} {amount}+ {date}-{time} مانده:{ignore}'),
  preset('bankmeli', 'بانک ملی ایران انتقال:{amount}+ حساب:{account} مانده:{ignore} {date}-{time}'),
]

function match(template: string, message: string): Partial<Record<Token, string>> | null {
  const order: Token[] = [], pieces = template.split(/(\{(?:amount|account|reference|date|time|ignore)\})/g)
  const pattern = pieces.map(piece => {
    const token = /^\{(amount|account|reference|date|time|ignore)\}$/.exec(piece)?.[1] as Token | undefined
    if (!token) return escape(piece)
    if (token !== 'ignore') order.push(token)
    return fields[token]
  }).join('')
  const result = new RegExp(`^(?:${pattern})$`, 'u').exec(message)
  return result ? Object.fromEntries(order.map((token, index) => [token, result[index + 1]])) : null
}
type SmsNotice = { amountRial: string; accountNumber?: string; transferReference?: string; date?: string; time?: string; kind: 'SMS_TRANSFER' | 'SMS_DEBIT'; direction: 'CREDIT' | 'DEBIT' }
export function parseSmsTemplate(config: SmsTemplateConfig, text: string): { ok: true; notice: SmsNotice } | { ok: false; code: string } {
  let checked: SmsTemplateConfig
  try { checked = normalizeSmsTemplate(config) } catch { return { ok: false, code: 'INVALID_CONFIG' } }
  if (typeof text !== 'string' || text.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(text)) return { ok: false, code: 'INVALID_MESSAGE' }
  const message = normalized(text), credit = match(checked.creditTemplate, message), debit = checked.debitTemplate ? match(checked.debitTemplate, message) : null
  if (!!credit === !!debit) return { ok: false, code: 'NO_UNIQUE_MATCH' }
  const value = (credit || debit)!, raw = value.amount!
  if (!/^(?:[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{0,2}(?:٬[0-9]{3})+)$/.test(raw)) return { ok: false, code: 'INVALID_AMOUNT' }
  const amount = BigInt(raw.replace(/[,٬]/g, '')) * (checked.unit === 'IRT' ? 10n : 1n)
  if (amount > 9223372036854775807n) return { ok: false, code: 'INVALID_AMOUNT' }
  return { ok: true, notice: { amountRial: amount.toString(), ...(value.account ? { accountNumber: value.account } : {}), ...(value.reference ? { transferReference: value.reference } : {}), ...(value.date ? { date: value.date } : {}), ...(value.time ? { time: value.time } : {}), kind: credit ? 'SMS_TRANSFER' : 'SMS_DEBIT', direction: credit ? 'CREDIT' : 'DEBIT' } }
}
export function parseSmsAmount(config: SmsTemplateConfig, text: string): { ok: true; amountRial: string; direction: 'CREDIT' | 'DEBIT' } | { ok: false; code: string } {
  const result = parseSmsTemplate(config, text)
  return result.ok ? { ok: true, amountRial: result.notice.amountRial, direction: result.notice.direction } : result
}
