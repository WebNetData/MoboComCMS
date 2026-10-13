// What an order needs from its buyer, and a service whose foreign amount the buyer types (pure rules).
//
// A product lists "order fields": a label, a kind, whether it is required, and optionally the options
// (variant names) it applies to — "on your own account" asks for the login, "ready-made" asks for nothing.
// The buyer's answers travel with the cart line into the order, stored encrypted with the labels they
// were asked under (so editing the product later does not relabel an old order).

export const ORDER_FIELD_KINDS = ['text', 'textarea', 'secret', 'url', 'email'] as const
export type OrderFieldKind = (typeof ORDER_FIELD_KINDS)[number]
export type OrderField = { key: string; label: string; labelEn: string; kind: OrderFieldKind; required: boolean; help: string; options: string[] }
export type OrderAnswer = { key: string; label: string; kind: OrderFieldKind; value: string }

export const MAX_ORDER_FIELDS = 12
const LIMITS: Record<OrderFieldKind, number> = { text: 300, textarea: 2000, secret: 300, url: 500, email: 200 }

export class OrderInputError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'ORDER_INPUT') { super(message) }
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
const parse = (input: unknown): unknown => { if (typeof input !== 'string') return input; try { return JSON.parse(input || '[]') } catch { return null } }

/** The admin's list of order fields, validated (also used to read the stored column). */
export function validateOrderFields(input: unknown): OrderField[] {
  const raw = parse(input)
  if (!Array.isArray(raw) || raw.length > MAX_ORDER_FIELDS) throw new OrderInputError(`حداکثر ${MAX_ORDER_FIELDS.toLocaleString('fa-IR')} فیلد برای اطلاعات سفارش مجاز است`)
  const keys = new Set<string>()
  return raw.map((value) => {
    const field = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const key = clean(field.key, 40).toLowerCase()
    const label = clean(field.label, 80)
    const kind = String(field.kind || 'text') as OrderFieldKind
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || keys.has(key)) throw new OrderInputError('کلید هر فیلد باید یکتا و با حروف لاتین کوچک باشد (مثل username)')
    if (!label) throw new OrderInputError('عنوان فیلد را بنویسید')
    if (!ORDER_FIELD_KINDS.includes(kind)) throw new OrderInputError('نوع فیلد معتبر نیست')
    keys.add(key)
    const options = Array.isArray(field.options) ? [...new Set(field.options.map((item) => clean(item, 120)).filter(Boolean))].slice(0, 30) : []
    return { key, label, labelEn: clean(field.labelEn, 80), kind, required: field.required === true, help: clean(field.help, 200), options }
  })
}

/** Stored fields, never throwing: a damaged column asks for nothing rather than breaking the page. */
export function readOrderFields(stored: unknown): OrderField[] {
  try { return validateOrderFields(stored) } catch { return [] }
}

/** The fields asked for one option of the product ('' when the product has no options). */
export const fieldsFor = (fields: OrderField[], variantName: string) => fields.filter((field) => !field.options.length || field.options.includes(variantName))

/** The buyer's answers for the fields that apply, checked. Unknown keys are dropped, not stored. */
export function validateAnswers(fields: OrderField[], variantName: string, input: unknown): OrderAnswer[] {
  const values = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const answers: OrderAnswer[] = []
  for (const field of fieldsFor(fields, variantName)) {
    const raw = String(values[field.key] ?? '')
    if (raw.length > LIMITS[field.kind] + 50) throw new OrderInputError(`«${field.label}» بیش از حد طولانی است`)
    // A secret is kept exactly as typed (spaces inside a password matter); everything else is tidied.
    const value = field.kind === 'secret' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.secret) : clean(raw, LIMITS[field.kind])
    if (!value.trim()) {
      if (field.required) throw new OrderInputError(`«${field.label}» را وارد کنید`)
      continue
    }
    if (field.kind === 'url') {
      let url: URL | null = null
      try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`) } catch { url = null }
      if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw new OrderInputError(`«${field.label}» نشانی یک سایت نیست`)
      answers.push({ key: field.key, label: field.label, kind: field.kind, value: url.toString().slice(0, LIMITS.url) })
      continue
    }
    if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new OrderInputError(`«${field.label}» یک ایمیل معتبر نیست`)
    answers.push({ key: field.key, label: field.label, kind: field.kind, value })
  }
  return answers
}

/** Whether a line may be bought: every required field of its option has an answer. */
export function answersComplete(fields: OrderField[], variantName: string, answers: OrderAnswer[]): boolean {
  return fieldsFor(fields, variantName).filter((field) => field.required).every((field) => answers.some((answer) => answer.key === field.key && answer.value.trim()))
}

export const SECRET_MASK = '••••••••'
/** Answers as anyone but the handling staff may see them: a secret is never in the page. */
export const maskAnswers = (answers: OrderAnswer[]): OrderAnswer[] => answers.map((answer) => (answer.kind === 'secret' ? { ...answer, value: SECRET_MASK } : answer))

// ------------------------------------------------------------------ open amount

export type OpenAmountRule = { openAmount: boolean; openCurrencies: string; openMinMinor: bigint; openMaxMinor: bigint; fxCurrency?: string }

/** The currencies a buyer may type for this product (its own cost currency when none is listed). */
export function openCurrenciesOf(rule: OpenAmountRule): string[] {
  const listed = rule.openCurrencies.split(',').map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code))
  return listed.length ? [...new Set(listed)] : rule.fxCurrency ? [rule.fxCurrency.toUpperCase()] : []
}

/** The amount typed by the buyer, in minor units (cents), checked against the product's limits. */
export function parseOpenAmount(rule: OpenAmountRule, input: unknown): { amountMinor: bigint; currency: string } {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const currency = String(raw.currency || '').trim().toUpperCase()
  const allowed = openCurrenciesOf(rule)
  if (!allowed.includes(currency)) throw new OrderInputError('واحد پول انتخاب‌شده برای این خدمت مجاز نیست', 400, 'OPEN_CURRENCY')
  const text = String(raw.amount ?? '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[,،٬\s]/g, '').replace(/[٫/]/, '.')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new OrderInputError('مبلغ را به عدد وارد کنید (مثلاً 49.99)', 400, 'OPEN_AMOUNT')
  const [whole, fraction = ''] = text.split('.')
  const amountMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (amountMinor <= 0n) throw new OrderInputError('مبلغ باید بیشتر از صفر باشد', 400, 'OPEN_AMOUNT')
  const show = (minor: bigint) => `${(Number(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
  if (rule.openMinMinor > 0n && amountMinor < rule.openMinMinor) throw new OrderInputError(`حداقل مبلغ ${show(rule.openMinMinor)} است`, 400, 'OPEN_AMOUNT')
  if (rule.openMaxMinor > 0n && amountMinor > rule.openMaxMinor) throw new OrderInputError(`حداکثر مبلغ ${show(rule.openMaxMinor)} است`, 400, 'OPEN_AMOUNT')
  return { amountMinor, currency }
}
