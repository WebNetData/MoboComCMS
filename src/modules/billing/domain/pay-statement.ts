import { PayError } from './pay'
import { reference } from './pay-policy'
import { latinDigits } from './card-transfer'

export const statementHeader = 'reference,amount_irr,occurred_at'
export const statementMaxBytes = 32_768
export type StatementEntry = { reference: string; amountRial: string; at: string }
export type StatementPreview = {
  entries: number
  duplicates: number
  suggestions: { receiptId: number; entry: StatementEntry }[]
  ambiguous: number
  unmatched: number
  alreadyUsed: number
}

export function parsePayStatement(value: unknown) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > statementMaxBytes)
    throw new PayError('فایل گردش حساب باید UTF-8 و حداکثر ۳۲ کیلوبایت باشد', 422)
  const [header, ...rows] = value.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const cells = (line: string) => line.split(',').map(cell => cell.trim().replace(/^"([^"]*)"$/, '$1'))
  if (cells(header).join(',') !== statementHeader || rows.length === 0 || rows.length > 250)
    throw new PayError('فایل باید مطابق قالب نمونه و دارای ۱ تا ۲۵۰ ردیف واریز باشد', 422)
  const entries = new Map<string, StatementEntry>()
  let duplicates = 0
  for (const [index, row] of rows.entries()) {
    const parts = cells(row)
    const [ref, amount, timestamp] = parts.map(latinDigits)
    if (parts.length !== 3 || !/^[1-9]\d{0,18}$/.test(amount) || BigInt(amount) > 9_223_372_036_854_775_807n ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(timestamp))
      throw new PayError(`قالب مبلغ یا زمانِ دارای منطقهٔ زمانی در ردیف ${index + 2} معتبر نیست`, 422)
    const time = new Date(timestamp)
    const local = timestamp.slice(0, 19)
    const calendar = new Date(local + 'Z')
    if (!Number.isFinite(time.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString() !== local + '.000Z')
      throw new PayError(`زمان ردیف ${index + 2} معتبر نیست`, 422)
    const at = time.toISOString().replace(/\.000Z$/, 'Z')
    const id = reference(ref).toUpperCase()
    const previous = entries.get(id)
    if (previous) {
      if (previous.amountRial !== amount || previous.at !== at) throw new PayError(`شناسهٔ پیگیری ردیف ${index + 2} با ردیف دیگری تناقض دارد`, 422)
      duplicates++
    } else entries.set(id, { reference: id, amountRial: amount, at })
  }
  return { entries: [...entries.values()], duplicates }
}
