/** Prompt-owned presentation metadata; Media still owns asset bytes and access. */
export const WEB_LAYOUTS = ['none', 'landing', 'dashboard'] as const
export type WebLayout = typeof WEB_LAYOUTS[number]
export type PromptShowcase = { cover: string; video: string; alt: string; caption: string; credit: string; result: string; webLayout: WebLayout; aspect: 'square' | 'portrait' | 'wide' }
export const EMPTY_SHOWCASE: PromptShowcase = { cover: '', video: '', alt: '', caption: '', credit: '', result: '', webLayout: 'none', aspect: 'square' }
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD') : ''
export class ShowcaseError extends Error {}
export function showcaseUrl(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 2048) throw new ShowcaseError('نشانی رسانه بیش از حد طولانی است')
  const raw = text(value, 2048)
  if (!raw) return ''
  if (/[\s\\]/.test(raw) || raw.startsWith('//')) throw new ShowcaseError('نشانی رسانه معتبر نیست')
  if (raw.startsWith('/')) {
    const parsed = new URL(raw, 'https://local.invalid')
    if (!/^\/(?:images\/|demo\/|files\/|api\/media\/(?:covers|transfers)\/)/.test(parsed.pathname) || /\.\.|%2e|%2f|%5c/i.test(raw)) throw new ShowcaseError('فایل را از مسیر عمومی یا کتابخانهٔ رسانه انتخاب کنید')
    return raw
  }
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new ShowcaseError('نشانی رسانه معتبر نیست') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443' || /^(?:localhost|.*\.localhost|.*\.local|\[.*\]|\d+(?:\.\d+)*)$/i.test(parsed.hostname)) throw new ShowcaseError('رسانهٔ بیرونی باید نشانی عمومی HTTPS داشته باشد')
  return parsed.href
}
export function normalizeShowcase(value: unknown): PromptShowcase {
  let raw = value
  if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { throw new ShowcaseError('اطلاعات نمونه معتبر نیست') } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ShowcaseError('اطلاعات نمونه باید یک شیء باشد')
  const obj = raw as Record<string, unknown>
  if (obj.webLayout !== undefined && !(WEB_LAYOUTS as readonly unknown[]).includes(obj.webLayout)) throw new ShowcaseError('نوع پیش‌نمایش وب معتبر نیست')
  return { cover: showcaseUrl(obj.cover), video: showcaseUrl(obj.video), alt: text(obj.alt, 300), caption: text(obj.caption, 1000), credit: text(obj.credit, 160), result: text(obj.result, 12000), webLayout: (obj.webLayout as WebLayout) || 'none', aspect: obj.aspect === 'portrait' || obj.aspect === 'wide' ? obj.aspect : 'square' }
}
export function hasShowcase(value: PromptShowcase) { return !!(value.cover || value.video || value.result || value.webLayout !== 'none') }
export function serializeShowcase(value: unknown) { const result = normalizeShowcase(value); return hasShowcase(result) ? JSON.stringify(result) : '{}' }
/** Old/corrupt optional metadata never becomes executable markup or a broken page. */
export function readShowcase(value: unknown): PromptShowcase { try { return normalizeShowcase(value || '{}') } catch { return { ...EMPTY_SHOWCASE } } }
