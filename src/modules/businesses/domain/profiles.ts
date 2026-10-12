import { BusinessError, normalizeBusinessWebsite } from './businesses'
import { plainText } from '@/shared/text/plain'

export const BUSINESS_KINDS = ['EXTERNAL', 'SELLER', 'SITE'] as const
export type BusinessKind = typeof BUSINESS_KINDS[number]
const text = (value: unknown, maximum: number) => {
  if (typeof value !== 'string') throw new BusinessError('متن معتبر نیست')
  const cleaned = plainText(value).trim()
  if (cleaned.length > maximum) throw new BusinessError('متن بیش از حد طولانی است')
  return cleaned
}
export const businessId = (value: unknown) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new BusinessError('شناسه معتبر نیست')
  return id
}
export function normalizeBusinessProfile(input: Record<string, unknown>) {
  const kind = input.kind as BusinessKind
  if (!BUSINESS_KINDS.includes(kind)) throw new BusinessError('نوع کسب‌وکار معتبر نیست')
  const name = text(input.name, 120), slug = text(input.slug, 80)
  if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BusinessError('نام و شناسهٔ لاتین معتبر وارد کنید')
  if (!['DRAFT', 'PUBLISHED'].includes(String(input.status))) throw new BusinessError('وضعیت معتبر نیست')
  const website = kind === 'EXTERNAL' ? normalizeBusinessWebsite(input.website) : { domain: null, website: '' }
  if (kind !== 'SELLER' && input.sellerId) throw new BusinessError('فروشنده فقط برای پروفایل داخلی تعیین می‌شود')
  if (kind === 'SELLER' && input.representativeId) throw new BusinessError('نمایندهٔ فروشنده از حساب خودش تعیین می‌شود')
  return { name, slug, kind, ...website, category: text(input.category ?? '', 80), description: text(input.description ?? '', 2000), status: String(input.status), sellerId: kind === 'SELLER' ? businessId(input.sellerId) : null, representativeId: kind !== 'SELLER' && input.representativeId ? businessId(input.representativeId) : null }
}
