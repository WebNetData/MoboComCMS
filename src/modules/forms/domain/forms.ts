// Form builder rules: field types, conditional logic, steps, validation and export.
// Pure functions with no imports, so the browser, the server and the tests share one definition.

export class FormsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'checkboxes', 'number', 'date', 'url', 'rating', 'file', 'heading', 'paragraph', 'time', 'slider', 'hidden', 'secret', 'mobile', 'national', 'price', 'fxamount', 'total'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FIELD_LABEL: Record<FieldType, string> = {
  text: 'متن کوتاه', email: 'ایمیل', tel: 'تلفن', textarea: 'متن بلند', select: 'لیست کشویی', checkbox: 'تأیید / رضایت', radio: 'گزینهٔ تکی', checkboxes: 'چندگزینه‌ای',
  number: 'عدد', date: 'تاریخ', url: 'نشانی وب', rating: 'امتیاز عددی', file: 'ضمیمهٔ فایل', heading: 'عنوان بخش', paragraph: 'متن توضیحی',
  time: 'ساعت', slider: 'نوار لغزنده', hidden: 'فیلد پنهان', secret: 'رمز / اطلاعات محرمانه', mobile: 'موبایل ایران', national: 'کد ملی',
  price: 'هزینهٔ ثابت', fxamount: 'مبلغ ارزی (نرخ روز)', total: 'جمع قابل پرداخت',
}
/** Types that show text only and never carry an answer. */
export const CONTENT_TYPES: FieldType[] = ['heading', 'paragraph', 'price', 'total']
/** Types that can put a line on the bill: a fixed cost, a typed foreign amount, or a choice whose options carry prices. */
export const PRICED_TYPES: FieldType[] = ['price', 'fxamount', 'select', 'radio', 'checkboxes']
export const FX_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'TRY', 'CAD'] as const
export const CHOICE_TYPES: FieldType[] = ['select', 'radio', 'checkboxes']

export type Op = 'eq' | 'neq' | 'contains' | 'filled' | 'empty'
export const OPS: Op[] = ['eq', 'neq', 'contains', 'filled', 'empty']
export const OP_LABEL: Record<Op, string> = { eq: 'برابر باشد با', neq: 'برابر نباشد با', contains: 'شامل باشد', filled: 'پر شده باشد', empty: 'خالی باشد' }
export interface Condition { field: string; op: Op; value?: string }

export interface FormField {
  id: string; label: string; type: FieldType; required: boolean; options: string[]
  placeholder?: string; help?: string; min?: number; max?: number; width?: 'full' | 'half'; step?: string
  showIf?: Condition[]; logic?: 'all' | 'any'
  /** Prices of `options`, in the same order (0 = free), in the form's currency. */
  prices?: number[]
  /** `price`: the fixed cost. `hidden`: nothing. */
  amount?: number
  /** `fxamount`: the currencies the visitor may type, and the margin added to the converted amount. Never sent to visitors. */
  currencies?: string[]; markupPercent?: number; markupFixed?: number
  /** `hidden`: the value stored with every answer. */
  value?: string
}
export interface FormStep { id: string; title: string; description: string }
export interface FormSettings {
  steps: FormStep[]
  notifyEmails: string[]; notifyInbox: boolean
  autoReply: { enabled: boolean; subject: string; body: string }
  requireLogin: boolean; oncePerUser: boolean
  opensAt: string; closesAt: string; maxSubmissions: number
  redirectUrl: string; submitLabel: string; closedMessage: string; spamLinks: number
  /** The visitor pays the form's total before staff take it up. */
  payment: { enabled: boolean; label: string }
  style: FormStyle
}
export const THEMES = ['classic', 'card', 'glass', 'minimal', 'bold'] as const
export const THEME_LABEL: Record<(typeof THEMES)[number], string> = { classic: 'کلاسیک', card: 'کارتی', glass: 'شیشه‌ای', minimal: 'مینیمال', bold: 'پررنگ' }
export interface FormStyle { theme: (typeof THEMES)[number]; accent: string; radius: 'sharp' | 'soft' | 'round'; density: 'comfortable' | 'compact'; width: 'narrow' | 'normal' | 'wide'; progress: 'steps' | 'bar' | 'dots' }
export const DEFAULT_STYLE: FormStyle = { theme: 'card', accent: '', radius: 'soft', density: 'comfortable', width: 'normal', progress: 'steps' }
const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (list.includes(value as T) ? value as T : fallback)
export function normalizeStyle(input: unknown): FormStyle {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const accent = String(raw.accent ?? '').trim()
  return {
    theme: oneOf(raw.theme, THEMES, DEFAULT_STYLE.theme), accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.toLowerCase() : '',
    radius: oneOf(raw.radius, ['sharp', 'soft', 'round'] as const, 'soft'), density: oneOf(raw.density, ['comfortable', 'compact'] as const, 'comfortable'),
    width: oneOf(raw.width, ['narrow', 'normal', 'wide'] as const, 'normal'), progress: oneOf(raw.progress, ['steps', 'bar', 'dots'] as const, 'steps'),
  }
}
export interface FormDefinition { id?: number; slug: string; title: string; description: string; fields: FormField[]; published: boolean; successText: string; settings?: FormSettings }

export type Answer = string | boolean | string[]
export const DEFAULT_SETTINGS: FormSettings = {
  steps: [], notifyEmails: [], notifyInbox: true, autoReply: { enabled: false, subject: '', body: '' }, requireLogin: false, oncePerUser: false,
  opensAt: '', closesAt: '', maxSubmissions: 0, redirectUrl: '', submitLabel: '', closedMessage: '', spamLinks: 3,
  payment: { enabled: false, label: '' }, style: DEFAULT_STYLE,
}

const RESERVED = ['__proto__', 'constructor', 'prototype', 'website']
const ID = /^[a-z][a-z0-9_]{0,50}$/
const STEP_ID = /^[a-z][a-z0-9_]{0,30}$/
export const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$/

const str = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }
const isEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** Persian and Arabic digits → Latin, for phone numbers and numeric answers. */
export const toLatinDigits = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.')

/** An address the visitor is sent to after submitting: a path of this site or an https/http address. */
export function safeRedirect(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.length > 500 || /[\s<>"'\\\u0000-\u001f]/.test(raw)) throw new FormsError('نشانی بازگشت معتبر نیست')
  if (/^\/(?!\/)/.test(raw)) return raw
  try { const url = new URL(raw); if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString() } catch { /* falls through */ }
  throw new FormsError('نشانی بازگشت باید یک مسیر سایت یا نشانی http/https باشد')
}

function normalizeConditions(input: unknown, earlier: Set<string>, label: string): Condition[] {
  if (!Array.isArray(input)) return []
  const out: Condition[] = []
  for (const item of input.slice(0, 5)) {
    const field = str((item as Condition)?.field, 51)
    const op = OPS.includes((item as Condition)?.op) ? (item as Condition).op : null
    if (!op || !earlier.has(field)) throw new FormsError(`شرط نمایش «${label}» باید به یکی از فیلدهای قبلی فرم اشاره کند`)
    const value = str((item as Condition)?.value, 150)
    if ((op === 'eq' || op === 'neq' || op === 'contains') && !value) throw new FormsError(`مقدار شرط نمایش «${label}» را وارد کنید`)
    out.push(op === 'filled' || op === 'empty' ? { field, op } : { field, op, value })
  }
  return out
}

export function normalizeSettings(input: unknown): FormSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const steps: FormStep[] = []
  for (const item of (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 8)) {
    const id = str((item as FormStep)?.id, 31)
    const title = str((item as FormStep)?.title, 80)
    if (!STEP_ID.test(id) || !title) throw new FormsError('هر مرحله عنوان و شناسهٔ معتبر می‌خواهد')
    if (steps.some((s) => s.id === id)) throw new FormsError('شناسهٔ مرحله‌ها باید یکتا باشد')
    steps.push({ id, title, description: str((item as FormStep)?.description, 300) })
  }
  const emails = [...new Set((Array.isArray(raw.notifyEmails) ? raw.notifyEmails : String(raw.notifyEmails ?? '').split(/[\s,،;]+/)).map((e) => str(e, 254).toLowerCase()).filter(Boolean))].slice(0, 5)
  if (emails.some((email) => !isEmail(email))) throw new FormsError('ایمیل اعلان معتبر نیست')
  const reply = (raw.autoReply && typeof raw.autoReply === 'object' ? raw.autoReply : {}) as Record<string, unknown>
  const date = (value: unknown, label: string) => {
    const text = str(value, 40)
    if (!text) return ''
    const d = new Date(text)
    if (Number.isNaN(d.getTime())) throw new FormsError(`${label} معتبر نیست`)
    return d.toISOString()
  }
  const opensAt = date(raw.opensAt, 'زمان شروع'), closesAt = date(raw.closesAt, 'زمان پایان')
  if (opensAt && closesAt && closesAt <= opensAt) throw new FormsError('پایان باید بعد از شروع باشد')
  const payment = (raw.payment && typeof raw.payment === 'object' ? raw.payment : {}) as Record<string, unknown>
  const paid = payment.enabled === true
  return {
    payment: { enabled: paid, label: str(payment.label, 40) }, style: normalizeStyle(raw.style),
    steps, notifyEmails: emails, notifyInbox: raw.notifyInbox !== false,
    autoReply: { enabled: reply.enabled === true, subject: str(reply.subject, 150), body: String(reply.body ?? '').slice(0, 3000) },
    requireLogin: raw.requireLogin === true || paid, oncePerUser: raw.oncePerUser === true, opensAt, closesAt,
    maxSubmissions: int(raw.maxSubmissions, 0, 10_000_000, 0), redirectUrl: safeRedirect(raw.redirectUrl), submitLabel: str(raw.submitLabel, 40),
    closedMessage: str(raw.closedMessage, 300), spamLinks: int(raw.spamLinks, 0, 20, 3),
  }
}

/** Builder input → a clean, safe definition. Throws FormsError with a message for the person building the form. */
export function normalizeForm(input: unknown): FormDefinition {
  if (!input || typeof input !== 'object') throw new FormsError('اطلاعات فرم معتبر نیست')
  const raw = input as Record<string, unknown>
  const slug = str(raw.slug, 80)
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(slug)) throw new FormsError('نشانی فرم باید انگلیسی کوچک باشد (حرف، عدد و خط تیره)')
  const title = str(raw.title, 150)
  if (!title) throw new FormsError('عنوان فرم را وارد کنید')
  const successText = str(raw.successText, 1000)
  if (!successText) throw new FormsError('پیام بعد از ارسال را وارد کنید')
  if (typeof raw.published !== 'boolean') throw new FormsError('وضعیت انتشار معتبر نیست')
  if (!Array.isArray(raw.fields) || !raw.fields.length) throw new FormsError('حداقل یک فیلد لازم است')
  if (raw.fields.length > 60) throw new FormsError('یک فرم حداکثر ۶۰ فیلد دارد')
  const settings = normalizeSettings(raw.settings)
  const stepIds = new Set(settings.steps.map((s) => s.id))
  const seen = new Set<string>()
  const fields: FormField[] = []
  for (const item of raw.fields) {
    const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const id = str(f.id, 51)
    if (!ID.test(id) || RESERVED.includes(id)) throw new FormsError(`شناسهٔ فیلد «${id || '؟'}» معتبر نیست`)
    if (seen.has(id)) throw new FormsError('شناسهٔ فیلدها باید یکتا باشد')
    const type = FIELD_TYPES.includes(f.type as FieldType) ? f.type as FieldType : null
    if (!type) throw new FormsError('نوع فیلد معتبر نیست')
    const content = CONTENT_TYPES.includes(type)
    const label = str(f.label, 200)
    if (!label) throw new FormsError('هر فیلد عنوان می‌خواهد')
    const options = CHOICE_TYPES.includes(type) ? (Array.isArray(f.options) ? f.options : []).map((o) => str(o, 150)).filter(Boolean) : []
    if (CHOICE_TYPES.includes(type) && !options.length) throw new FormsError(`فیلد «${label}» گزینه‌ای ندارد`)
    if (options.length > 60 || new Set(options).size !== options.length) throw new FormsError(`گزینه‌های «${label}» باید یکتا و حداکثر ۶۰ عدد باشد`)
    const out: FormField = { id, label, type, required: !content && f.required === true, options }
    if (f.placeholder) out.placeholder = str(f.placeholder, 120)
    if (f.help) out.help = str(f.help, type === 'paragraph' ? 1000 : 300)
    if (type === 'paragraph' && !out.help) throw new FormsError('متن توضیحی را بنویسید')
    if (['text', 'textarea', 'number', 'checkboxes', 'rating', 'file'].includes(type)) {
      if (f.min !== undefined && f.min !== '' && f.min !== null) out.min = int(f.min, 0, 1_000_000_000, 0)
      if (f.max !== undefined && f.max !== '' && f.max !== null) out.max = int(f.max, 0, 1_000_000_000, 0)
      if (out.min !== undefined && out.max !== undefined && out.max && out.min > out.max) throw new FormsError(`کمینه و بیشینهٔ «${label}» درست نیست`)
    }
    if (CHOICE_TYPES.includes(type) && Array.isArray(f.prices) && f.prices.some((price) => Number(price) > 0)) out.prices = options.map((_, index) => int((f.prices as unknown[])[index], 0, 100_000_000_000, 0))
    if (type === 'price') { out.amount = int(f.amount, 0, 100_000_000_000, 0); if (!out.amount) throw new FormsError(`مبلغ «${label}» را وارد کنید`) }
    if (type === 'hidden') out.value = str(f.value, 300)
    if (type === 'slider') {
      out.min = int(f.min, -1_000_000_000, 1_000_000_000, 0); out.max = int(f.max, -1_000_000_000, 1_000_000_000, 100)
      if (out.max <= out.min) throw new FormsError(`کمینه و بیشینهٔ «${label}» درست نیست`)
    }
    if (type === 'fxamount') {
      const codes = [...new Set((Array.isArray(f.currencies) ? f.currencies : []).map((code) => String(code).toUpperCase()))].filter((code) => (FX_CURRENCIES as readonly string[]).includes(code))
      out.currencies = codes.length ? codes : ['USD']
      const percent = Number(f.markupPercent)
      out.markupPercent = Number.isFinite(percent) && percent > 0 ? Math.min(500, Math.round(percent * 100) / 100) : 0
      out.markupFixed = int(f.markupFixed, 0, 100_000_000_000, 0)
      if (f.min !== undefined && f.min !== '' && f.min !== null) out.min = int(f.min, 0, 9_999_999, 0)
      if (f.max !== undefined && f.max !== '' && f.max !== null) out.max = int(f.max, 0, 9_999_999, 0)
      if (out.min !== undefined && out.max && out.min > out.max) throw new FormsError(`کمینه و بیشینهٔ «${label}» درست نیست`)
    }
    if (f.width === 'half') out.width = 'half'
    const step = str(f.step, 31)
    if (settings.steps.length) out.step = stepIds.has(step) ? step : settings.steps[0].id
    const showIf = normalizeConditions(f.showIf, seen, label)
    if (showIf.length) { out.showIf = showIf; out.logic = f.logic === 'any' ? 'any' : 'all' }
    seen.add(id)
    fields.push(out)
  }
  if (!fields.some((f) => !CONTENT_TYPES.includes(f.type))) throw new FormsError('حداقل یک فیلد پاسخ‌دار لازم است')
  if (settings.payment.enabled && !fields.some((f) => f.type === 'price' || f.type === 'fxamount' || f.prices?.some((price) => price > 0))) throw new FormsError('فرمِ دارای پرداخت دست‌کم یک فیلد قیمت‌دار می‌خواهد (هزینهٔ ثابت، مبلغ ارزی یا گزینهٔ قیمت‌دار)')
  // Steps go in order: a field never sits in an earlier step than the one before it.
  let last = 0
  for (const f of fields) {
    const at = f.step ? settings.steps.findIndex((s) => s.id === f.step) : 0
    if (at < last) throw new FormsError('فیلدها باید به ترتیب مرحله‌ها چیده شوند')
    last = at
  }
  const out: FormDefinition = { slug, title, description: str(raw.description, 2000), fields, published: raw.published, successText, settings }
  if (raw.id !== undefined && raw.id !== null) { const id = Number(raw.id); if (!Number.isSafeInteger(id) || id <= 0) throw new FormsError('شناسه نامعتبر'); out.id = id }
  return out
}

/** Legacy boolean check kept for callers that only need a yes/no. */
export function validForm(input: unknown): input is FormDefinition {
  try { normalizeForm(input); return true } catch { return false }
}

// ------------------------------------------------------------------ logic

const asText = (value: Answer | undefined) => (Array.isArray(value) ? value.join('\n') : typeof value === 'boolean' ? String(value) : String(value ?? ''))
const filled = (value: Answer | undefined) => (Array.isArray(value) ? value.length > 0 : typeof value === 'boolean' ? value : String(value ?? '').trim() !== '')

export function conditionHolds(condition: Condition, values: Record<string, Answer | undefined>): boolean {
  const value = values[condition.field]
  switch (condition.op) {
    case 'filled': return filled(value)
    case 'empty': return !filled(value)
    case 'eq': return Array.isArray(value) ? value.length === 1 && value[0] === condition.value : asText(value) === condition.value
    case 'neq': return Array.isArray(value) ? !(value.length === 1 && value[0] === condition.value) : asText(value) !== condition.value
    case 'contains': return Array.isArray(value) ? value.includes(condition.value || '') : asText(value).includes(condition.value || '')
  }
}

/** The fields a visitor currently sees: a field with conditions shows only while they hold (answers of hidden fields count as empty). */
export function visibleFields(fields: FormField[], answers: Record<string, Answer | undefined>): FormField[] {
  const shown: FormField[] = []
  const effective: Record<string, Answer | undefined> = {}
  for (const f of fields) {
    const conditions = f.showIf || []
    const visible = !conditions.length || (f.logic === 'any' ? conditions.some((c) => conditionHolds(c, effective)) : conditions.every((c) => conditionHolds(c, effective)))
    if (!visible) continue
    shown.push(f)
    effective[f.id] = answers[f.id]
  }
  return shown
}

// ------------------------------------------------------------------ answers

export interface Checked { values: Record<string, Answer>; errors: Record<string, string> }

/** Checks one answer; returns [cleanValue, error]. */
function checkOne(f: FormField, input: unknown): [Answer, string] {
  const label = f.label
  if (f.type === 'checkbox') {
    if (input !== undefined && typeof input !== 'boolean') return [false, `مقدار ${label} معتبر نیست`]
    return [input === true, f.required && input !== true ? `${label} الزامی است` : '']
  }
  if (f.type === 'checkboxes' || f.type === 'file') {
    if (input !== undefined && !Array.isArray(input)) return [[], `مقدار ${label} معتبر نیست`]
    const list = (input as unknown[] | undefined) ?? []
    if (list.some((item) => typeof item !== 'string')) return [[], `مقدار ${label} معتبر نیست`]
    const items = [...new Set(list as string[])]
    const cap = f.type === 'file' ? Math.min(f.max || 1, 5) : f.max || f.options.length
    if (f.type === 'checkboxes' && items.some((item) => !f.options.includes(item))) return [[], 'گزینه انتخاب‌شده معتبر نیست']
    if (f.type === 'file' && items.some((item) => !UPLOAD_ID.test(item))) return [[], `فایل ${label} معتبر نیست`]
    if (f.required && !items.length) return [[], `${label} الزامی است`]
    if (items.length > cap) return [[], `${label}: حداکثر ${cap.toLocaleString('fa-IR')} مورد`]
    if (f.type === 'checkboxes' && f.min && items.length && items.length < f.min) return [[], `${label}: دست‌کم ${f.min.toLocaleString('fa-IR')} گزینه انتخاب کنید`]
    return [items, '']
  }
  if (f.type === 'hidden') return [f.value || '', '']
  if (input !== undefined && typeof input !== 'string' && typeof input !== 'number') return ['', `مقدار ${label} معتبر نیست`]
  // A password is kept exactly as typed.
  let value = f.type === 'secret' ? String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, '') : String(input ?? '').trim()
  if (f.type === 'secret') return !value.trim() ? ['', f.required ? `${label} الزامی است` : ''] : value.length > 300 ? ['', `${label} بیش از حد طولانی است`] : [value, '']
  if (f.required && !value) return ['', `${label} الزامی است`]
  if (!value) return ['', '']
  if (value.length > (f.type === 'textarea' ? 5000 : 500)) return ['', `${label} بیش از حد طولانی است`]
  switch (f.type) {
    case 'email':
      if (!isEmail(value)) return ['', 'ایمیل معتبر وارد کنید']
      return [value.toLowerCase(), '']
    case 'tel': {
      value = toLatinDigits(value).replace(/[\s()-]/g, '')
      if (!/^\+?\d{5,18}$/.test(value)) return ['', `شمارهٔ ${label} معتبر نیست`]
      return [value, '']
    }
    case 'url': {
      try { const url = new URL(value); if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol'); return [url.toString(), ''] } catch { return ['', `نشانی ${label} معتبر نیست`] }
    }
    case 'number': {
      const text = toLatinDigits(value).replace(/[,٬\s]/g, '')
      const n = Number(text)
      if (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(n)) return ['', `${label} باید عدد باشد`]
      if (f.min !== undefined && n < f.min) return ['', `${label} باید حداقل ${f.min.toLocaleString('fa-IR')} باشد`]
      if (f.max && n > f.max) return ['', `${label} باید حداکثر ${f.max.toLocaleString('fa-IR')} باشد`]
      return [String(n), '']
    }
    case 'date': {
      const text = toLatinDigits(value)
      const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null
      if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return ['', `تاریخ ${label} معتبر نیست`]
      return [text, '']
    }
    case 'rating': {
      const n = Number(toLatinDigits(value))
      const top = Math.min(f.max || 5, 10)
      if (!Number.isInteger(n) || n < 1 || n > top) return ['', `امتیاز ${label} معتبر نیست`]
      return [String(n), '']
    }
    case 'time': {
      const text = toLatinDigits(value)
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? [text, ''] : ['', `ساعت ${label} معتبر نیست`]
    }
    case 'slider': {
      const n = Number(toLatinDigits(value))
      return Number.isInteger(n) && n >= (f.min ?? 0) && n <= (f.max ?? 100) ? [String(n), ''] : ['', `مقدار ${label} معتبر نیست`]
    }
    case 'mobile': {
      const digits = toLatinDigits(value).replace(/[\s()-]/g, '').replace(/^(\+98|0098|98)/, '0')
      return /^09\d{9}$/.test(digits) ? [digits, ''] : ['', 'شمارهٔ موبایل را به شکل 09xxxxxxxxx وارد کنید']
    }
    case 'national':
      return validNationalId(toLatinDigits(value)) ? [toLatinDigits(value), ''] : ['', 'کد ملی معتبر نیست']
    case 'fxamount': {
      const typed = parseFxAnswer(value)
      if (!typed || !(f.currencies || ['USD']).includes(typed.currency)) return ['', `مبلغ ${label} را به عدد و با واحد پول مجاز وارد کنید`]
      if (typed.cents <= 0) return ['', `مبلغ ${label} باید بیشتر از صفر باشد`]
      if (f.min !== undefined && typed.cents < f.min * 100) return ['', `${label}: حداقل ${f.min.toLocaleString('en-US')} ${typed.currency}`]
      if (f.max && typed.cents > f.max * 100) return ['', `${label}: حداکثر ${f.max.toLocaleString('en-US')} ${typed.currency}`]
      return [`${(typed.cents / 100).toFixed(2)} ${typed.currency}`, '']
    }
    case 'select': case 'radio':
      return f.options.includes(value) ? [value, ''] : ['', 'گزینه انتخاب‌شده معتبر نیست']
    default: {
      if (f.min && value.length < f.min) return ['', `${label}: دست‌کم ${f.min.toLocaleString('fa-IR')} نویسه بنویسید`]
      if (f.max && value.length > f.max) return ['', `${label}: حداکثر ${f.max.toLocaleString('fa-IR')} نویسه`]
      return [value, '']
    }
  }
}

/** Validates a submission against a form. Fields hidden by their conditions are neither required nor kept. */
export function checkSubmission(fields: FormField[], input: unknown): Checked {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FormsError('اطلاعات فرم معتبر نیست')
  const raw = input as Record<string, unknown>
  const values: Record<string, Answer> = Object.create(null)
  const errors: Record<string, string> = Object.create(null)
  const cleaned: Record<string, Answer | undefined> = {}
  // Conditions are decided from what the visitor sent, cleaned, field by field in order.
  for (const f of fields) {
    if (CONTENT_TYPES.includes(f.type)) continue
    const conditions = f.showIf || []
    if (conditions.length) {
      const holds = f.logic === 'any' ? conditions.some((c) => conditionHolds(c, cleaned)) : conditions.every((c) => conditionHolds(c, cleaned))
      if (!holds) continue
    }
    const [value, error] = checkOne(f, raw[f.id])
    if (error) errors[f.id] = error
    else { values[f.id] = value; cleaned[f.id] = value }
  }
  return { values, errors }
}

/** Legacy entry point: throws the first problem, returns the clean answers. */
export function validateSubmission(fields: FormField[], input: unknown): Record<string, Answer> {
  const { values, errors } = checkSubmission(fields, input)
  const first = fields.find((f) => errors[f.id])
  if (first) throw new Error(errors[first.id])
  return values
}

/** Iranian national id: ten digits with the official check digit. */
export function validNationalId(code: string): boolean {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false
  const sum = [...code.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11
  const check = Number(code[9])
  return sum < 2 ? check === sum : check === 11 - sum
}

/** "49.99 USD" (the stored answer of a foreign-amount field) → cents and currency. */
export function parseFxAnswer(value: unknown): { cents: number; currency: string } | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?\s*([A-Za-z]{3})$/.exec(toLatinDigits(String(value ?? '')).replace(/[,٬\s]+/g, ' ').trim().replace(/ (?=\d)/g, ''))
  return match ? { cents: Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')), currency: match[3].toUpperCase() } : null
}

// ------------------------------------------------------------------ the bill

export interface PriceLine { id: string; label: string; detail: string; amount: number }
export type FxQuoter = (field: FormField, cents: number, currency: string) => { amount: number; rate: number } | null

/**
 * What the visible answers cost: one line per fixed cost, per chosen priced option and per typed foreign amount.
 * `fx` converts a foreign amount with today's rate and the field's margin; the server passes the real one.
 */
export function priceLines(fields: FormField[], values: Record<string, Answer | undefined>, fx: FxQuoter): { lines: PriceLine[]; total: number } {
  const lines: PriceLine[] = []
  for (const f of visibleFields(fields, values)) {
    if (f.type === 'price' && f.amount) lines.push({ id: f.id, label: f.label, detail: '', amount: f.amount })
    else if (f.type === 'fxamount') {
      const typed = parseFxAnswer(values[f.id])
      if (!typed) continue
      const quote = fx(f, typed.cents, typed.currency)
      if (!quote) throw new FormsError('نرخ این ارز در دسترس نیست؛ کمی بعد دوباره تلاش کنید', 409)
      lines.push({ id: f.id, label: f.label, detail: `${(typed.cents / 100).toFixed(2)} ${typed.currency} · نرخ ${Math.round(quote.rate).toLocaleString('fa-IR')}`, amount: quote.amount })
    } else if (f.prices?.length) {
      const chosen = Array.isArray(values[f.id]) ? values[f.id] as string[] : values[f.id] ? [String(values[f.id])] : []
      for (const option of chosen) { const price = f.prices[f.options.indexOf(option)] || 0; if (price > 0) lines.push({ id: `${f.id}:${f.options.indexOf(option)}`, label: f.label, detail: option, amount: price }) }
    }
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) }
}

const LINK = /https?:\/\/|www\.|<a\s|\[url/gi
/** Comment-spam heuristic: too many links in the free-text answers. */
export function looksSpam(values: Record<string, Answer>, maxLinks: number): boolean {
  if (!maxLinks) return false
  let count = 0
  for (const value of Object.values(values)) if (typeof value === 'string') count += (value.match(LINK) || []).length
  return count >= maxLinks
}

// ------------------------------------------------------------------ schedule & public view

export type FormState = 'open' | 'soon' | 'closed' | 'full'
export function formState(settings: Pick<FormSettings, 'opensAt' | 'closesAt' | 'maxSubmissions'>, count: number, now = new Date()): FormState {
  if (settings.opensAt && new Date(settings.opensAt) > now) return 'soon'
  if (settings.closesAt && new Date(settings.closesAt) <= now) return 'closed'
  if (settings.maxSubmissions && count >= settings.maxSubmissions) return 'full'
  return 'open'
}

/** What visitors may see: never the notification addresses, auto-reply text or spam rules. */
export function publicForm(form: FormDefinition): FormDefinition {
  const s = form.settings || DEFAULT_SETTINGS
  // The margin of a foreign amount and the stored value of a hidden field are the site's business.
  const fields = form.fields.map(({ markupPercent: _percent, markupFixed: _fixed, value: _value, ...field }) => field)
  return { ...form, fields, settings: { ...DEFAULT_SETTINGS, steps: s.steps, requireLogin: s.requireLogin, redirectUrl: s.redirectUrl, submitLabel: s.submitLabel, closedMessage: s.closedMessage, opensAt: s.opensAt, closesAt: s.closesAt, payment: s.payment, style: s.style } }
}

/** A stored row (JSON columns as text) → definition. Damaged JSON reads as empty rather than crashing pages. */
export function parseForm(row: { id: number; slug: string; title: string; description: string; fields: string; published: boolean; successText: string; settings?: string }): FormDefinition {
  const json = (text: string | undefined, fallback: unknown) => { try { return JSON.parse(text || '') } catch { return fallback } }
  let settings = DEFAULT_SETTINGS
  try { settings = normalizeSettings(json(row.settings, {})) } catch { /* stored settings predate a rule: use defaults */ }
  const fields = json(row.fields, []) as FormField[]
  return { id: row.id, slug: row.slug, title: row.title, description: row.description, fields: Array.isArray(fields) ? fields.map((f) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })) : [], published: row.published, successText: row.successText, settings }
}

// ------------------------------------------------------------------ stored answers, export

export interface StoredAnswer { id: string; label: string; type?: FieldType; value: Answer }
export const STATUSES = ['NEW', 'READ', 'STARRED', 'ARCHIVED', 'SPAM'] as const
export type SubmissionStatus = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<SubmissionStatus, string> = { NEW: 'جدید', READ: 'خوانده‌شده', STARRED: 'ستاره‌دار', ARCHIVED: 'بایگانی', SPAM: 'هرزنامه' }
/** Where the work on an answer stands (separate from the inbox triage above). */
export const STAGES = ['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const
export type Stage = (typeof STAGES)[number]
export const STAGE_LABEL: Record<Stage, string> = { OPEN: 'در انتظار کارشناس', IN_PROGRESS: 'در حال انجام', DONE: 'انجام شد', REJECTED: 'رد شد' }
export const SECRET_MASK = '••••••••'

/** One answer as readable text (lists joined, yes/no for consent boxes). */
export function answerText(value: Answer | undefined): string {
  if (Array.isArray(value)) return value.join('، ')
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر'
  return String(value ?? '')
}

// Spreadsheet programs run cells that start with these characters as formulas.
const csvCell = (value: string) => { const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe }

/** Answers as CSV (UTF-8 with a BOM so Excel reads Persian text correctly). */
export function toCsv(columns: { id: string; label: string }[], rows: { id: number; createdAt: string; status: string; user: string; answers: StoredAnswer[] }[]): string {
  const head = ['#', 'زمان ثبت', 'وضعیت', 'کاربر', ...columns.map((c) => c.label)]
  const lines = [head.map(csvCell).join(',')]
  for (const row of rows) {
    const byId = new Map(row.answers.map((a) => [a.id, a]))
    lines.push([String(row.id), row.createdAt, row.status, row.user, ...columns.map((c) => answerText(byId.get(c.id)?.value))].map(csvCell).join(','))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

// ------------------------------------------------------------------ ready-made forms

const field = (id: string, label: string, type: FieldType, extra: Partial<FormField> = {}): FormField => ({ id, label, type, required: false, options: [], ...extra })

export const TEMPLATES: { id: string; name: string; description: string; build: () => Omit<FormDefinition, 'id'> }[] = [
  {
    id: 'contact', name: 'تماس با ما', description: 'نام، ایمیل، موضوع و پیام؛ اعلان به ایمیل مدیر.',
    build: () => ({ slug: 'contact', title: 'تماس با ما', description: 'پیام خود را بنویسید؛ در اولین فرصت پاسخ می‌دهیم.', published: false, successText: 'پیام شما ثبت شد. به‌زودی پاسخ می‌دهیم.', settings: { ...DEFAULT_SETTINGS }, fields: [
      field('name', 'نام و نام خانوادگی', 'text', { required: true, width: 'half' }), field('email', 'ایمیل', 'email', { required: true, width: 'half' }),
      field('topic', 'موضوع', 'select', { required: true, options: ['پشتیبانی', 'فروش', 'همکاری', 'سایر'] }), field('message', 'پیام شما', 'textarea', { required: true, min: 10 }),
    ] }),
  },
  {
    id: 'survey', name: 'نظرسنجی رضایت', description: 'امتیاز عددی و پرسش شرطی: اگر امتیاز پایین بود دلیلش را می‌پرسد.',
    build: () => ({ slug: 'satisfaction', title: 'نظرسنجی رضایت', description: 'نظر شما به ما کمک می‌کند بهتر شویم.', published: false, successText: 'ممنون از وقتی که گذاشتید.', settings: { ...DEFAULT_SETTINGS }, fields: [
      field('rating', 'چقدر راضی بودید؟', 'rating', { required: true }),
      field('reason', 'چه چیزی باید بهتر شود؟', 'textarea', { showIf: [{ field: 'rating', op: 'neq', value: '5' }, { field: 'rating', op: 'neq', value: '4' }], logic: 'all' }),
      field('features', 'کدام بخش‌ها را استفاده می‌کنید؟', 'checkboxes', { options: ['فروشگاه', 'مجله', 'تالار گفتمان', 'دانلود نرم‌افزار', 'موزیک'] }),
      field('recommend', 'به دوستانتان پیشنهاد می‌دهید؟', 'radio', { options: ['حتماً', 'شاید', 'خیر'] }),
    ] }),
  },
  {
    id: 'job', name: 'درخواست همکاری', description: 'فرم سه‌مرحله‌ای با بارگذاری رزومه.',
    build: () => ({ slug: 'careers', title: 'درخواست همکاری', description: 'اطلاعات خود را تکمیل کنید.', published: false, successText: 'درخواست شما ثبت شد؛ در صورت تناسب تماس می‌گیریم.', settings: { ...DEFAULT_SETTINGS, submitLabel: 'ارسال درخواست', steps: [{ id: 'about', title: 'اطلاعات شما', description: '' }, { id: 'work', title: 'سوابق', description: '' }, { id: 'files', title: 'رزومه', description: '' }] }, fields: [
      field('name', 'نام و نام خانوادگی', 'text', { required: true, step: 'about', width: 'half' }), field('mobile', 'شمارهٔ موبایل', 'tel', { required: true, step: 'about', width: 'half' }),
      field('email', 'ایمیل', 'email', { required: true, step: 'about' }),
      field('role', 'موقعیت مورد نظر', 'select', { required: true, step: 'work', options: ['توسعه‌دهنده', 'طراح', 'پشتیبانی', 'محتوا', 'سایر'] }),
      field('other_role', 'کدام موقعیت؟', 'text', { step: 'work', showIf: [{ field: 'role', op: 'eq', value: 'سایر' }] }),
      field('years', 'سال‌های سابقه', 'number', { step: 'work', min: 0, max: 60, width: 'half' }), field('portfolio', 'نمونه‌کار (نشانی وب)', 'url', { step: 'work', width: 'half' }),
      field('about', 'دربارهٔ خودتان', 'textarea', { step: 'work' }),
      field('resume', 'رزومه (PDF یا تصویر)', 'file', { required: true, step: 'files', max: 1, help: 'حداکثر ۵ مگابایت' }),
      field('consent', 'با ذخیرهٔ اطلاعاتم برای بررسی درخواست موافقم', 'checkbox', { required: true, step: 'files' }),
    ] }),
  },
  {
    id: 'foreign-payment', name: 'پرداخت سایت خارجی', description: 'کاربر مبلغ دلار یا یورو را وارد می‌کند، هزینه به تومان محاسبه می‌شود، اطلاعات حساب را می‌دهد و پرداخت می‌کند.',
    build: () => ({ slug: 'foreign-payment', title: 'پرداخت سایت خارجی با ویزا کارت', description: 'مبلغ و اطلاعات سایت را وارد کنید؛ پس از پرداخت، کارشناس ما پرداخت شما را انجام می‌دهد.', published: false, successText: 'سفارش شما ثبت شد.', settings: { ...DEFAULT_SETTINGS, requireLogin: true, payment: { enabled: true, label: 'پرداخت و ثبت سفارش' }, submitLabel: 'تأیید و ادامه', steps: [{ id: 'amount', title: 'مبلغ', description: '' }, { id: 'account', title: 'اطلاعات حساب', description: '' }] }, fields: [
      field('amount', 'مبلغی که باید پرداخت شود', 'fxamount', { required: true, step: 'amount', currencies: ['USD', 'EUR'], markupPercent: 5, markupFixed: 150000, min: 5, max: 2000 }),
      field('total', 'هزینهٔ سفارش شما', 'total', { step: 'amount' }),
      field('site', 'نشانی سایت', 'url', { required: true, step: 'account' }), field('username', 'نام کاربری یا ایمیل حساب', 'text', { required: true, step: 'account', width: 'half' }),
      field('password', 'رمز عبور حساب', 'secret', { required: true, step: 'account', width: 'half' }), field('mobile', 'موبایل برای هماهنگی', 'mobile', { required: true, step: 'account' }),
      field('details', 'توضیحات و اطلاعات حساب', 'textarea', { step: 'account' }),
    ] }),
  },
  {
    id: 'appointment', name: 'دریافت نوبت', description: 'روز و ساعت دلخواه، نوع خدمت و اطلاعات تماس.',
    build: () => ({ slug: 'appointment', title: 'دریافت نوبت', description: 'زمان دلخواهتان را بگویید؛ برای تأیید تماس می‌گیریم.', published: false, successText: 'درخواست نوبت ثبت شد؛ برای تأیید تماس می‌گیریم.', settings: { ...DEFAULT_SETTINGS }, fields: [
      field('name', 'نام و نام خانوادگی', 'text', { required: true, width: 'half' }), field('mobile', 'موبایل', 'mobile', { required: true, width: 'half' }),
      field('service', 'نوع خدمت', 'select', { required: true, options: ['مشاوره', 'مصاحبه', 'پشتیبانی حضوری'] }),
      field('day', 'روز', 'date', { required: true, width: 'half' }), field('hour', 'ساعت', 'time', { required: true, width: 'half' }),
      field('note', 'توضیحات', 'textarea'),
    ] }),
  },
  {
    id: 'quote', name: 'درخواست قیمت', description: 'نوع خدمت، بودجه و زمان‌بندی با بخش‌های شرطی.',
    build: () => ({ slug: 'quote', title: 'درخواست قیمت', description: 'نیازتان را بنویسید تا پیشنهاد بفرستیم.', published: false, successText: 'درخواست ثبت شد؛ ظرف یک روز کاری تماس می‌گیریم.', settings: { ...DEFAULT_SETTINGS }, fields: [
      field('name', 'نام', 'text', { required: true, width: 'half' }), field('mobile', 'موبایل', 'tel', { required: true, width: 'half' }),
      field('service', 'نوع درخواست', 'radio', { required: true, options: ['طراحی سایت', 'فروشگاه‌ساز', 'سئو و محتوا', 'سایر'] }),
      field('shop_size', 'تعداد تقریبی محصولات', 'number', { min: 1, showIf: [{ field: 'service', op: 'eq', value: 'فروشگاه‌ساز' }] }),
      field('budget', 'بودجه (تومان)', 'number', { min: 0 }), field('deadline', 'موعد مورد نظر', 'date', { width: 'half' }),
      field('details', 'توضیحات', 'textarea'),
    ] }),
  },
]
