import { isIP } from 'node:net'
import { normalizeRating, normalizeReviewBody } from '@/modules/reviews/domain/reviews'

export class BusinessError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Identifies a public business; normalization never fetches the submitted website. */
export function normalizeBusinessWebsite(input: unknown): { domain: string; website: string } {
  if (typeof input !== 'string' || input.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(input.trim())) throw new BusinessError('نشانی سایت معتبر نیست')
  const value = input.trim()
  let url: URL
  try { url = new URL(value.includes('://') ? value : `https://${value}`) } catch { throw new BusinessError('نشانی سایت معتبر نیست') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new BusinessError('نشانی عمومی سایت را بدون اطلاعات ورود یا پورت وارد کنید')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, ''), domain = hostname.replace(/^www\./, '')
  if (isIP(hostname) || hostname.startsWith('[') || domain.length > 253 || !domain.includes('.') || /\.(local|localhost|internal)$/.test(domain) || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^\d+$/.test(domain.split('.').at(-1) || '')) throw new BusinessError('دامنهٔ عمومی کسب‌وکار معتبر نیست')
  return { domain, website: `${url.protocol}//${hostname}/` }
}

/** External experience requires meaningful text; a client cannot create a verified badge. */
export function normalizeBusinessExperience(input: { rating: unknown; body?: unknown; experiencedOn?: unknown }, now = new Date()) {
  const rating = normalizeRating(input.rating), body = normalizeReviewBody(input.body)
  if (!body) throw new BusinessError('تجربهٔ خود را همراه امتیاز بنویسید')
  const raw = input.experiencedOn
  let experiencedOn: string | null = null
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new BusinessError('تاریخ تجربه معتبر نیست')
    const parsed = new Date(`${raw}T00:00:00.000Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw || raw > now.toISOString().slice(0, 10)) throw new BusinessError('تاریخ تجربه معتبر نیست')
    experiencedOn = raw
  }
  return { rating, body, experiencedOn }
}
