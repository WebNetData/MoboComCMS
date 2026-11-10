// Section-aware auto-fill: an editor pastes raw material (a press release, a
// store listing, notes…) and the assistant fills that section's own fields.
// Pure: the prompt, and strict parsing/cleaning of the answer per field type.
// Nothing here saves anything — the editor reviews the filled form first.

import { NATURAL_STYLE, type Prompt } from '@/modules/ai/domain/ai'

export type AutofillFieldType = 'text' | 'textarea' | 'richtext' | 'number' | 'checkbox' | 'select' | 'multiselect' | 'date' | 'records' | 'slug'

export type AutofillField = {
  key: string
  label: string
  type: AutofillFieldType
  /** Allowed values for select/multiselect (value → label). */
  options?: { value: string; label: string }[]
  /** Sub-fields of a records list (e.g. cast: name, role). */
  recordKeys?: { key: string; label: string }[]
  hint?: string
  dir?: 'ltr' | 'rtl'
}

export const AUTOFILL_SECTIONS: Record<string, string> = {
  'cinema-titles': 'فیلم یا سریال (بخش فیلم و سریال)',
  'music-tracks': 'آهنگ (بخش موزیک)',
  'music-albums': 'آلبوم موسیقی',
  'music-artists': 'هنرمند / خواننده',
  'cinema-people': 'بازیگر یا کارگردان (بخش فیلم و سریال)',
  celebrities: 'پروفایل یک هنرمند یا چهرهٔ مشهور (مشترک بین موسیقی و فیلم و سریال)',
  'music-playlists': 'پلی‌لیست موسیقی',
  software: 'نرم‌افزار (بخش دانلود نرم‌افزار، به سبک سافت‌گذار)',
  games: 'بازی (پرتال بازی، به سبک گیم‌آپ)',
  posts: 'مقاله یا خبر مجله',
  pages: 'صفحهٔ سایت',
  products: 'محصول فروشگاه',
  businesses: 'پروفایل یک کسب‌وکار یا فروشگاه (بخش تجربهٔ خرید)',
}

const MAX_FIELDS = 60
const MAX_SOURCE = 24_000

/** Fields the model may fill; anything else (images, links, ids…) is left to the editor. */
export function cleanSchema(input: unknown): AutofillField[] {
  const types: AutofillFieldType[] = ['text', 'textarea', 'richtext', 'number', 'checkbox', 'select', 'multiselect', 'date', 'records', 'slug']
  const list = Array.isArray(input) ? input : []
  const out: AutofillField[] = []
  const seen = new Set<string>()
  for (const raw of list.slice(0, MAX_FIELDS)) {
    const row = (raw || {}) as Record<string, unknown>
    const key = String(row.key || '')
    const type = String(row.type || '') as AutofillFieldType
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) || seen.has(key) || !types.includes(type)) continue
    seen.add(key)
    const options = Array.isArray(row.options) ? row.options.slice(0, 400).map((o) => ({ value: String((o as Record<string, unknown>)?.value ?? '').slice(0, 80), label: String((o as Record<string, unknown>)?.label ?? '').slice(0, 120) })).filter((o) => o.value !== '' || o.label !== '') : undefined
    const recordKeys = Array.isArray(row.recordKeys) ? row.recordKeys.slice(0, 8).map((r) => ({ key: String((r as Record<string, unknown>)?.key || ''), label: String((r as Record<string, unknown>)?.label || '').slice(0, 60) })).filter((r) => /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(r.key)) : undefined
    if ((type === 'select' || type === 'multiselect') && !options?.length) continue
    if (type === 'records' && !recordKeys?.length) continue
    out.push({ key, label: String(row.label || key).slice(0, 120), type, options, recordKeys, hint: row.hint ? String(row.hint).slice(0, 200) : undefined, dir: row.dir === 'ltr' ? 'ltr' : undefined })
  }
  return out
}

function describe(field: AutofillField): string {
  const kind: Record<AutofillFieldType, string> = {
    text: 'متن یک‌خطی', textarea: 'متن چندخطی', richtext: 'متن HTML (فقط <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>)', number: 'عدد', checkbox: 'true یا false',
    select: 'یکی از مقادیر مجاز', multiselect: 'آرایه‌ای از مقادیر مجاز', date: 'تاریخ میلادی YYYY-MM-DD', records: 'آرایه‌ای از شیء‌ها', slug: 'نامک انگلیسی با حروف کوچک و خط تیره',
  }
  let line = `- "${field.key}" (${field.label}) — ${kind[field.type]}`
  if (field.options) line += `؛ مقادیر مجاز: ${field.options.map((o) => `"${o.value}"=${o.label}`).join('، ')}`
  if (field.recordKeys) line += `؛ کلیدهای هر شیء: ${field.recordKeys.map((r) => `"${r.key}"=${r.label}`).join('، ')}`
  if (field.dir === 'ltr') line += '؛ به انگلیسی/لاتین'
  if (field.hint) line += `؛ نکته: ${field.hint}`
  return line
}

export function autofillPrompt(input: { brand: string; voice: string; section: string; fields: AutofillField[]; source: string; current: Record<string, unknown> }): Prompt {
  const section = AUTOFILL_SECTIONS[input.section] || input.section
  const filled = Object.entries(input.current).filter(([key, value]) => input.fields.some((f) => f.key === key) && value !== '' && value !== null && value !== undefined && !(Array.isArray(value) && !value.length) && value !== false)
  return {
    system:
      `تو ویراستار ارشد محتوای سایت «${input.brand}» هستی و فرم انتشار «${section}» را از روی منبع کامل می‌کنی. لحن: ${input.voice}\n` +
      'قواعد سخت:\n' +
      '- فقط از اطلاعاتِ منبع و دانستهٔ قطعی و عمومی استفاده کن. قیمت، آمار، تاریخ، امتیاز، حجم، نسخه یا مشخصاتی که مطمئن نیستی را خالی بگذار (کلید را نفرست).\n' +
      '- متن‌های فارسی را روان، دقیق و سئوشده بنویس؛ نام‌های خاص انگلیسی را در فیلدهای لاتین به انگلیسی بنویس.\n' +
      '- خروجی فقط یک شیء JSON داخل تگ <json>…</json> باشد؛ هیچ متن دیگری ننویس.\n' +
      '- برای هر فیلد فقط نوعِ خواسته‌شده را برگردان. برای انتخابی‌ها فقط از «مقادیر مجاز» استفاده کن.\n' +
      '- در کلید ویژهٔ "_notes" در یک یا دو جملهٔ فارسی بگو چه چیزی را نتوانستی از منبع دربیاوری تا ویراستار بررسی کند.\n' +
      NATURAL_STYLE,
    user:
      `فیلدهای فرم:\n${input.fields.map(describe).join('\n')}\n\n` +
      (filled.length ? `مقادیری که ویراستار از قبل وارد کرده (تغییرشان نده مگر اشتباه باشد):\n${JSON.stringify(Object.fromEntries(filled)).slice(0, 4000)}\n\n` : '') +
      `منبع:\n"""\n${input.source.slice(0, MAX_SOURCE)}\n"""`,
    maxTokens: 6000,
  }
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const latinDigits = (value: string) => value.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))

/** The JSON object inside <json>…</json> (or the first {...} block). */
export function extractJson(text: string): Record<string, unknown> | null {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i)?.[1]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidates = [tagged, fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter((c): c is string => !!c && c.includes('{'))
  for (const candidate of candidates) {
    try { const value = JSON.parse(candidate.trim()); if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown> } catch { /* try next */ }
  }
  return null
}

const ALLOWED_TAGS = /^(p|h2|h3|h4|ul|ol|li|strong|b|em|i|blockquote|br|code|pre)$/i
/** Keeps a small safe set of tags without attributes (the server also runs the site sanitizer). */
export function safeHtml(value: string): string {
  return value
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (tag, name: string) => (ALLOWED_TAGS.test(name) ? (tag.startsWith('</') ? `</${name.toLowerCase()}>` : `<${name.toLowerCase()}>`) : ''))
    .trim()
}

const text = (value: unknown, max: number) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\u0000/g, '').trim().slice(0, max) : '')

/** Cleans one proposed value; undefined = drop it. */
export function cleanValue(field: AutofillField, value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  switch (field.type) {
    case 'text': { const v = text(value, 300).replace(/\s+/g, ' '); return v || undefined }
    case 'slug': { const v = text(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return v || undefined }
    case 'textarea': { const v = text(value, 8000); return v || undefined }
    case 'richtext': { const v = safeHtml(text(value, 60_000)); return v.replace(/<[^>]+>/g, '').trim() ? v : undefined }
    case 'number': { const n = Number(latinDigits(String(value)).replace(/[,٬\s]/g, '')); return Number.isFinite(n) ? n : undefined }
    case 'checkbox': return value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined
    case 'date': { const v = latinDigits(text(value, 30)); return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : undefined }
    case 'select': {
      const v = text(value, 120)
      const hit = field.options?.find((o) => o.value === v) || field.options?.find((o) => o.label === v)
      return hit ? hit.value : undefined
    }
    case 'multiselect': {
      const list = Array.isArray(value) ? value : [value]
      const values = [...new Set(list.map((item) => { const v = text(item, 120); return (field.options?.find((o) => o.value === v) || field.options?.find((o) => o.label === v))?.value }).filter((v): v is string => v !== undefined))]
      return values.length ? values : undefined
    }
    case 'records': {
      if (!Array.isArray(value)) return undefined
      const rows = value.slice(0, 40).map((item) => {
        const row = (item || {}) as Record<string, unknown>
        return Object.fromEntries((field.recordKeys || []).map((r) => [r.key, text(row[r.key], 400)]))
      }).filter((row) => Object.values(row).some(Boolean))
      return rows.length ? rows : undefined
    }
  }
}

export type AutofillResult = { values: Record<string, unknown>; filled: string[]; notes: string }

export function parseAutofill(textOut: string, fields: AutofillField[]): AutofillResult {
  const raw = extractJson(textOut)
  if (!raw) return { values: {}, filled: [], notes: '' }
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const cleaned = cleanValue(field, raw[field.key])
    if (cleaned !== undefined) values[field.key] = cleaned
  }
  return { values, filled: Object.keys(values), notes: text(raw._notes, 600) }
}
