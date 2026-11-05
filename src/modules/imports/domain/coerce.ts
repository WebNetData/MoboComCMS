/**
 * Typed values for an item: each mapped field is converted by its type, and
 * a value that cannot be converted becomes an error on that field only (the
 * rest of the record still imports). Pure.
 */
import { importedSlug } from '@/modules/imports/domain/slug'
import type { FieldDef, Message } from '@/modules/imports/domain/types'
import { isBlank, normalizeName, toBool, toCategoryPaths, toDate, toImages, toInt, toList, toMoney, toNumber, toText, toUrl, toDuration, ValueError } from '@/modules/imports/domain/values'

export type Coerced = { values: Record<string, unknown>; messages: Message[] }

const MAX: Partial<Record<FieldDef['type'], number>> = { text: 300, longtext: 20_000, html: 200_000 }

export function coerceField(field: FieldDef, raw: unknown, options: { categorySeparator?: string } = {}): unknown {
  if (field.type !== 'slug' && field.maxLength && typeof raw === 'string' && raw.length > field.maxLength) throw new ValueError(`حداکثر ${field.maxLength} نویسه مجاز است`)
  switch (field.type) {
    case 'text': return toText(raw, MAX.text)
    case 'longtext': return toText(raw, MAX.longtext)
    case 'html': return isBlank(raw) ? '' : String(Array.isArray(raw) ? raw.join('\n') : raw).slice(0, MAX.html)
    case 'slug': { const slug = importedSlug(raw); if (field.maxLength && slug.length > field.maxLength) throw new ValueError('نامک بیش از حد بلند است'); if (!isBlank(raw) && !slug) throw new ValueError('نامک باید حروف انگلیسی یا عدد داشته باشد'); return slug }
    case 'int': return toInt(raw)
    case 'number': return toNumber(raw)
    case 'money': return toMoney(raw)
    case 'bool': return toBool(raw)
    case 'date': return toDate(raw)
    case 'image': { const { urls, invalid } = toImages(raw, 1); if (!urls.length && invalid.length) throw new ValueError(`نشانی تصویر نامعتبر: ${invalid[0]}`); return urls[0] || '' }
    case 'images': return toImages(raw)
    case 'list': return toList(raw)
    case 'url': return toUrl(raw)
    case 'category': return toCategoryPaths(raw, options.categorySeparator || '>')
    case 'enum': {
      if (isBlank(raw)) return null
      const key = normalizeName(raw).replace(/\s+/g, '')
      const hit = (field.enum || []).find((item) => normalizeName(item.value).replace(/\s+/g, '') === key || normalizeName(item.label).replace(/\s+/g, '') === key)
      if (!hit) throw new ValueError(`«${toText(raw, 40)}» یکی از گزینه‌های مجاز نیست (${(field.enum || []).map((item) => item.label).join('، ')})`)
      return hit.value
    }
    case 'json': return raw
    case 'duration': return toDuration(raw)
  }
}

/** All mapped fields of an item, typed; blank source values are left out (they never overwrite anything). */
export function coerceValues(fields: FieldDef[], values: Record<string, unknown>, options: { categorySeparator?: string } = {}): Coerced {
  const out: Record<string, unknown> = {}
  const messages: Message[] = []
  for (const field of fields) {
    if (!(field.key in values)) continue
    const raw = values[field.key]
    if (isBlank(raw)) continue
    try {
      const value = coerceField(field, raw, options)
      if (field.type === 'images') {
        const images = value as { urls: string[]; invalid: string[] }
        for (const bad of images.invalid) messages.push({ level: 'warning', text: `${field.label}: ${bad}` })
        if (images.urls.length) out[field.key] = images.urls
        continue
      }
      if (value === null || value === '' || (Array.isArray(value) && !value.length)) continue
      out[field.key] = value
    } catch (error) {
      messages.push({ level: 'error', text: `${field.label}: ${error instanceof Error ? error.message : 'مقدار نامعتبر'}` })
    }
  }
  return { values: out, messages }
}
