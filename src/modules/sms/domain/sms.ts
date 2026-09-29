// SMS (IPPanel): phone numbers, settings, event templates and OTP rules (pure).

import { latinDigits } from '@/shared/text/digits'

/** Iranian mobile in E.164 (+989xxxxxxxxx), or '' when invalid. Accepts 09…, 9…, 989…, +989…, 00989…, Persian digits. */
export function normalizeMobile(value: unknown): string {
  const digits = latinDigits(value).replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '')
  const local = digits.startsWith('98') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^9\d{9}$/.test(local) ? `+98${local}` : ''
}

/** 0912 345 6789 for display. */
export function displayMobile(e164: string): string {
  const mobile = normalizeMobile(e164)
  return mobile ? `0${mobile.slice(3, 6)} ${mobile.slice(6, 9)} ${mobile.slice(9)}` : e164
}

/** 0912***6789 for logs and notices. */
export const maskMobile = (e164: string) => {
  const mobile = normalizeMobile(e164)
  return mobile ? `0${mobile.slice(3, 6)}***${mobile.slice(-4)}` : ''
}

export type SmsAudience = 'user' | 'admin'

export interface SmsEventDef {
  id: string
  audience: SmsAudience
  label: string
  /** Variables available in the text template and as pattern params. */
  vars: string[]
  template: string
}

// User events mirror the customer inbox (notifications); admin events alert staff.
export const SMS_EVENTS: SmsEventDef[] = [
  { id: 'PAYMENT_PAID', audience: 'user', label: 'پرداخت تأیید شد', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}.\n{link}\n{brand}' },
  { id: 'RECEIPT_REJECTED', audience: 'user', label: 'رسید کارت به کارت رد شد', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\nبرای ارسال دوباره: {link}\n{brand}' },
  { id: 'PAYMENT_CLOSED', audience: 'user', label: 'فاکتور بسته شد', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}.\n{link}\n{brand}' },
  { id: 'PRODUCT_DELIVERED', audience: 'user', label: 'محصول تحویل/ارسال شد', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'DELIVERY_DELAYED', audience: 'user', label: 'تأخیر در تحویل', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{brand}' },
  { id: 'MEMBERSHIP', audience: 'user', label: 'اشتراک ویژه (VIP)', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{brand}' },
  { id: 'TICKET_REPLY', audience: 'user', label: 'پاسخ تیکت پشتیبانی', vars: ['name', 'title', 'link'], template: '{name} عزیز، به تیکت شما پاسخ داده شد.\n{link}\n{brand}' },
  { id: 'SUBSCRIPTION_EXPIRING', audience: 'user', label: 'نزدیک شدن پایان اشتراک', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'SUBSCRIPTION_EXPIRED', audience: 'user', label: 'پایان اشتراک', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'SUBSCRIPTION_READY', audience: 'user', label: 'فعال شدن سرویس', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}.\n{link}\n{brand}' },
  { id: 'SUBSCRIPTION_RENEWED', audience: 'user', label: 'تمدید سرویس', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}.\n{link}\n{brand}' },
  { id: 'ORDER_REFUND', audience: 'user', label: 'لغو/مرجوعی و برگشت وجه', vars: ['name', 'title', 'body', 'link'], template: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'STOCK_BACK', audience: 'user', label: 'موجود شدن کالای موردنظر', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}\n{link}\n{brand}' },
  { id: 'CART_REMINDER', audience: 'user', label: 'یادآوری سبد خرید رهاشده', vars: ['name', 'body', 'link'], template: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'GIFT_CARD', audience: 'user', label: 'کارت هدیه', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}\n{link}\n{brand}' },
  { id: 'LOYALTY', audience: 'user', label: 'باشگاه مشتریان (امتیاز و سطح)', vars: ['name', 'title', 'link'], template: '{name} عزیز، {title}\n{link}\n{brand}' },
  { id: 'ADMIN_RECEIPT', audience: 'admin', label: 'رسید کارت به کارت جدید (مدیر)', vars: ['invoice', 'amount'], template: 'رسید پرداخت جدید برای فاکتور {invoice} به مبلغ {amount} ثبت شد و منتظر تأیید است.' },
  { id: 'ADMIN_ORDER', audience: 'admin', label: 'سفارش پرداخت‌شدهٔ جدید (مدیر)', vars: ['invoice', 'amount'], template: 'سفارش جدید پرداخت شد: فاکتور {invoice} — {amount}' },
  { id: 'ADMIN_TICKET', audience: 'admin', label: 'تیکت جدید (مدیر)', vars: ['subject', 'name'], template: 'تیکت جدید از {name}: {subject}' },
  { id: 'ADMIN_RETURN', audience: 'admin', label: 'درخواست لغو یا مرجوعی (مدیر)', vars: ['order', 'kind', 'name'], template: '{kind} جدید برای سفارش {order} از {name}؛ منتظر بررسی است.' },
]

export const smsEvent = (id: string) => SMS_EVENTS.find((event) => event.id === id)

export interface SmsEventSetting { enabled: boolean; text: string; pattern: string }

export interface SmsConfig {
  enabled: boolean
  /** Encrypted at rest; never returned to the browser. */
  apiKey: string
  /** Sender line in E.164, e.g. +983000505. */
  fromNumber: string
  otpLogin: boolean
  /** Approved IPPanel pattern for OTP (fast, skips review); its variable name. */
  otpPattern: string
  otpParam: string
  otpText: string
  /** Staff mobiles for admin alerts. */
  adminPhones: string[]
  events: Record<string, SmsEventSetting>
}

export const DEFAULT_SMS: SmsConfig = {
  enabled: false,
  apiKey: '',
  fromNumber: '',
  otpLogin: true,
  otpPattern: '',
  otpParam: 'code',
  otpText: 'کد ورود شما به {brand}: {code}\nاین کد را در اختیار دیگران قرار ندهید.',
  adminPhones: [],
  events: Object.fromEntries(SMS_EVENTS.map((event) => [event.id, { enabled: ['PAYMENT_PAID', 'RECEIPT_REJECTED', 'PRODUCT_DELIVERED', 'TICKET_REPLY', 'ADMIN_RECEIPT'].includes(event.id), text: event.template, pattern: '' }])),
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim().slice(0, max)

function senderNumber(value: unknown): string {
  const digits = latinDigits(value).replace(/[^\d+]/g, '')
  if (!digits) return ''
  // "+98…"/"0098…" is already international; anything else is a local line (3000505, 021…, 98100…).
  const international = /^(\+|00)/.test(digits)
  const plain = digits.replace(/^\+/, '').replace(/^00/, '')
  const withCountry = international ? plain : `98${plain.replace(/^0/, '')}`
  return /^98\d{4,14}$/.test(withCountry) ? `+${withCountry}` : ''
}

/** Keeps the stored key when the form sends an empty or masked value. */
export function normalizeSmsConfig(input: Record<string, any>, previous: SmsConfig = DEFAULT_SMS): SmsConfig {
  const key = clean(input.apiKey, 300)
  const events: Record<string, SmsEventSetting> = {}
  for (const event of SMS_EVENTS) {
    const raw = input.events?.[event.id] || previous.events[event.id] || DEFAULT_SMS.events[event.id]
    events[event.id] = { enabled: raw?.enabled === true, text: clean(raw?.text, 500) || event.template, pattern: clean(raw?.pattern, 60).replace(/[^\w-]/g, '') }
  }
  const phones = Array.isArray(input.adminPhones) ? input.adminPhones : String(input.adminPhones || '').split(/[\s,،]+/)
  return {
    enabled: input.enabled === true,
    apiKey: key && !key.startsWith('••••') ? key : input.apiKey === null ? '' : previous.apiKey,
    fromNumber: senderNumber(input.fromNumber),
    otpLogin: input.otpLogin !== false,
    otpPattern: clean(input.otpPattern, 60).replace(/[^\w-]/g, ''),
    otpParam: clean(input.otpParam, 30).replace(/[^\w]/g, '') || 'code',
    otpText: clean(input.otpText, 300) || DEFAULT_SMS.otpText,
    adminPhones: [...new Set(phones.map(normalizeMobile).filter(Boolean))].slice(0, 10),
    events,
  }
}

/** Replaces {var} placeholders; unknown placeholders are removed. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

// ------------------------------------------------------------------ OTP

export const OTP_TTL_MS = 2 * 60_000
export const OTP_RESEND_MS = 60_000
export const OTP_MAX_ATTEMPTS = 5

/** Six digits without a leading zero, from a secure random source. */
export function otpCode(random: (max: number) => number): string {
  return String(100000 + random(900000))
}

export const validOtpFormat = (code: unknown) => /^\d{6}$/.test(latinDigits(code).trim())

/** Placeholder email for accounts created by phone login (unique, never mailed). */
export const phoneEmail = (e164: string) => `${e164.replace(/^\+/, '')}@phone.mobocom.local`
export const isPhonePlaceholderEmail = (email: string) => /^98\d{10}@phone\.mobocom\.local$/.test(email)
