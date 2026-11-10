// Registration / profile fields the site owner designs in the admin: which
// ones exist, their order, and which are required before a new member can
// use their account. Pure: config normalisation, per-field validation,
// completeness and the default-username sequence. No I/O here.

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'email' | 'tel' | 'postalCode' | 'nationalId' | 'url'

/** Built-ins map onto real account data; custom fields live in User.profileData. */
export type BuiltinKey = 'firstName' | 'lastName' | 'username' | 'email' | 'address' | 'phone'

export class CompletionError extends Error {
  constructor(message: string, readonly errors: Record<string, string>, readonly status = 422) { super(message) }
}

export type FieldDef = {
  key: string
  label: string
  type: FieldType | 'builtin'
  builtin?: BuiltinKey
  required: boolean
  enabled: boolean
  placeholder: string
  help: string
  options: string[]
}

export type FieldsConfig = {
  /** Send members with missing required fields to the completion page. */
  enforce: boolean
  /** Default usernames: prefix, prefix2, prefix3, … */
  usernamePrefix: string
  intro: string
  fields: FieldDef[]
}

export const FIELD_TYPES: Record<FieldType, string> = {
  text: 'متن کوتاه', textarea: 'متن چندخطی', number: 'عدد', select: 'لیست کشویی', radio: 'گزینه‌ای', checkbox: 'تیک (بله/خیر)',
  date: 'تاریخ', email: 'ایمیل', tel: 'تلفن', postalCode: 'کد پستی', nationalId: 'کد ملی', url: 'وب‌سایت',
}

export const BUILTINS: Record<BuiltinKey, { label: string; help: string }> = {
  firstName: { label: 'نام', help: '' },
  lastName: { label: 'نام خانوادگی', help: '' },
  username: { label: 'نام کاربری', help: 'اگر خالی بماند، نام کاربری پیش‌فرض ساخته می‌شود.' },
  email: { label: 'ایمیل', help: 'برای دریافت فاکتور و اطلاع‌رسانی سفارش‌ها.' },
  address: { label: 'آدرس و موقعیت روی نقشه', help: 'استان، شهر، نشانی، کد پستی و موقعیت روی نقشه؛ آدرس پیش‌فرض ارسال سفارش‌ها می‌شود.' },
  phone: { label: 'شمارهٔ موبایل تأییدشده', help: 'با کد پیامکی تأیید می‌شود؛ برای ورود با پیامک، بازیابی حساب و اطلاع‌رسانی سفارش‌ها.' },
}

const builtin = (key: BuiltinKey, required: boolean, enabled = true): FieldDef => ({ key, label: BUILTINS[key].label, type: 'builtin', builtin: key, required, enabled, placeholder: '', help: BUILTINS[key].help, options: [] })

export const DEFAULT_FIELDS_CONFIG: FieldsConfig = {
  enforce: true,
  usernamePrefix: 'mobocomuser',
  intro: 'برای استفاده از حساب، چند مشخصهٔ ضروری را یک بار تکمیل کنید.',
  // The address is offered, not demanded: a new member may only want to read, review or buy digital goods,
  // and checkout asks for an address whenever an order needs one. The owner can make it required in the admin.
  fields: [builtin('firstName', true), builtin('lastName', true), builtin('address', false), builtin('email', false), builtin('username', false), builtin('phone', false, false)],
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
export const toLatinDigits = (value: unknown) => String(value ?? '').replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))

/** Normalises the admin's config; unknown built-ins dropped, missing ones re-added (disabled). */
export function normalizeFieldsConfig(input: unknown): FieldsConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const prefix = String(raw.usernamePrefix ?? DEFAULT_FIELDS_CONFIG.usernamePrefix).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16)
  const list = Array.isArray(raw.fields) ? raw.fields.slice(0, 60) : DEFAULT_FIELDS_CONFIG.fields
  const seen = new Set<string>()
  const fields: FieldDef[] = []
  for (const item of list) {
    const row = (item || {}) as Record<string, unknown>
    const isBuiltin = typeof row.builtin === 'string' && row.builtin in BUILTINS
    const key = isBuiltin ? String(row.builtin) : String(row.key || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)
    if (!key || seen.has(key) || (!isBuiltin && (key in BUILTINS || !/^[a-zA-Z]/.test(key)))) continue
    const type = isBuiltin ? 'builtin' : (String(row.type) in FIELD_TYPES ? String(row.type) as FieldType : 'text')
    const options = Array.isArray(row.options) ? [...new Set(row.options.map((option) => text(option, 80)).filter(Boolean))].slice(0, 50) : []
    if (!isBuiltin && (type === 'select' || type === 'radio') && options.length < 2) continue
    seen.add(key)
    const b = isBuiltin ? key as BuiltinKey : undefined
    fields.push({
      key, type, builtin: b,
      label: text(row.label, 80) || (b ? BUILTINS[b].label : key),
      // Username can never be forced: a default one is always generated.
      required: b === 'username' ? false : row.required === true,
      enabled: row.enabled !== false,
      placeholder: text(row.placeholder, 120),
      help: text(row.help, 240),
      options,
    })
  }
  for (const key of Object.keys(BUILTINS) as BuiltinKey[]) if (!seen.has(key)) fields.push({ ...builtin(key, false, false) })
  return {
    enforce: raw.enforce !== false,
    usernamePrefix: prefix.length >= 3 && /^[a-z]/.test(prefix) ? prefix : DEFAULT_FIELDS_CONFIG.usernamePrefix,
    intro: text(raw.intro ?? DEFAULT_FIELDS_CONFIG.intro, 400),
    fields,
  }
}

/** Iranian national ID (کد ملی) checksum. */
export function validNationalId(value: string): boolean {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false
  const check = Number(value[9])
  const sum = value.slice(0, 9).split('').reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0) % 11
  return sum < 2 ? check === sum : check === 11 - sum
}

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** Cleans one custom value; returns [value, error]. Empty values are '' (checked against `required` by the caller). */
export function cleanCustomValue(field: FieldDef, input: unknown): [string | boolean, string | null] {
  const label = field.label
  if (field.type === 'checkbox') return [input === true || input === 'true', null]
  const raw = field.type === 'textarea' ? String(input ?? '').replace(/\u0000/g, '').trim().slice(0, 2000) : text(input, 300)
  if (!raw) return ['', null]
  const latin = toLatinDigits(raw)
  switch (field.type) {
    case 'number': return /^-?\d+(\.\d+)?$/.test(latin.replace(/[,٬]/g, '')) ? [latin.replace(/[,٬]/g, ''), null] : ['', `«${label}» باید عدد باشد`]
    case 'email': return EMAIL.test(raw) ? [raw.toLowerCase(), null] : ['', `«${label}» ایمیل معتبر نیست`]
    case 'tel': { const digits = latin.replace(/[^\d+]/g, ''); return /^\+?\d{7,15}$/.test(digits) ? [digits, null] : ['', `«${label}» شمارهٔ تلفن معتبر نیست`] }
    case 'postalCode': { const digits = latin.replace(/\D/g, ''); return /^[13-9]{5}\d{5}$/.test(digits) ? [digits, null] : ['', `«${label}» کد پستی ده‌رقمی معتبر نیست`] }
    case 'nationalId': { const digits = latin.replace(/\D/g, ''); return validNationalId(digits) ? [digits, null] : ['', `«${label}» کد ملی معتبر نیست`] }
    case 'url': return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(raw) ? [raw, null] : ['', `«${label}» نشانی وب معتبر نیست`]
    case 'date': return /^\d{4}\/\d{1,2}\/\d{1,2}$|^\d{4}-\d{2}-\d{2}$/.test(latin) ? [latin, null] : ['', `«${label}» تاریخ را به شکل ۱۳۷۰/۰۵/۲۰ وارد کنید`]
    case 'select':
    case 'radio': return field.options.includes(raw) ? [raw, null] : ['', `یکی از گزینه‌های «${label}» را انتخاب کنید`]
    default: return [raw, null]
  }
}

export type MemberState = { firstName: string; lastName: string; hasAddress: boolean; realEmail: boolean; phoneVerified: boolean; data: Record<string, unknown> }

const filled = (value: unknown) => value === true || (typeof value === 'string' && value.trim() !== '') || typeof value === 'number'

/**
 * A required verified mobile is only asked for while SMS codes can be delivered:
 * without a working provider nobody could ever finish the step.
 */
export function withPhoneDelivery(config: FieldsConfig, smsReady: boolean): FieldsConfig {
  if (smsReady) return config
  return { ...config, fields: config.fields.map((field) => field.builtin === 'phone' ? { ...field, required: false, enabled: false } : field) }
}

/** Required fields this member still has to fill. */
export function missingRequired(config: FieldsConfig, state: MemberState): FieldDef[] {
  return config.fields.filter((field) => field.enabled && field.required).filter((field) => {
    switch (field.builtin) {
      case 'firstName': return !state.firstName.trim()
      case 'lastName': return !state.lastName.trim()
      case 'address': return !state.hasAddress
      case 'email': return !state.realEmail
      case 'username': return false
      case 'phone': return !state.phoneVerified
      default: return field.type === 'checkbox' ? state.data[field.key] !== true : !filled(state.data[field.key])
    }
  })
}

/** Next default username: prefix, prefix2, prefix3… after the highest one already taken. */
export function nextUsername(prefix: string, taken: string[]): string {
  let max = 0
  for (const name of taken) {
    if (name === prefix) max = Math.max(max, 1)
    else if (name.startsWith(prefix)) {
      const suffix = name.slice(prefix.length)
      if (/^[1-9]\d{0,8}$/.test(suffix)) max = Math.max(max, Number(suffix))
    }
  }
  return max === 0 ? prefix : `${prefix}${max + 1}`
}

/** "علی رضایی" → ["علی", "رضایی"] for accounts that only have a full name. */
export function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ['', '']
  return [parts[0], parts.slice(1).join(' ')]
}
