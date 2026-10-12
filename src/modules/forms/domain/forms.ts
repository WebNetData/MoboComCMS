// Form builder rules: field types, conditional logic, steps, validation and export.
// Pure functions with no imports, so the browser, the server and the tests share one definition.

export class FormsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'checkboxes', 'number', 'date', 'url', 'rating', 'file', 'heading', 'paragraph'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FIELD_LABEL: Record<FieldType, string> = {
  text: 'متن کوتاه', email: 'ایمیل', tel: 'تلفن', textarea: 'متن بلند', select: 'لیست کشویی', checkbox: 'تأیید / رضایت', radio: 'گزینهٔ تکی', checkboxes: 'چندگزینه‌ای',
  number: 'عدد', date: 'تاریخ', url: 'نشانی وب', rating: 'امتیاز عددی', file: 'ضمیمهٔ فایل', heading: 'عنوان بخش', paragraph: 'متن توضیحی',
}
/** Types that show text only and never carry an answer. */
export const CONTENT_TYPES: FieldType[] = ['heading', 'paragraph']
export const CHOICE_TYPES: FieldType[] = ['select', 'radio', 'checkboxes']

export type Op = 'eq' | 'neq' | 'contains' | 'filled' | 'empty'
export const OPS: Op[] = ['eq', 'neq', 'contains', 'filled', 'empty']
export const OP_LABEL: Record<Op, string> = { eq: 'برابر باشد با', neq: 'برابر نباشد با', contains: 'شامل باشد', filled: 'پر شده باشد', empty: 'خالی باشد' }
export interface Condition { field: string; op: Op; value?: string }

export interface FormField {
  id: string; label: string; type: FieldType; required: boolean; options: string[]
  placeholder?: string; help?: string; min?: number; max?: number; width?: 'full' | 'half'; step?: string
  showIf?: Condition[]; logic?: 'all' | 'any'
}
export interface FormStep { id: string; title: string; description: string }
export interface FormSettings {
  steps: FormStep[]
  notifyEmails: string[]; notifyInbox: boolean
  autoReply: { enabled: boolean; subject: string; body: string }
  requireLogin: boolean; oncePerUser: boolean
  opensAt: string; closesAt: string; maxSubmissions: number
  redirectUrl: string; submitLabel: string; closedMessage: string; spamLinks: number
}
export interface FormDefinition { id?: number; slug: string; title: string; description: string; fields: FormField[]; published: boolean; successText: string; settings?: FormSettings }

export type Answer = string | boolean | string[]
export const DEFAULT_SETTINGS: FormSettings = {
  steps: [], notifyEmails: [], notifyInbox: true, autoReply: { enabled: false, subject: '', body: '' }, requireLogin: false, oncePerUser: false,
  opensAt: '', closesAt: '', maxSubmissions: 0, redirectUrl: '', submitLabel: '', closedMessage: '', spamLinks: 3,
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
  return {
    steps, notifyEmails: emails, notifyInbox: raw.notifyInbox !== false,
    autoReply: { enabled: reply.enabled === true, subject: str(reply.subject, 150), body: String(reply.body ?? '').slice(0, 3000) },
    requireLogin: raw.requireLogin === true, oncePerUser: raw.oncePerUser === true, opensAt, closesAt,
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
    if (f.width === 'half') out.width = 'half'
    const step = str(f.step, 31)
    if (settings.steps.length) out.step = stepIds.has(step) ? step : settings.steps[0].id
    const showIf = normalizeConditions(f.showIf, seen, label)
    if (showIf.length) { out.showIf = showIf; out.logic = f.logic === 'any' ? 'any' : 'all' }
    seen.add(id)
    fields.push(out)
  }
  if (!fields.some((f) => !CONTENT_TYPES.includes(f.type))) throw new FormsError('حداقل یک فیلد پاسخ‌دار لازم است')
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
  if (input !== undefined && typeof input !== 'string' && typeof input !== 'number') return ['', `مقدار ${label} معتبر نیست`]
  let value = String(input ?? '').trim()
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
  return { ...form, settings: { ...DEFAULT_SETTINGS, steps: s.steps, requireLogin: s.requireLogin, redirectUrl: s.redirectUrl, submitLabel: s.submitLabel, closedMessage: s.closedMessage, opensAt: s.opensAt, closesAt: s.closesAt } }
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
