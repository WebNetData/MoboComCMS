/** Optional first-party entry hosts. Canonical content, identity and paths stay on the main site. */
export type SectionHosts = Record<string, string>
export type HostSection = { module: string; base: string }
export class SectionHostError extends Error { constructor(message: string, readonly status = 422) { super(message) } }
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/
export function mainSiteOrigin(input: string | undefined): string {
  try { const u = new URL(input || ''); return /^https?:$/.test(u.protocol) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : '' } catch { return '' }
}
export function checkSectionHosts(input: unknown, sections: HostSection[], origin: string): SectionHosts {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SectionHostError('تنظیم ساب‌دامنه‌ها معتبر نیست')
  const result: SectionHosts = {}, seen = new Set<string>(), own = new Set(sections.map(s => s.base))
  const main = mainSiteOrigin(origin), parent = main ? new URL(main).hostname.replace(/^www\./, '') : ''
  for (const [base, raw] of Object.entries(input)) {
    if (!own.has(base) || typeof raw !== 'string') throw new SectionHostError('ساب‌دامنه باید به مسیر عمومی همین بخش متصل باشد')
    const host = raw.trim().toLowerCase()
    if (!host) continue
    if (!parent || !HOST.test(host) || host.length > 253 || !host.endsWith('.' + parent) || host === 'www.' + parent || host === new URL(main).hostname)
      throw new SectionHostError('نام کامل یک ساب‌دامنهٔ همین سایت را بدون https، مسیر، پورت یا ستاره وارد کنید')
    if (seen.has(host)) throw new SectionHostError('این ساب‌دامنه به بخش دیگری متصل است', 409)
    seen.add(host); result[base] = host
  }
  return result
}
const under = (path: string, base: string) => path === base || path.startsWith(base + '/')
/** Static assets and public API requests retain existing route/origin/auth guards. */
export function sectionHostRoute(input: { host: string; path: string; hosts: SectionHosts; sections: HostSection[]; aliases: Record<string, string>; origin: string }) {
  const main = mainSiteOrigin(input.origin)
  if (!main || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(input.host)) return null
  const host = input.host.toLowerCase().split(':')[0]
  if (host === new URL(main).hostname) return null
  const base = Object.keys(input.hosts).find(base => input.hosts[base] === host), section = input.sections.find(s => s.base === base)
  if (!base || !section) return null
  const cloudBase = input.aliases['/cloud'] || '/cloud'
  if (under(input.path, '/cloud/dashboard') || under(input.path, cloudBase + '/dashboard')) return { kind: 'redirect' as const, path: input.path.replace(cloudBase + '/dashboard','/cloud/dashboard'), origin: main, base, module: section.module }
  if (/^\/(admin|dashboard|login|register|welcome|reset-password|forgot-password|checkout|invoice)(\/|$)/.test(input.path) || /^\/(pay\/merchant|api\/auth)(\/|$)/.test(input.path)) return { kind: 'redirect' as const, path: input.path, origin: main, base, module: section.module }
  if (/^\/(api|_next|dl|files|uploads)(\/|$)/.test(input.path) || /\.[a-z0-9]{1,8}$/i.test(input.path)) return { kind: 'pass' as const, base, module: section.module }
  if (input.path === '/') return { kind: 'rewrite' as const, path: base, base, module: section.module }
  const primary = input.aliases[base] || base
  if (input.path === base || input.path === primary) return { kind: 'redirect' as const, path: '/', origin: null, base, module: section.module }
  const sameModule = input.sections.filter(s => s.module === section.module)
  if (sameModule.some(s => under(input.path, s.base) || under(input.path, input.aliases[s.base] || s.base))) return { kind: 'pass' as const, base, module: section.module }
  return { kind: 'redirect' as const, path: input.path, origin: main, base, module: section.module }
}
