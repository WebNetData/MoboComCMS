/** Copyright (takedown) report rules shared by the public form, the API and tests. */

export class CopyrightError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export const REPORT_STATUSES = ['NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const
export type ReportStatus = typeof REPORT_STATUSES[number]
export const STATUS_LABEL: Record<ReportStatus, string> = { NEW: 'ثبت شده، در صف بررسی', REVIEWING: 'در حال بررسی', ACCEPTED: 'پذیرفته شد؛ محتوا حذف شد', REJECTED: 'رد شد' }

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max)

export type ReportInput = {
  name: string; email: string; organization: string; phone: string; role: 'OWNER' | 'AGENT'
  workTitle: string; originalUrl: string; infringingUrls: string[]; description: string; signature: string
}

/** One http(s) URL per line (or comma), deduplicated, at most 20. */
export function parseUrlList(value: unknown): string[] {
  const urls: string[] = []
  for (const part of String(value ?? '').split(/[\n,،\s]+/)) {
    const raw = part.trim()
    if (!raw) continue
    try {
      const url = new URL(raw)
      if (['http:', 'https:'].includes(url.protocol) && raw.length <= 1000 && !urls.includes(url.toString())) urls.push(url.toString())
    } catch { /* not a URL */ }
  }
  return urls.slice(0, 20)
}

/**
 * Validates a public report. The reporter must declare good faith and sign
 * with the same name, as takedown procedures require.
 */
export function validateReport(input: Record<string, unknown>): ReportInput {
  const name = clean(input.name, 120)
  const email = clean(input.email, 200).toLowerCase()
  const workTitle = clean(input.workTitle, 300)
  const description = String(input.description ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, ' ').trim().slice(0, 5000)
  const signature = clean(input.signature, 120)
  const infringingUrls = parseUrlList(input.infringingUrls)
  const originalUrl = parseUrlList(input.originalUrl)[0] || ''
  if (name.length < 3) throw new CopyrightError('نام و نام خانوادگی (یا نام شرکت) را وارد کنید')
  if (!EMAIL.test(email)) throw new CopyrightError('نشانی ایمیل معتبر نیست')
  if (workTitle.length < 2) throw new CopyrightError('نام اثر دارای حق نشر را بنویسید')
  if (!infringingUrls.length) throw new CopyrightError('دست‌کم یک نشانی کامل (با https://) از صفحهٔ ناقض در سایت ما وارد کنید')
  if (description.length < 30) throw new CopyrightError('توضیح دهید چرا این محتوا حق نشر شما را نقض می‌کند (دست‌کم ۳۰ حرف)')
  if (input.statement !== true) throw new CopyrightError('تأیید صحت اطلاعات و حسن نیت الزامی است')
  if (signature.replace(/\s+/g, ' ') !== name.replace(/\s+/g, ' ')) throw new CopyrightError('امضا باید دقیقاً همان نام واردشده باشد')
  return {
    name, email, workTitle, description, signature, infringingUrls, originalUrl,
    organization: clean(input.organization, 200), phone: clean(input.phone, 30).replace(/[^\d+۰-۹ -]/g, ''),
    role: input.role === 'AGENT' ? 'AGENT' : 'OWNER',
  }
}

/** Tracking code shown to the reporter, e.g. "CR-7K2M9QX4". Unambiguous characters only. */
export function trackingCode(random: Uint8Array): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  return `CR-${[...random.slice(0, 8)].map((byte) => alphabet[byte % alphabet.length]).join('')}`
}

export const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/^CR-?/, 'CR-').slice(0, 20)
