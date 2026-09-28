// Trust seals (eNamad, Samandehi, and any other badge) shown in the site footer.
// The admin pastes the embed code the issuer gives; only its link and image
// address are kept, so no third-party HTML or script ever reaches the page.

export type TrustSealKind = 'enamad' | 'samandehi' | 'custom'
export type TrustSeal = { id: string; kind: TrustSealKind; title: string; href: string; image: string; enabled: boolean }
export type TrustSealsConfig = { enabled: boolean; title: string; seals: TrustSeal[] }

export const DEFAULT_TRUST_SEALS: TrustSealsConfig = { enabled: true, title: 'مجوزها و نمادهای اعتماد', seals: [] }

const ISSUER_HOSTS: Record<Exclude<TrustSealKind, 'custom'>, string[]> = {
  enamad: ['trustseal.enamad.ir', 'enamad.ir', 'www.enamad.ir'],
  samandehi: ['logo.samandehi.ir', 'samandehi.ir', 'www.samandehi.ir'],
}

export const SEAL_LABELS: Record<TrustSealKind, string> = { enamad: 'نماد اعتماد الکترونیکی (اینماد)', samandehi: 'نشان ساماندهی', custom: 'نماد یا مجوز دیگر' }

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

/** An https URL (optionally limited to some hosts), or ''. */
export function safeSealUrl(input: unknown, hosts?: string[]): string {
  const raw = decode(String(input ?? '')).slice(0, 600)
  let url: URL
  try { url = new URL(raw.startsWith('//') ? `https:${raw}` : raw) } catch { return '' }
  if (url.protocol !== 'https:' || url.username || url.password) return ''
  if (hosts && !hosts.includes(url.hostname.toLowerCase())) return ''
  return url.toString()
}

const attr = (code: string, name: string) => code.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || ''

/** Reads the issuer's embed code: the verification link and the logo address. */
export function parseSealCode(code: unknown): { kind: TrustSealKind; href: string; image: string } | null {
  const text = String(code ?? '').slice(0, 4000)
  const image = attr(text, 'src')
  // eNamad wraps the logo in a link; Samandehi opens its page from an onclick.
  const href = attr(text, 'href') || text.match(/window\.open\(\s*(["'])(.*?)\1/i)?.[2] || ''
  const host = (value: string) => { try { return new URL(decode(value).startsWith('//') ? `https:${decode(value)}` : decode(value)).hostname.toLowerCase() } catch { return '' } }
  const kind: TrustSealKind = [host(image), host(href)].some((item) => ISSUER_HOSTS.enamad.includes(item)) ? 'enamad'
    : [host(image), host(href)].some((item) => ISSUER_HOSTS.samandehi.includes(item)) ? 'samandehi' : 'custom'
  const hosts = kind === 'custom' ? undefined : ISSUER_HOSTS[kind]
  const cleanImage = safeSealUrl(image, hosts)
  if (!cleanImage) return null
  return { kind, href: safeSealUrl(href, hosts), image: cleanImage }
}

export function normalizeTrustSeals(input: unknown): TrustSealsConfig {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const list = Array.isArray(raw.seals) ? raw.seals : []
  const seen = new Set<string>()
  const seals: TrustSeal[] = []
  for (const item of list.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue
    const seal = item as Record<string, unknown>
    const kind: TrustSealKind = seal.kind === 'enamad' || seal.kind === 'samandehi' ? seal.kind : 'custom'
    const hosts = kind === 'custom' ? undefined : ISSUER_HOSTS[kind]
    const image = safeSealUrl(seal.image, hosts)
    if (!image) continue
    let id = String(seal.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || `seal-${seals.length + 1}`
    while (seen.has(id)) id = `${id}-${seals.length + 1}`
    seen.add(id)
    seals.push({ id, kind, title: String(seal.title ?? '').trim().slice(0, 80) || SEAL_LABELS[kind], href: safeSealUrl(seal.href, hosts), image, enabled: seal.enabled !== false })
  }
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_TRUST_SEALS.enabled,
    title: String(raw.title ?? DEFAULT_TRUST_SEALS.title).trim().slice(0, 80),
    seals,
  }
}

/** What the public footer renders. */
export const visibleSeals = (config: TrustSealsConfig) => config.enabled ? config.seals.filter((seal) => seal.enabled) : []
