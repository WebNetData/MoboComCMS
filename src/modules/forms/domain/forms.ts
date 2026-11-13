// Form builder rules: field types, conditional logic, steps, validation and export.
// Pure functions with no imports, so the browser, the server and the tests share one definition.

export class FormsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'checkboxes', 'number', 'date', 'url', 'rating', 'file', 'heading', 'paragraph', 'time', 'slider', 'hidden', 'secret', 'mobile', 'national', 'price', 'fxamount', 'total', 'jdate', 'slot', 'repeater', 'signature', 'devicelock'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FIELD_LABEL: Record<FieldType, string> = {
  text: 'متن کوتاه', email: 'ایمیل', tel: 'تلفن', textarea: 'متن بلند', select: 'لیست کشویی', checkbox: 'تأیید / رضایت', radio: 'گزینهٔ تکی', checkboxes: 'چندگزینه‌ای',
  number: 'عدد', date: 'تاریخ', url: 'نشانی وب', rating: 'امتیاز عددی', file: 'ضمیمهٔ فایل', heading: 'عنوان بخش', paragraph: 'متن توضیحی',
  time: 'ساعت', slider: 'نوار لغزنده', hidden: 'فیلد پنهان', secret: 'رمز / اطلاعات محرمانه', mobile: 'موبایل ایران', national: 'کد ملی',
  price: 'هزینهٔ ثابت', fxamount: 'مبلغ ارزی (نرخ روز)', total: 'جمع قابل پرداخت',
  jdate: 'تاریخ شمسی', slot: 'نوبت (روز و ساعت با ظرفیت)', repeater: 'ردیف‌های تکرارشونده', signature: 'امضا', devicelock: 'قفل دستگاه (الگو، پین یا رمز)',
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
  placeholder?: string; help?: string; min?: number; max?: number; width?: FieldWidth; step?: string
  /** `repeater`: the titles of the columns of each row. */
  columns?: string[]
  /** `slot`: which week days are open, between which hours, how long a turn is, how many people fit in one, and how far ahead. */
  slot?: SlotRule
  /** Points of `options`, in the same order (a quiz). Never sent to visitors. */
  scores?: number[]
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
export const WIDTHS = ['full', 'twothirds', 'half', 'third', 'quarter'] as const
export type FieldWidth = (typeof WIDTHS)[number]
export const WIDTH_LABEL: Record<FieldWidth, string> = { full: 'تمام‌عرض', twothirds: 'دو‌سوم', half: 'نیم‌عرض', third: 'یک‌سوم', quarter: 'یک‌چهارم' }
/** Week days as JavaScript counts them (0 = Sunday … 6 = Saturday). */
export interface SlotRule { days: number[]; from: string; to: string; minutes: number; capacity: number; horizon: number }
export const DEFAULT_SLOT: SlotRule = { days: [6, 0, 1, 2, 3], from: '09:00', to: '17:00', minutes: 30, capacity: 1, horizon: 30 }
export interface FormNotification { name: string; to: string; subject: string; body: string; when: Condition[]; logic: 'all' | 'any' }
export interface FormConfirmation { message: string; redirectUrl: string; when: Condition[]; logic: 'all' | 'any' }
export const WEBHOOK_EVENTS = ['submitted', 'paid', 'stage'] as const
export interface FormWebhook { url: string; secret: string; events: (typeof WEBHOOK_EVENTS)[number][] }
export interface FormStep { id: string; title: string; description: string }
export interface FormSettings {
  steps: FormStep[]
  notifyEmails: string[]; notifyInbox: boolean
  autoReply: { enabled: boolean; subject: string; body: string }
  requireLogin: boolean; oncePerUser: boolean
  opensAt: string; closesAt: string; maxSubmissions: number
  redirectUrl: string; submitLabel: string; closedMessage: string; spamLinks: number
  /** The visitor pays the form's total before staff take it up. */
  payment: { enabled: boolean; label: string; invoiceTitle: string; invoiceText: string }
  style: FormStyle
  /** Extra messages to staff or the sender, each sent only while its conditions hold; texts take merge tags. */
  notifications: FormNotification[]
  /** What the sender sees after sending: the first whose conditions hold, else the form's own message. */
  confirmations: FormConfirmation[]
  webhooks: FormWebhook[]
  /** The browser keeps what was typed so the visitor can come back to it (never passwords or files). */
  saveDraft: boolean
  quiz: { enabled: boolean; passScore: number; showResult: boolean }
  /** Members of staff who may work on this form's answers (empty = everyone with forms.handle). */
  handlers: number[]
  /** This form is a service the site sells or performs (it is listed under Services in the admin). */
  service: boolean
  /** The form's own work steps, each with what the sender is told (empty = the four standard stages). */
  workflow: WorkStep[]
  /** Printed receipts: the shop's copy (everything) and the customer's (chosen fields, terms, stamp and signature). */
  receipt: ReceiptSettings
}
// The last four are designed looks (owner, 2026-10-28): a colour panel beside the fields, a colour heading band,
// always dark, and a spacious one with a gold rule.
export const THEMES = ['classic', 'card', 'glass', 'minimal', 'bold', 'split', 'aurora', 'night', 'elegant', 'neon', 'soft', 'prism', 'studio'] as const
export const THEME_LABEL: Record<(typeof THEMES)[number], string> = { classic: 'کلاسیک', card: 'کارتی', glass: 'شیشه‌ای', minimal: 'مینیمال', bold: 'پررنگ', split: 'دوستونه', aurora: 'شفق', night: 'شب', elegant: 'لوکس', neon: 'نئون', soft: 'نرم', prism: 'طیف', studio: 'استودیو' }
export interface FormStyle { layout: 'classic' | 'conversational'; theme: (typeof THEMES)[number]; accent: string; radius: 'sharp' | 'soft' | 'round'; density: 'comfortable' | 'compact'; width: 'narrow' | 'normal' | 'wide'; progress: 'steps' | 'bar' | 'dots' }
export const DEFAULT_STYLE: FormStyle = { layout: 'classic', theme: 'card', accent: '', radius: 'soft', density: 'comfortable', width: 'normal', progress: 'steps' }
const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (list.includes(value as T) ? value as T : fallback)
export function normalizeStyle(input: unknown): FormStyle {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const accent = String(raw.accent ?? '').trim()
  return {
    layout: oneOf(raw.layout, ['classic', 'conversational'] as const, 'classic'),
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
  payment: { enabled: false, label: '', invoiceTitle: '', invoiceText: '' }, style: DEFAULT_STYLE,
  notifications: [], confirmations: [], webhooks: [], saveDraft: false, quiz: { enabled: false, passScore: 0, showResult: true }, handlers: [], service: false, workflow: [], receipt: { enabled: false, title: '', terms: '', customerFields: [] },
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

/** Conditions of a notification or a confirmation: they may name any field of the form (checked once the fields are known). */
function looseConditions(input: unknown): Condition[] {
  if (!Array.isArray(input)) return []
  const out: Condition[] = []
  for (const item of input.slice(0, 5)) {
    const field = str((item as Condition)?.field, 51)
    const op = OPS.includes((item as Condition)?.op) ? (item as Condition).op : null
    if (!op || !ID.test(field)) throw new FormsError('شرط اعلان یا پیام تأیید معتبر نیست')
    const value = str((item as Condition)?.value, 150)
    out.push(op === 'filled' || op === 'empty' ? { field, op } : { field, op, value })
  }
  return out
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
  const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []) as Record<string, unknown>[]
  const notifications: FormNotification[] = list(raw.notifications, 6).map((item) => {
    const to = str(item?.to, 400)
    // Recipients: addresses, or the answer of an e-mail field written as {field:id}.
    for (const part of to.split(/[\s,،;]+/).filter(Boolean)) if (!isEmail(part) && !/^\{field:[a-z][a-z0-9_]{0,50}\}$/.test(part)) throw new FormsError('گیرندهٔ اعلان باید ایمیل یا {field:شناسهٔ‌فیلد} باشد')
    if (!to) throw new FormsError('گیرندهٔ اعلان را وارد کنید')
    return { name: str(item?.name, 60) || 'اعلان', to, subject: str(item?.subject, 200), body: String(item?.body ?? '').slice(0, 4000), when: looseConditions(item?.when), logic: item?.logic === 'any' ? 'any' : 'all' }
  })
  const confirmations: FormConfirmation[] = list(raw.confirmations, 6).map((item) => {
    const message = str(item?.message, 1000)
    const redirectUrl = safeRedirect(item?.redirectUrl)
    if (!message && !redirectUrl) throw new FormsError('هر پیام تأیید متن یا نشانی می‌خواهد')
    return { message, redirectUrl, when: looseConditions(item?.when), logic: item?.logic === 'any' ? 'any' : 'all' }
  })
  const webhooks: FormWebhook[] = list(raw.webhooks, 3).map((item) => {
    let url: URL | null = null
    try { url = new URL(str(item?.url, 500)) } catch { url = null }
    if (!url || url.protocol !== 'https:' || url.username || url.password) throw new FormsError('نشانی وب‌هوک باید https باشد')
    const events = (Array.isArray(item?.events) ? item.events : ['submitted']).filter((event): event is FormWebhook['events'][number] => (WEBHOOK_EVENTS as readonly string[]).includes(event as string))
    return { url: url.toString(), secret: str(item?.secret, 120), events: events.length ? [...new Set(events)] : ['submitted'] }
  })
  const quiz = (raw.quiz && typeof raw.quiz === 'object' ? raw.quiz : {}) as Record<string, unknown>
  const handlers = [...new Set((Array.isArray(raw.handlers) ? raw.handlers : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 50)
  return {
    notifications, confirmations, webhooks, saveDraft: raw.saveDraft === true, handlers, service: raw.service === true,
    workflow: normalizeWorkflow(raw.workflow), receipt: normalizeReceipt(raw.receipt),
    quiz: { enabled: quiz.enabled === true, passScore: int(quiz.passScore, 0, 1_000_000, 0), showResult: quiz.showResult !== false },
    payment: { enabled: paid, label: str(payment.label, 40), invoiceTitle: str(payment.invoiceTitle, 120), invoiceText: str(payment.invoiceText, 500) }, style: normalizeStyle(raw.style),
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
    if (CHOICE_TYPES.includes(type) && Array.isArray(f.scores) && f.scores.some((score) => Number(score) !== 0)) out.scores = options.map((_, index) => int((f.scores as unknown[])[index], -1000, 1000, 0))
    if (type === 'repeater') {
      out.columns = (Array.isArray(f.columns) ? f.columns : []).map((column) => str(column, 60).replace(/\|/g, '/')).filter(Boolean).slice(0, 6)
      if (!out.columns.length) throw new FormsError(`ستون‌های «${label}» را تعریف کنید`)
      out.min = int(f.min, 0, 30, 0); out.max = int(f.max, 1, 30, 10)
    }
    if (type === 'slot') {
      const rule = (f.slot && typeof f.slot === 'object' ? f.slot : {}) as Record<string, unknown>
      const clock = (value: unknown, fallback: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback)
      const days = [...new Set((Array.isArray(rule.days) ? rule.days : DEFAULT_SLOT.days).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
      out.slot = { days: days.length ? days : DEFAULT_SLOT.days, from: clock(rule.from, DEFAULT_SLOT.from), to: clock(rule.to, DEFAULT_SLOT.to), minutes: int(rule.minutes, 5, 480, 30), capacity: int(rule.capacity, 1, 500, 1), horizon: int(rule.horizon, 1, 365, 30) }
      if (out.slot.to <= out.slot.from) throw new FormsError(`ساعت پایان «${label}» باید بعد از شروع باشد`)
    }
    if ((WIDTHS as readonly string[]).includes(f.width as string) && f.width !== 'full') out.width = f.width as FieldWidth
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
  if (f.type === 'repeater') {
    if (input !== undefined && !Array.isArray(input)) return [[], `مقدار ${label} معتبر نیست`]
    const width = (f.columns || []).length
    const rows: string[] = []
    for (const item of ((input as unknown[] | undefined) ?? []).slice(0, 40)) {
      const cells = (Array.isArray(item) ? item : String(item ?? '').split('|')).slice(0, width).map((cell) => String(cell ?? '').replace(/[\u0000-\u001f|]/g, ' ').trim().slice(0, 200))
      while (cells.length < width) cells.push('')
      if (cells.some(Boolean)) rows.push(cells.join(' | '))
    }
    if (f.required && !rows.length) return [[], `${label} الزامی است`]
    if (rows.length < (f.min || 0) && (f.required || rows.length)) return [[], `${label}: دست‌کم ${(f.min || 0).toLocaleString('fa-IR')} ردیف`]
    if (rows.length > (f.max || 10)) return [[], `${label}: حداکثر ${(f.max || 10).toLocaleString('fa-IR')} ردیف`]
    return [rows, '']
  }
  if (f.type === 'checkboxes' || f.type === 'file' || f.type === 'signature') {
    if (input !== undefined && !Array.isArray(input)) return [[], `مقدار ${label} معتبر نیست`]
    const list = (input as unknown[] | undefined) ?? []
    if (list.some((item) => typeof item !== 'string')) return [[], `مقدار ${label} معتبر نیست`]
    const items = [...new Set(list as string[])]
    const cap = f.type === 'signature' ? 1 : f.type === 'file' ? Math.min(f.max || 1, 5) : f.max || f.options.length
    if (f.type === 'checkboxes' && items.some((item) => !f.options.includes(item))) return [[], 'گزینه انتخاب‌شده معتبر نیست']
    if (f.type !== 'checkboxes' && items.some((item) => !UPLOAD_ID.test(item))) return [[], `فایل ${label} معتبر نیست`]
    if (f.required && !items.length) return [[], `${label} الزامی است`]
    if (items.length > cap) return [[], `${label}: حداکثر ${cap.toLocaleString('fa-IR')} مورد`]
    if (f.type === 'checkboxes' && f.min && items.length && items.length < f.min) return [[], `${label}: دست‌کم ${f.min.toLocaleString('fa-IR')} گزینه انتخاب کنید`]
    return [items, '']
  }
  if (f.type === 'hidden') return [f.value || '', '']
  if (f.type === 'devicelock') {
    const lock = readDeviceLock(String(input ?? ''))
    if (!input || lock.kind === 'none') return [input ? encodeDeviceLock(lock) : '', f.required && !input ? `${label} الزامی است` : '']
    const problem = deviceLockProblem(lock)
    return problem ? ['', `${label}: ${problem}`] : [encodeDeviceLock(lock), '']
  }
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
    case 'slot': {
      const text = toLatinDigits(value)
      const match = /^(\d{4}-\d{2}-\d{2}) (([01]\d|2[0-3]):[0-5]\d)$/.exec(text)
      const day = match ? new Date(`${match[1]}T00:00:00Z`) : null
      const rule = f.slot || DEFAULT_SLOT
      if (!match || !day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== match[1] || !rule.days.includes(day.getUTCDay()) || !slotTimes(rule).includes(match[2])) return ['', `نوبت ${label} معتبر نیست`]
      return [text, '']
    }
    case 'jdate':
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

/** The turns of one open day, as "HH:MM" (the last one ends by the closing hour). */
export function slotTimes(rule: SlotRule): string[] {
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))
  const out: string[] = []
  for (let at = minutes(rule.from); at + rule.minutes <= minutes(rule.to) && out.length < 200; at += rule.minutes) out.push(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`)
  return out
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
  const fields = form.fields.map(({ markupPercent: _percent, markupFixed: _fixed, value: _value, scores: _scores, ...field }) => field)
  return { ...form, fields, settings: { ...DEFAULT_SETTINGS, saveDraft: s.saveDraft, quiz: { ...DEFAULT_SETTINGS.quiz, enabled: s.quiz.enabled, showResult: s.quiz.showResult }, steps: s.steps, requireLogin: s.requireLogin, redirectUrl: s.redirectUrl, submitLabel: s.submitLabel, closedMessage: s.closedMessage, opensAt: s.opensAt, closesAt: s.closesAt, payment: { ...s.payment, invoiceTitle: '', invoiceText: '' }, style: s.style } }
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

// ------------------------------------------------------------------ work steps, receipts and device locks

/**
 * A form's own work steps (owner 2026-11-12, mobile repair: approved → bring or send the device → received with a
 * receipt → in repair → ready → handed back). OPEN, DONE and REJECTED always exist and keep their meaning; the steps
 * between are the form's. Each step may tell the sender (inbox, and SMS to the form's mobile answer), issue the
 * receipt (`receipt`), or ask for the customer's pickup code before it is set (`pickup`: «no receipt, no device»).
 */
export interface WorkStep { key: string; label: string; message: string; sms: boolean; receipt: boolean; pickup: boolean; /** reached only once the repair's counter invoice is paid (a manager may record why not) */ invoice: boolean }
export interface ReceiptSettings { enabled: boolean; title: string; terms: string; customerFields: string[] }
const STEP_KEY = /^[A-Z][A-Z0-9_]{1,23}$/
const baseStep = (key: Stage): WorkStep => ({ key, label: STAGE_LABEL[key], message: '', sms: false, receipt: false, pickup: false, invoice: false })
export function normalizeWorkflow(input: unknown): WorkStep[] {
  const rows = Array.isArray(input) ? input.slice(0, 12) : []
  if (!rows.length) return []
  const steps: WorkStep[] = []
  for (const item of rows) {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const key = str(raw.key, 24).toUpperCase(), label = str(raw.label, 60)
    if (!STEP_KEY.test(key) || !label) throw new FormsError('هر مرحلهٔ کار عنوان و شناسهٔ لاتین معتبر (مثل RECEIVED) می‌خواهد')
    if (steps.some((step) => step.key === key)) throw new FormsError(`شناسهٔ مرحلهٔ «${key}» تکراری است`)
    steps.push({ key, label, message: String(raw.message ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 400), sms: raw.sms === true, receipt: raw.receipt === true, pickup: raw.pickup === true, invoice: raw.invoice === true })
  }
  // The three fixed stages are always there: first OPEN, last DONE and REJECTED.
  const fixed = (key: Stage) => steps.find((step) => step.key === key) || baseStep(key)
  return [fixed('OPEN'), ...steps.filter((step) => !(STAGES as readonly string[]).includes(step.key) || step.key === 'IN_PROGRESS'), fixed('DONE'), fixed('REJECTED')]
}
export function normalizeReceipt(input: unknown): ReceiptSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const fields = [...new Set((Array.isArray(raw.customerFields) ? raw.customerFields : []).map((id) => str(id, 40)).filter(Boolean))].slice(0, 40)
  return { enabled: raw.enabled === true, title: str(raw.title, 80), terms: String(raw.terms ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 6000), customerFields: fields }
}
/** The steps an answer moves through: the form's own, or the four standard stages. */
export const workSteps = (settings?: Pick<FormSettings, 'workflow'>): WorkStep[] => settings?.workflow?.length ? settings.workflow : STAGES.map(baseStep)
export const stepLabel = (settings: Pick<FormSettings, 'workflow'> | undefined, stage: string) => workSteps(settings).find((step) => step.key === stage)?.label || STAGE_LABEL[stage as Stage] || stage

/**
 * A phone's lock as staff need it to test the repair: a pattern on the 3×3 grid (dots 1–9, row by row), a PIN, a
 * password, or a pattern and a code together. Stored as «kind|1,5,9|text» and encrypted like any secret answer.
 */
export const LOCK_KINDS = ['none', 'pattern', 'pin', 'password', 'mixed'] as const
export type LockKind = (typeof LOCK_KINDS)[number]
export const LOCK_LABEL: Record<LockKind, string> = { none: 'بدون قفل', pattern: 'الگو', pin: 'پین (عددی)', password: 'رمز', mixed: 'الگو و رمز' }
export type DeviceLock = { kind: LockKind; pattern: number[]; text: string }
export function readDeviceLock(value: string): DeviceLock {
  const [kind = 'none', dots = '', ...rest] = String(value || '').split('|')
  return { kind: (LOCK_KINDS as readonly string[]).includes(kind) ? kind as LockKind : 'none', pattern: dots.split(',').map(Number).filter((dot) => Number.isInteger(dot) && dot >= 1 && dot <= 9).slice(0, 9), text: rest.join('|').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64) }
}
export const encodeDeviceLock = (lock: DeviceLock) => `${lock.kind}|${lock.kind === 'pattern' || lock.kind === 'mixed' ? lock.pattern.join(',') : ''}|${lock.kind === 'pin' || lock.kind === 'password' || lock.kind === 'mixed' ? lock.text : ''}`
export function deviceLockProblem(lock: DeviceLock): string {
  const needsPattern = lock.kind === 'pattern' || lock.kind === 'mixed'
  if (needsPattern && (lock.pattern.length < 4 || new Set(lock.pattern).size !== lock.pattern.length)) return 'الگو باید دست‌کم از ۴ نقطهٔ متفاوت بگذرد'
  if (lock.kind === 'pin' && !/^\d{4,16}$/.test(lock.text)) return 'پین باید ۴ تا ۱۶ رقم باشد'
  if ((lock.kind === 'password' || lock.kind === 'mixed') && !lock.text) return 'رمز را بنویسید'
  return ''
}
/** The lock in words, for the shop's receipt and the desk. */
export function deviceLockText(value: string): string {
  const lock = readDeviceLock(value)
  if (lock.kind === 'none') return LOCK_LABEL.none
  return [lock.pattern.length ? `الگو: ${lock.pattern.join('-')}` : '', lock.text ? `${lock.kind === 'pin' ? 'پین' : 'رمز'}: ${lock.text}` : ''].filter(Boolean).join(' · ')
}

/** A printed receipt (forms/server/counter): the shop's copy or the customer's. */
export type ReceiptLine = { label: string; value: string; pattern?: number[] }
export type Receipt = {
  copy: 'shop' | 'customer'; number: number; title: string; form: string; brand: { title: string; logo: string }
  createdAt: string; receivedAt: string | null; stage: string; lines: ReceiptLine[]; secrets: ReceiptLine[]; terms: string[]
  pickupCode: string; link: string; staff: string; source: string; qr?: string
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
    build: () => ({ slug: 'foreign-payment', title: 'پرداخت سایت خارجی با ویزا کارت', description: 'مبلغ و اطلاعات سایت را وارد کنید؛ پس از پرداخت، کارشناس ما پرداخت شما را انجام می‌دهد.', published: false, successText: 'سفارش شما ثبت شد.', settings: { ...DEFAULT_SETTINGS, requireLogin: true, payment: { enabled: true, label: 'پرداخت و ثبت سفارش', invoiceTitle: 'پرداخت سایت خارجی', invoiceText: 'پرداخت {field:amount} در سایت {field:site} برای حساب {field:username}' }, submitLabel: 'تأیید و ادامه', steps: [{ id: 'amount', title: 'مبلغ', description: '' }, { id: 'account', title: 'اطلاعات حساب', description: '' }] }, fields: [
      field('amount', 'مبلغی که باید پرداخت شود', 'fxamount', { required: true, step: 'amount', currencies: ['USD', 'EUR'], markupPercent: 5, markupFixed: 150000, min: 5, max: 2000 }),
      field('total', 'هزینهٔ سفارش شما', 'total', { step: 'amount' }),
      field('site', 'نشانی سایت', 'url', { required: true, step: 'account' }), field('username', 'نام کاربری یا ایمیل حساب', 'text', { required: true, step: 'account', width: 'half' }),
      field('password', 'رمز عبور حساب', 'secret', { required: true, step: 'account', width: 'half' }), field('mobile', 'موبایل برای هماهنگی', 'mobile', { required: true, step: 'account' }),
      field('details', 'توضیحات و اطلاعات حساب', 'textarea', { step: 'account' }),
    ] }),
  },
  {
    id: 'mobile-repair', name: 'تعمیر موبایل', description: 'درخواست تعمیر نرم‌افزاری یا سخت‌افزاری با مدل، ایراد، وضعیت ظاهری و قفل گوشی؛ مراحل تأیید، دریافت دستگاه با رسید و تحویل با کد.',
    build: () => ({ slug: 'mobile-repair', title: 'درخواست تعمیر موبایل', description: 'مدل گوشی و ایراد آن را بنویسید؛ پس از بررسی خبر می‌دهیم که دستگاه را بیاورید یا ارسال کنید.', published: false, successText: 'درخواست شما ثبت شد؛ پس از بررسی با پیامک خبرتان می‌کنیم.', settings: { ...DEFAULT_SETTINGS, service: true, notifyInbox: true,
      workflow: normalizeWorkflow([
        { key: 'OPEN', label: 'در انتظار بررسی' },
        { key: 'APPROVED', label: 'تأیید شد؛ دستگاه را بیاورید یا ارسال کنید', message: 'درخواست تعمیر شما تأیید شد. گوشی را به فروشگاه بیاورید یا ارسال کنید.', sms: true },
        { key: 'RECEIVED', label: 'دستگاه دریافت شد', message: 'گوشی شما دریافت شد. رسید: {receipt} — کد تحویل: {code}', sms: true, receipt: true },
        { key: 'REPAIRING', label: 'در حال تعمیر' },
        { key: 'READY', label: 'آماده تحویل', message: 'گوشی شما آماده است؛ با رسید و کد تحویل مراجعه کنید.', sms: true },
        { key: 'DONE', label: 'تحویل داده شد', pickup: true, invoice: true },
        { key: 'REJECTED', label: 'رد شد' },
      ]),
      receipt: { enabled: true, title: 'رسید پذیرش دستگاه', customerFields: ['name', 'mobile', 'brand', 'model', 'imei', 'issue', 'parts', 'description', 'condition', 'accessories'], terms: [
        'فقط ایراد(های) ثبت‌شده در همین رسید بررسی و تعمیر می‌شود؛ هر ایراد دیگری که هنگام پذیرش ثبت نشده، بر عهدهٔ تعمیرگاه نیست.',
        'وضعیت ظاهری دستگاه و قطعات همراه، همان است که در این رسید نوشته شده و به امضای مشتری رسیده است.',
        'دستگاه فقط با ارائهٔ همین رسید و کد تحویل بازگردانده می‌شود؛ گم شدن رسید را فوراً خبر دهید.',
        'مسئولیت اطلاعات داخل دستگاه با مشتری است؛ در تعمیر نرم‌افزاری ممکن است اطلاعات پاک شود.',
        'دستگاه آب‌خورده، ضربه‌خورده یا پیش‌تر بازشده ممکن است در حین تعمیر دچار ایراد دیگری شود و تعمیرگاه مسئولیتی ندارد.',
        'هزینهٔ نهایی پس از عیب‌یابی اعلام و فقط با تأیید مشتری انجام می‌شود.',
        'دستگاهی که تا ۳۰ روز پس از اعلام «آماده تحویل» دریافت نشود، مشمول هزینهٔ نگهداری است و پس از آن تعمیرگاه مسئولیتی در قبال آن ندارد.',
        'گارانتی فقط برای قطعهٔ تعویض‌شده و همان ایراد است و با باز شدن دستگاه در جای دیگر یا آسیب فیزیکی باطل می‌شود.',
      ].map((line, index) => `${(index + 1).toLocaleString('fa-IR')}. ${line}`).join('\n') } }, fields: [
      field('name', 'نام و نام خانوادگی', 'text', { required: true, width: 'half' }), field('mobile', 'موبایل', 'mobile', { required: true, width: 'half' }),
      field('brand', 'برند گوشی', 'select', { required: true, width: 'half', options: ['اپل (آیفون)', 'سامسونگ', 'شیائومی', 'هواوی', 'آنر', 'نوکیا', 'موتورولا', 'سایر'] }),
      field('model', 'مدل دقیق', 'text', { required: true, width: 'half', placeholder: 'مثلاً iPhone 13 Pro یا Galaxy A54' }),
      field('imei', 'IMEI یا شمارهٔ سریال', 'text', { width: 'half', help: 'با شمارهٔ *#06# نشان داده می‌شود' }),
      field('issue', 'نوع ایراد', 'radio', { required: true, width: 'half', options: ['نرم‌افزاری', 'سخت‌افزاری', 'هر دو', 'نمی‌دانم'] }),
      field('parts', 'بخش‌های دارای ایراد', 'checkboxes', { options: ['صفحه‌نمایش (LCD)', 'تاچ', 'باتری', 'سوکت شارژ', 'دوربین', 'اسپیکر یا میکروفون', 'دکمه‌ها', 'بدنه یا قاب', 'برد', 'آنتن یا سیم‌کارت', 'نرم‌افزار یا فلش', 'سایر'] }),
      field('description', 'شرح ایراد', 'textarea', { required: true, placeholder: 'از کی و چطور پیش آمد؟ آیا ضربه خورده یا آب خورده است؟' }),
      field('condition', 'وضعیت ظاهری هنگام تحویل', 'textarea', { help: 'خط و خش، شکستگی، تاب برداشتن، رنگ‌رفتگی…' }),
      field('accessories', 'همراه دستگاه', 'checkboxes', { options: ['سیم‌کارت', 'کارت حافظه', 'قاب', 'شارژر', 'جعبه'] }),
      field('lock', 'قفل گوشی', 'devicelock', { help: 'برای آزمایش پس از تعمیر لازم است؛ رمزنگاری می‌شود و یک هفته پس از پایان کار پاک می‌شود.' }),
      field('handover', 'روش تحویل دستگاه', 'radio', { required: true, options: ['حضوری می‌آورم', 'ارسال پستی یا پیک'] }),
      field('consent', 'قوانین خدمات تعمیر را خواندم و می‌پذیرم', 'checkbox', { required: true }),
    ] }),
  },
  {
    id: 'computer-repair', name: 'تعمیر کامپیوتر و لپ‌تاپ', description: 'پذیرش لپ‌تاپ، کیس و آل‌این‌وان با مشخصات، ایراد، وضعیت ظاهری، قطعات همراه و رمز ورود؛ عیب‌یابی و تأیید هزینه، دریافت با رسید و تحویل با کد.',
    build: () => ({ slug: 'computer-repair', title: 'درخواست تعمیر کامپیوتر و لپ‌تاپ', description: 'نوع دستگاه، مدل و ایراد آن را بنویسید؛ پس از بررسی خبر می‌دهیم که دستگاه را بیاورید یا ارسال کنید.', published: false, successText: 'درخواست شما ثبت شد؛ پس از بررسی با پیامک خبرتان می‌کنیم.', settings: { ...DEFAULT_SETTINGS, service: true, notifyInbox: true,
      workflow: normalizeWorkflow([
        { key: 'OPEN', label: 'در انتظار بررسی' },
        { key: 'APPROVED', label: 'تأیید شد؛ دستگاه را بیاورید یا ارسال کنید', message: 'درخواست تعمیر شما تأیید شد. دستگاه را به همراه شارژر یا کابل برق به فروشگاه بیاورید یا ارسال کنید.', sms: true },
        { key: 'RECEIVED', label: 'دستگاه دریافت شد', message: 'دستگاه شما دریافت شد. رسید: {receipt} — کد تحویل: {code}', sms: true, receipt: true },
        { key: 'QUOTED', label: 'عیب‌یابی شد؛ منتظر تأیید هزینه', message: 'عیب‌یابی دستگاه شما انجام شد. برای شنیدن هزینه و تأیید تعمیر با ما تماس بگیرید.', sms: true },
        { key: 'REPAIRING', label: 'در حال تعمیر' },
        { key: 'READY', label: 'آماده تحویل', message: 'دستگاه شما آماده است؛ با رسید و کد تحویل مراجعه کنید.', sms: true },
        { key: 'DONE', label: 'تحویل داده شد', pickup: true, invoice: true },
        { key: 'REJECTED', label: 'رد شد' },
      ]),
      receipt: { enabled: true, title: 'رسید پذیرش دستگاه', customerFields: ['name', 'mobile', 'device', 'brand', 'model', 'serial', 'issue', 'parts', 'description', 'condition', 'accessories', 'data'], terms: [
        'فقط ایراد(های) ثبت‌شده در همین رسید بررسی و تعمیر می‌شود؛ هر ایراد دیگری که هنگام پذیرش ثبت نشده، بر عهدهٔ تعمیرگاه نیست.',
        'وضعیت ظاهری دستگاه و قطعات همراه (شارژر، کیف، هارد و…) همان است که در این رسید نوشته شده و به امضای مشتری رسیده است.',
        'دستگاه فقط با ارائهٔ همین رسید و کد تحویل بازگردانده می‌شود؛ گم شدن رسید را فوراً خبر دهید.',
        'مسئولیت اطلاعات داخل هارد یا SSD با مشتری است؛ پیش از تحویل از اطلاعات مهم پشتیبان بگیرید. نصب دوبارهٔ ویندوز یا تعویض حافظه اطلاعات را پاک می‌کند و پشتیبان‌گیری یا بازیابی اطلاعات خدمتی جدا با هزینهٔ جداست.',
        'نرم‌افزار و ویندوز فقط با نسخه‌ای نصب می‌شود که مشتری مجوزش را دارد یا جداگانه خریداری می‌کند.',
        'دستگاه آب‌خورده، ضربه‌خورده، دارای باتری متورم یا پیش‌تر بازشده ممکن است در حین تعمیر دچار ایراد دیگری شود و تعمیرگاه مسئولیتی ندارد.',
        'هزینهٔ نهایی پس از عیب‌یابی اعلام و فقط با تأیید مشتری انجام می‌شود؛ اگر مشتری تعمیر را نپذیرد، هزینهٔ عیب‌یابی دریافت می‌شود.',
        'دستگاهی که تا ۳۰ روز پس از اعلام «آماده تحویل» دریافت نشود، مشمول هزینهٔ نگهداری است و پس از آن تعمیرگاه مسئولیتی در قبال آن ندارد.',
        'گارانتی فقط برای قطعهٔ تعویض‌شده و همان ایراد است و با باز شدن دستگاه در جای دیگر، آسیب فیزیکی یا نوسان برق باطل می‌شود.',
      ].map((line, index) => `${(index + 1).toLocaleString('fa-IR')}. ${line}`).join('\n') } }, fields: [
      field('name', 'نام و نام خانوادگی', 'text', { required: true, width: 'half' }), field('mobile', 'موبایل', 'mobile', { required: true, width: 'half' }),
      field('device', 'نوع دستگاه', 'radio', { required: true, options: ['لپ‌تاپ', 'کیس (کامپیوتر رومیزی)', 'آل‌این‌وان', 'مینی‌کیس', 'مانیتور', 'سایر'] }),
      field('brand', 'برند', 'select', { required: true, width: 'half', options: ['ایسوس', 'لنوو', 'اچ‌پی', 'دل', 'ایسر', 'اپل (مک‌بوک یا آی‌مک)', 'ام‌اس‌آی', 'مایکروسافت (سرفیس)', 'سامسونگ', 'اسمبل‌شده', 'سایر'] }),
      field('model', 'مدل دقیق', 'text', { required: true, width: 'half', placeholder: 'مثلاً ASUS VivoBook 15 X1504 یا مشخصات کیس' }),
      field('serial', 'شمارهٔ سریال', 'text', { width: 'half', help: 'روی برچسب زیر لپ‌تاپ یا پشت کیس' }),
      field('issue', 'نوع ایراد', 'radio', { required: true, width: 'half', options: ['نرم‌افزاری', 'سخت‌افزاری', 'هر دو', 'نمی‌دانم'] }),
      field('parts', 'بخش‌های دارای ایراد', 'checkboxes', { options: ['روشن نمی‌شود', 'صفحه‌نمایش یا تصویر', 'کیبورد', 'تاچ‌پد', 'باتری', 'شارژر یا سوکت برق', 'لولا یا بدنه', 'هارد یا SSD', 'رم', 'مادربرد', 'کارت گرافیک', 'داغ شدن یا صدای فن', 'پاور (کیس)', 'پورت‌ها (USB، HDMI…)', 'وای‌فای یا بلوتوث', 'صدا یا میکروفون', 'ویندوز و نرم‌افزار', 'ویروس', 'کندی', 'ارتقا (رم، SSD…)', 'سایر'] }),
      field('description', 'شرح ایراد', 'textarea', { required: true, placeholder: 'از کی و چطور پیش آمد؟ آیا ضربه خورده، مایعات رویش ریخته یا قبلاً جای دیگری تعمیر شده است؟' }),
      field('condition', 'وضعیت ظاهری هنگام تحویل', 'textarea', { help: 'خط و خش، شکستگی بدنه یا لولا، کلید افتاده، لک یا خط روی صفحه…' }),
      field('accessories', 'همراه دستگاه', 'checkboxes', { options: ['شارژر یا آداپتور', 'کابل برق', 'کیف', 'ماوس', 'کیبورد', 'هارد اکسترنال', 'فلش یا کارت حافظه', 'جعبه'] }),
      field('data', 'اطلاعات داخل دستگاه', 'radio', { required: true, options: ['پشتیبان دارم؛ پاک شدن اطلاعات مشکلی ندارد', 'به پشتیبان‌گیری نیاز دارم (هزینهٔ جدا)', 'اطلاعات مهمی روی دستگاه نیست'] }),
      field('password', 'رمز ورود ویندوز یا حساب کاربری', 'secret', { help: 'برای آزمایش پس از تعمیر لازم است؛ رمزنگاری می‌شود و یک هفته پس از پایان کار پاک می‌شود.' }),
      field('handover', 'روش تحویل دستگاه', 'radio', { required: true, options: ['حضوری می‌آورم', 'ارسال پستی یا پیک'] }),
      field('consent', 'قوانین خدمات تعمیر را خواندم و می‌پذیرم', 'checkbox', { required: true }),
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
