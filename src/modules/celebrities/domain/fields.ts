// An artist's facts beyond the biography (owner, 2026-10-28): country, born, died, and any field the owner adds. Pure.
//
// The fields are a managed list («فیلدهای پروفایل هنرمند», section `celebrities`): the owner adds, renames, orders,
// switches off and deletes them in the admin; an entry's family is its kind, which decides its input and display.
// A person's values live on the person (`Celebrity.facts`, JSON code → value) and survive a field switched off.

import type { ListDefinition, VocabularyEntry } from '@/modules/vocabulary/domain/vocabulary'

export const FIELD_FAMILIES: [string, string][] = [
  ['TEXT', 'متن کوتاه'],
  ['LONG', 'متن بلند'],
  ['DATE', 'تاریخ'],
  ['BIRTH', 'تاریخ تولد (سن نمایش داده می‌شود)'],
  ['DEATH', 'تاریخ درگذشت (سن هنگام درگذشت)'],
  ['COUNTRY', 'کشور'],
  ['NUMBER', 'عدد'],
  ['LINK', 'پیوند (نشانی اینترنتی)'],
]
export type FieldFamily = 'TEXT' | 'LONG' | 'DATE' | 'BIRTH' | 'DEATH' | 'COUNTRY' | 'NUMBER' | 'LINK'

export const CELEBRITY_LISTS: ListDefinition[] = [
  { section: 'celebrities', list: 'PROFILE_FIELD', title: 'فیلدهای پروفایل هنرمند', one: 'فیلد', icon: '🪪', codeRule: 'code', example: 'BIRTH_PLACE',
    hint: 'اطلاعاتی که برای هر هنرمند کنار بیوگرافی ثبت و در صفحهٔ او نشان داده می‌شود (کشور، زادروز، درگذشت…). نوع هر فیلد ورودی و نمایش آن را تعیین می‌کند؛ فیلد غیرفعال نه در فرم می‌آید نه در صفحه، اما مقدارهای ثبت‌شده‌اش می‌ماند.',
    codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً BIRTH_PLACE).', families: FIELD_FAMILIES,
    // The same three as migration 20270131120100_celebrity_profile_fields puts in the table.
    seeds: [['COUNTRY', 'کشور', 'Country', 'COUNTRY'], ['BIRTH_DATE', 'زادروز', 'Born', 'BIRTH'], ['DEATH_DATE', 'درگذشت', 'Died', 'DEATH']] },
]

/** Countries offered for a country field (the owner may also type another). */
export const COUNTRIES = [
  'ایران', 'افغانستان', 'تاجیکستان', 'ترکیه', 'آذربایجان', 'عراق', 'امارات متحده عربی', 'عربستان سعودی', 'مصر', 'لبنان', 'سوریه', 'اردن', 'پاکستان', 'هند',
  'چین', 'ژاپن', 'کرهٔ جنوبی', 'روسیه', 'اوکراین', 'آلمان', 'فرانسه', 'ایتالیا', 'اسپانیا', 'پرتغال', 'بریتانیا', 'ایرلند', 'هلند', 'بلژیک', 'سوئد',
  'نروژ', 'دانمارک', 'فنلاند', 'لهستان', 'اتریش', 'سوئیس', 'یونان', 'مجارستان', 'چک', 'ایالات متحده آمریکا', 'کانادا', 'مکزیک', 'برزیل', 'آرژانتین',
  'شیلی', 'کلمبیا', 'استرالیا', 'نیوزیلند', 'آفریقای جنوبی', 'نیجریه', 'مراکش', 'الجزایر', 'تونس',
]

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const YEAR = /^\d{4}$/

/** A day "YYYY-MM-DD" (Gregorian, as the Persian date picker writes it) or a year alone "YYYY"; '' when neither. */
export function cleanDate(value: unknown): string {
  const text = String(value ?? '').trim()
  if (YEAR.test(text)) return Number(text) >= 1000 && Number(text) <= 2100 ? text : ''
  const match = DAY.exec(text)
  if (!match) return ''
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1000 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : ''
}

const MAX: Record<FieldFamily, number> = { TEXT: 200, LONG: 2000, DATE: 10, BIRTH: 10, DEATH: 10, COUNTRY: 60, NUMBER: 30, LINK: 300 }

/** One value as its kind keeps it; '' when it is not one. */
export function cleanFact(family: string, value: unknown): string {
  const kind = (family in MAX ? family : 'TEXT') as FieldFamily
  if (kind === 'DATE' || kind === 'BIRTH' || kind === 'DEATH') return cleanDate(value)
  const text = kind === 'LONG' ? String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim() : String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (kind === 'NUMBER') { const number = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,]/g, ''); return /^-?\d+(?:\.\d+)?$/.test(number) ? number.slice(0, MAX.NUMBER) : '' }
  if (kind === 'LINK') { try { const url = new URL(text); return /^https?:$/.test(url.protocol) ? url.toString().slice(0, MAX.LINK) : '' } catch { return '' } }
  return text.slice(0, MAX[kind])
}

/** A person's facts from a form: only fields of the list (switched off ones too, so their values stay), each cleaned. */
export function normalizeFacts(input: unknown, fields: Pick<VocabularyEntry, 'code' | 'family'>[]): Record<string, string> {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const out: Record<string, string> = {}
  for (const field of fields) {
    if (!Object.hasOwn(raw, field.code)) continue
    const value = cleanFact(field.family, raw[field.code])
    if (value) out[field.code] = value
  }
  return out
}

/** The stored JSON of a person's facts (anything unreadable is none). */
export function parseFacts(stored: unknown): Record<string, string> {
  try {
    const value = typeof stored === 'string' ? JSON.parse(stored || '{}') : stored
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => /^[A-Z0-9_]{1,40}$/.test(key) && typeof item === 'string' && item).map(([key, item]) => [key, String(item)]))
  } catch { return {} }
}

const faDigits = (value: string | number) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** A date for the page: «۱۲ اردیبهشت ۱۳۳۷ (۱۹۵۸)», or «۱۹۵۸ میلادی» for a year alone. */
export function showDate(value: string): string {
  if (YEAR.test(value)) return `${faDigits(value)} میلادی`
  const match = DAY.exec(value)
  if (!match) return ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return `${date.toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })} (${faDigits(match[1])})`
}

/** Whole years between two dates (a year alone counts from its first day), or null when unknown or negative. */
export function yearsBetween(from: string, to: string): number | null {
  const parts = (value: string) => { if (YEAR.test(value)) return [Number(value), 1, 1]; const match = DAY.exec(value); return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null }
  const a = parts(from), b = parts(to)
  if (!a || !b) return null
  const years = b[0] - a[0] - (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2]) ? 1 : 0)
  return years >= 0 && years < 150 ? years : null
}

export type ShownFact = { code: string; label: string; icon: string; family: string; text: string; note: string; href?: string }

/**
 * The facts a person's page shows, in the list's order: active fields with a value. A birth date notes the age (or,
 * with a death date, nothing: the death notes the age then); a link shows its address's site.
 */
export function shownFacts(facts: Record<string, string>, fields: Pick<VocabularyEntry, 'code' | 'name' | 'icon' | 'family' | 'active'>[], today: string): ShownFact[] {
  const birth = fields.find((field) => field.family === 'BIRTH' && facts[field.code])
  const death = fields.find((field) => field.family === 'DEATH' && facts[field.code])
  return fields.filter((field) => field.active && facts[field.code]).map((field) => {
    const value = facts[field.code]
    const base = { code: field.code, label: field.name, icon: field.icon, family: field.family }
    if (field.family === 'DATE' || field.family === 'BIRTH' || field.family === 'DEATH') {
      let note = ''
      if (field.family === 'BIRTH' && !death) { const age = yearsBetween(value, today); if (age !== null) note = `${faDigits(age)} سال` }
      if (field.family === 'DEATH' && birth) { const age = yearsBetween(facts[birth.code], value); if (age !== null) note = `در ${faDigits(age)} سالگی` }
      return { ...base, text: showDate(value), note }
    }
    if (field.family === 'LINK') { let host = value; try { host = new URL(value).hostname.replace(/^www\./, '') } catch { /* stored values are cleaned */ } return { ...base, text: host, note: '', href: value } }
    if (field.family === 'NUMBER') return { ...base, text: faDigits(Number(value).toLocaleString('en-US')).replace(/,/g, '٬'), note: '' }
    return { ...base, text: value, note: '' }
  })
}
