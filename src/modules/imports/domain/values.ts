/**
 * Turning untrusted cell values into typed values: numbers written with
 * Persian digits and separators, Jalali or Excel dates, yes/no words, lists,
 * image lists and category paths. Pure functions.
 */
import { excelSerialDate } from '@/modules/imports/domain/parse'
import { LIMITS } from '@/modules/imports/domain/types'

export class ValueError extends Error {}

const PERSIAN_DIGITS = /[۰-۹٠-٩]/g
export const latinDigits = (text: string) => text.replace(PERSIAN_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))

import { isBlank, toText } from '@/modules/imports/domain/text'
export { isBlank, toText } from '@/modules/imports/domain/text'

/** "۱۲۵٬۰۰۰٬۰۰۰ تومان", "1,250.50", 1250 → a finite number (null when blank). */
export function toNumber(value: unknown): number | null {
  if (isBlank(value)) return null
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new ValueError('عدد نامعتبر'); return value }
  let text = latinDigits(String(value)).replace(/[٬،,\s']/g, '').replace(/٫/g, '.')
  text = text.replace(/(تومان|ریال|toman|rial|irt|irr|usd|eur|\$|€)/gi, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new ValueError(`«${String(value).slice(0, 40)}» عدد نیست`)
  const n = Number(text)
  if (!Number.isFinite(n)) throw new ValueError('عدد نامعتبر')
  return n
}

export function toInt(value: unknown, min = -2_147_483_648, max = 2_147_483_647): number | null {
  const n = toNumber(value)
  if (n === null) return null
  if (!Number.isInteger(n)) throw new ValueError(`«${n}» عدد صحیح نیست`)
  if (n < min || n > max) throw new ValueError(`«${n}» خارج از بازهٔ مجاز است`)
  return n
}

/** A money amount as a decimal string ("125000000", "19.99"); must be positive when given. */
export function toMoney(value: unknown): string | null {
  const n = toNumber(value)
  if (n === null) return null
  if (n <= 0) throw new ValueError('مبلغ باید بیشتر از صفر باشد')
  if (n > 1e15) throw new ValueError('مبلغ بیش از حد بزرگ است')
  return String(n)
}

const TRUE = new Set(['1', 'true', 'yes', 'y', 'on', 'active', 'published', 'publish', 'enabled', 'instock', 'بله', 'آری', 'فعال', 'منتشر', 'منتشرشده', 'دارد', 'موجود'])
const FALSE = new Set(['0', 'false', 'no', 'n', 'off', 'inactive', 'draft', 'disabled', 'outofstock', 'خیر', 'نه', 'غیرفعال', 'پیش‌نویس', 'پیشنویس', 'ندارد', 'ناموجود'])

export function toBool(value: unknown): boolean | null {
  if (isBlank(value)) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const key = latinDigits(String(value)).toLowerCase().replace(/[\s_-]+/g, '')
  if (TRUE.has(key)) return true
  if (FALSE.has(key)) return false
  throw new ValueError(`«${String(value).slice(0, 30)}» بله/خیر نیست`)
}

/** Jalali (Persian calendar) → Gregorian [year, month, day] (the jdf algorithm). */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  let gy = 400 * Math.floor(days / 146097)
  days %= 146097
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524)
    days %= 36524
    if (days >= 365) days++
  }
  gy += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days > 365) {
    gy += Math.floor((days - 1) / 365)
    days = (days - 1) % 365
  }
  let gd = days + 1
  const months = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  for (gm = 0; gm < 13 && gd > months[gm]; gm++) gd -= months[gm]
  return [gy, gm, gd]
}

/** ISO dates, "2024-05-01 10:00", Jalali "1403/02/12", Excel serial numbers and Unix times. */
export function toDate(value: unknown): Date | null {
  if (isBlank(value)) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'number') {
    const d = value > 10_000_000_000 ? new Date(value) : value > 100_000_000 ? new Date(value * 1000) : excelSerialDate(value)
    if (!d || !Number.isFinite(d.getTime())) throw new ValueError('تاریخ نامعتبر')
    return d
  }
  const text = latinDigits(String(value)).trim()
  const jalali = /^(1[2-4]\d\d)[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(text)
  if (jalali) {
    const [gy, gm, gd] = jalaliToGregorian(Number(jalali[1]), Number(jalali[2]), Number(jalali[3]))
    const d = new Date(Date.UTC(gy, gm - 1, gd, Number(jalali[4] || 0), Number(jalali[5] || 0)))
    if (Number(jalali[2]) < 1 || Number(jalali[2]) > 12 || Number(jalali[3]) < 1 || Number(jalali[3]) > 31) throw new ValueError(`تاریخ شمسی نامعتبر: ${text}`)
    return d
  }
  if (/^\d{4}$/.test(text)) return new Date(Date.UTC(Number(text), 0, 1))
  const d = new Date(text)
  if (!Number.isFinite(d.getTime())) throw new ValueError(`تاریخ نامعتبر: ${text.slice(0, 40)}`)
  if (d.getUTCFullYear() < 1800 || d.getUTCFullYear() > 2200) throw new ValueError(`سال تاریخ خارج از بازه است: ${text.slice(0, 40)}`)
  return d
}

/** Seconds from "3:45", "1:02:03", "225" (seconds) or "3m 45s". */
export function toDuration(value: unknown): number | null {
  if (isBlank(value)) return null
  if (typeof value === 'number') { if (!Number.isFinite(value) || value < 0 || value > 36_000) throw new ValueError(`مدت نامعتبر: ${value}`); return Math.round(value) }
  const text = latinDigits(toText(value, 40)).trim().toLowerCase()
  let seconds: number | null = null
  if (/^\d+(\.\d+)?$/.test(text)) seconds = Math.round(Number(text))
  else if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(':').map(Number)
    if (parts.slice(1).some((p) => p > 59)) throw new ValueError(`مدت نامعتبر: ${text}`)
    seconds = parts.reduce((total, part) => total * 60 + part, 0)
  } else {
    const m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/.exec(text)
    if (m && (m[1] || m[2] || m[3])) seconds = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
  }
  if (seconds === null || seconds > 36_000) throw new ValueError(`مدت نامعتبر: ${text}`)
  return seconds
}

/** A list from an array or "a, b ، c | d". */
export function toList(value: unknown, max = 50): string[] {
  if (isBlank(value)) return []
  const items = Array.isArray(value) ? value.map((item) => (item && typeof item === 'object' ? toText((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).title ?? (item as Record<string, unknown>).value ?? '') : toText(item))) : String(value).split(/[,،|;\n]/)
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, max)
}

/** http(s) URL or a site path; anything else (javascript:, data:, file:…) is refused. */
export function toUrl(value: unknown): string {
  const text = toText(value, 2048)
  if (!text) return ''
  if (/^\/(?!\/)[^\s<>"'\\]*$/.test(text)) return text
  let url: URL
  try { url = new URL(text) } catch { throw new ValueError(`نشانی نامعتبر: ${text.slice(0, 60)}`) }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ValueError(`فقط نشانی http/https مجاز است: ${text.slice(0, 60)}`)
  if (/[\s<>"'\\]/.test(text)) throw new ValueError(`نشانی نامعتبر: ${text.slice(0, 60)}`)
  return url.toString()
}

/** Image addresses from a list, a list of objects ({url} / {src}) or a separated string. */
export function toImages(value: unknown, max: number = LIMITS.imagesPerItem): { urls: string[]; invalid: string[] } {
  if (isBlank(value)) return { urls: [], invalid: [] }
  const raw = Array.isArray(value)
    ? value.map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).src ?? (item as Record<string, unknown>).image ?? '' : item))
    : String(value).split(/[\s,|;]+(?=https?:|\/)/)
  const urls: string[] = [], invalid: string[] = []
  for (const item of raw) {
    const text = toText(item, 2048)
    if (!text) continue
    try { const url = toUrl(text); if (!urls.includes(url)) urls.push(url) } catch { invalid.push(text.slice(0, 80)) }
  }
  if (urls.length > max) invalid.push(`${urls.length - max} تصویر بیش از سقف ${max}`)
  return { urls: urls.slice(0, max), invalid }
}

/** "Electronics > Mobile > Apple" (or a list) → ["Electronics", "Mobile", "Apple"]. */
export function toCategoryPath(value: unknown, separator = '>'): string[] {
  if (isBlank(value)) return []
  const parts = Array.isArray(value) ? value.map((item) => toText(item, 120)) : toText(value, 600).split(separator === '>' ? /\s*(?:>|»|›)\s*/ : separator)
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6)
}

/** Several category paths in one cell ("A > B, C > D") → the paths. */
export function toCategoryPaths(value: unknown, separator = '>'): string[][] {
  if (isBlank(value)) return []
  if (Array.isArray(value)) {
    if (value.every((item) => Array.isArray(item))) return (value as unknown[][]).map((path) => toCategoryPath(path, separator)).filter((path) => path.length)
    const joined = value.map((item) => toText(item, 600))
    return joined.some((item) => item.includes(separator)) ? joined.map((item) => toCategoryPath(item, separator)).filter((p) => p.length) : [toCategoryPath(joined, separator)].filter((p) => p.length)
  }
  return toText(value, 2000).split(/\s*[,،;|]\s*/).map((item) => toCategoryPath(item, separator)).filter((path) => path.length)
}

/** Comparable form of a name: case, spacing, Arabic ی/ک, ZWNJ and digit forms do not matter. */
export function normalizeName(value: unknown): string {
  return latinDigits(String(value ?? '')).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f\u200e]/g, ' ').replace(/[\s_\-–—]+/g, ' ').trim()
}

/** Comparable attribute value: "256GB", "256 GB", "256gb" and "۲۵۶ گیگ" compare equal when unit words match. */
export function normalizeValue(value: unknown): string {
  return normalizeName(value).replace(/گیگابایت|گیگ/g, 'gb').replace(/ترابایت|ترا/g, 'tb').replace(/مگاپیکسل/g, 'mp').replace(/\s+/g, '')
}

/** Latin URL slug ('' when nothing Latin is left). */
export function latinSlug(value: unknown, max = 100): string {
  return latinDigits(String(value ?? '')).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '')
}

/** Short stable hash (FNV-1a, base36) for generated keys that must not change between runs. */
export function stableHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

/** Key for an attribute definition from its label ("Internal Storage" → "internal_storage", Persian → "attr_x1y2"). */
export function attributeKey(label: string): string {
  const latin = latinSlug(label, 36).replace(/-/g, '_')
  const key = /^[a-z]/.test(latin) ? latin : latin ? `a_${latin}` : `attr_${stableHash(normalizeName(label))}`
  return key.slice(0, 40)
}
