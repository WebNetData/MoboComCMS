// Plugin & theme repository rules: license keys, sites, certificates, products and what a license entitles to.
// Pure functions with no imports (the signing itself lives in server/crypto.ts).

export class RepoError extends Error {
  constructor(message: string, readonly status = 400, readonly meta: Record<string, unknown> = {}) { super(message) }
}

// ------------------------------------------------------------------ versions

const SEMVER = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,40}))?$/

export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a), y = SEMVER.exec(b)
  if (!x || !y) throw new RepoError('نسخه معتبر نیست')
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) < Number(y[i]) ? -1 : 1
  if (!x[4] || !y[4]) return x[4] === y[4] ? 0 : x[4] ? -1 : 1
  return x[4] < y[4] ? -1 : x[4] > y[4] ? 1 : 0
}
export const isVersion = (value: unknown): value is string => typeof value === 'string' && SEMVER.test(value)

// ------------------------------------------------------------------ license keys

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32: no I, L, O or U
export const KEY_PREFIX = 'MBC'

/** 20 characters (100 bits) from random bytes, written as MBC-XXXXX-XXXXX-XXXXX-XXXXX. */
export function licenseKeyFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 20) throw new RepoError('بایت تصادفی کافی نیست', 500)
  let body = ''
  for (let i = 0; i < 20; i++) body += ALPHABET[bytes[i] & 31]
  return `${KEY_PREFIX}-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15)}`
}

/** What a person typed → the canonical key, or '' when it cannot be a key (look-alike letters are fixed). */
export function normalizeLicenseKey(input: unknown): string {
  const raw = String(input ?? '').toUpperCase().replace(/[\s-]+/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V')
  if (!raw.startsWith(KEY_PREFIX) || raw.length !== KEY_PREFIX.length + 20) return ''
  const body = raw.slice(KEY_PREFIX.length)
  if ([...body].some((c) => !ALPHABET.includes(c))) return ''
  return `${KEY_PREFIX}-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15)}`
}
export const maskKey = (last5: string) => `${KEY_PREFIX}-•••••-•••••-•••••-${last5.slice(-5)}`

// ------------------------------------------------------------------ sites and addresses

/** "https://Shop.Example.com:8443/path" or "shop.example.com" → "shop.example.com" (the host a license is bound to). */
export function normalizeSiteHost(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw || raw.length > 300) throw new RepoError('نشانی سایت معتبر نیست')
  let host = raw
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) { try { host = new URL(raw).hostname } catch { throw new RepoError('نشانی سایت معتبر نیست') } } else host = raw.split(/[/?#:]/)[0]
  host = host.replace(/\.$/, '')
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) throw new RepoError('نشانی سایت معتبر نیست')
  return host
}

const PRIVATE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\..*|10\..*|0\..*|169\.254\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|::1|\[.*)$/

/** The address of a repository this site talks to: https and public (development may allow http/private hosts). */
export function safeRepositoryUrl(value: unknown, options: { allowPrivate?: boolean } = {}): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let url: URL
  try { url = new URL(raw) } catch { throw new RepoError('نشانی مخزن معتبر نیست') }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!options.allowPrivate) {
    if (url.protocol !== 'https:') throw new RepoError('نشانی مخزن باید https باشد')
    if (!host || PRIVATE.test(host)) throw new RepoError('نشانی مخزن نباید محلی یا خصوصی باشد')
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new RepoError('نشانی مخزن معتبر نیست')
  if (url.username || url.password) throw new RepoError('نشانی مخزن نباید نام کاربری داشته باشد')
  return url.origin
}

// ------------------------------------------------------------------ products

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

export interface ProductData {
  slug: string; kind: 'PLUGIN' | 'THEME'; name: string; summary: string; description: string; icon: string; cover: string; author: string; category: string
  priceMinor: bigint; currency: 'IRT'; siteLimit: number; supportDays: number; active: boolean; featured: boolean
}

const imageUrl = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\/(?!\/)[A-Za-z0-9/_.\-~%]+$/.test(raw)) return raw
  try { const u = new URL(raw); if (u.protocol === 'https:') return u.toString() } catch { /* below */ }
  throw new RepoError('نشانی تصویر معتبر نیست')
}

export function normalizeProduct(input: Record<string, unknown>): ProductData {
  const slug = String(input.slug ?? '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 50) throw new RepoError('شناسهٔ محصول باید kebab-case انگلیسی باشد (مثل my-plugin) و برابر id در manifest.json')
  const name = text(input.name, 80)
  if (!name) throw new RepoError('نام محصول را وارد کنید')
  const price = Number(String(input.price ?? '0').replace(/[,٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  if (!Number.isFinite(price) || price < 0 || price > 1e12) throw new RepoError('قیمت معتبر نیست')
  return {
    slug, kind: input.kind === 'THEME' ? 'THEME' : 'PLUGIN', name, summary: text(input.summary, 200), description: String(input.description ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 10_000),
    icon: imageUrl(input.icon), cover: imageUrl(input.cover), author: text(input.author, 80), category: text(input.category, 40),
    priceMinor: BigInt(Math.round(price)), currency: 'IRT', siteLimit: int(input.siteLimit, 0, 1000, 1), supportDays: int(input.supportDays, 0, 3650, 365),
    active: input.active === true, featured: input.featured === true,
  }
}

/** The manifest inside an uploaded release must describe the product it is published for. */
export function checkReleaseManifest(manifest: { id: string; kind: string; version: string; requiresCore?: string; runtime?: string }, product: { slug: string; kind: string }, existingVersions: string[]) {
  if (manifest.id !== product.slug) throw new RepoError(`id در manifest.json («${manifest.id}») با شناسهٔ محصول («${product.slug}») یکی نیست`)
  if ((manifest.kind === 'theme') !== (product.kind === 'THEME')) throw new RepoError('نوع بسته (افزونه/قالب) با نوع محصول یکی نیست')
  if (!isVersion(manifest.version)) throw new RepoError('نسخه در manifest.json معتبر نیست')
  if (existingVersions.includes(manifest.version)) throw new RepoError(`نسخهٔ ${manifest.version} قبلاً منتشر شده است؛ شمارهٔ نسخه را بالا ببرید`, 409)
  const newest = existingVersions.filter(isVersion).sort(compareVersions).pop()
  if (newest && compareVersions(manifest.version, newest) < 0) throw new RepoError(`نسخهٔ ${manifest.version} از آخرین نسخهٔ منتشرشده (${newest}) قدیمی‌تر است`, 409)
}

// ------------------------------------------------------------------ what a license entitles to

export type LicenseStatus = 'ACTIVE' | 'REVOKED'
export interface LicenseView { status: string; siteLimit: number; updatesUntil: Date | null }

/** Releases published up to `updatesUntil` belong to the license (null = every release, for life). */
export const releaseAllowed = (releasedAt: Date, license: Pick<LicenseView, 'updatesUntil'>) => !license.updatesUntil || releasedAt <= license.updatesUntil

export const updatesUntilFor = (supportDays: number, from: Date): Date | null => (supportDays > 0 ? new Date(from.getTime() + supportDays * 86_400_000) : null)

export type ActivationDecision = { ok: true; reuse: boolean } | { ok: false; reason: 'revoked' | 'limit' }

/** May this license run on `site`? A site that already has it just refreshes; a new site needs a free place. */
export function decideActivation(license: LicenseView, activations: { site: string; active: boolean }[], site: string): ActivationDecision {
  if (license.status !== 'ACTIVE') return { ok: false, reason: 'revoked' }
  if (activations.some((a) => a.site === site)) return { ok: true, reuse: true }
  if (license.siteLimit > 0 && activations.filter((a) => a.active).length >= license.siteLimit) return { ok: false, reason: 'limit' }
  return { ok: true, reuse: false }
}
export const ACTIVATION_MESSAGES = { revoked: 'این لایسنس باطل شده است', limit: 'ظرفیت سایت‌های این لایسنس پر است؛ یکی از سایت‌های قبلی را از پنل لایسنس‌ها غیرفعال کنید' } as const

// ------------------------------------------------------------------ certificates

export interface Certificate {
  v: 1; license: number; product: string; site: string; status: LicenseStatus; updatesUntil: string; issuedAt: string; expiresAt: string
}

/** Stable JSON (sorted keys) so the signature does not depend on property order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(value)
}

/** How long a site may rely on a certificate without asking the repository again. */
export const CERTIFICATE_DAYS = 14

export function buildCertificate(input: { licenseId: number; product: string; site: string; status: LicenseStatus; updatesUntil: Date | null; now: Date }): Certificate {
  return {
    v: 1, license: input.licenseId, product: input.product, site: input.site, status: input.status, updatesUntil: input.updatesUntil ? input.updatesUntil.toISOString() : '',
    issuedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + CERTIFICATE_DAYS * 86_400_000).toISOString(),
  }
}

/** Why a (signature-checked) certificate cannot be relied on here and now; '' when it can. */
export function certificateProblem(cert: Certificate, expected: { product: string; site: string }, now: Date): string {
  if (cert.v !== 1) return 'unsupported'
  if (cert.product !== expected.product) return 'product'
  if (cert.site !== expected.site) return 'site'
  if (cert.status !== 'ACTIVE') return 'revoked'
  if (Date.parse(cert.expiresAt) <= now.getTime()) return 'expired'
  return ''
}

export function isCertificate(value: unknown): value is Certificate {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return c.v === 1 && Number.isSafeInteger(c.license) && typeof c.product === 'string' && typeof c.site === 'string' && (c.status === 'ACTIVE' || c.status === 'REVOKED')
    && typeof c.updatesUntil === 'string' && typeof c.issuedAt === 'string' && typeof c.expiresAt === 'string'
}

// ------------------------------------------------------------------ catalog (the wire format between repository and sites)

export interface CatalogRelease { version: string; size: number; sha256: string; requiresCore: string; runtime: string; changelog: string; publishedAt: string; signature: string }
export interface CatalogProduct {
  slug: string; kind: 'PLUGIN' | 'THEME'; name: string; summary: string; icon: string; author: string; category: string
  price: string; currency: string; free: boolean; siteLimit: number; supportDays: number; featured: boolean; latest: CatalogRelease | null
}

const httpsOrPath = (value: unknown) => { const v = String(value ?? ''); if (/^\/(?!\/)/.test(v) && v.length < 300) return v; try { return new URL(v).protocol === 'https:' ? new URL(v).toString() : '' } catch { return '' } }

/** A repository's answer, defensively: another site's JSON is never trusted (strings are trimmed, images limited to https). */
export function normalizeCatalog(input: unknown): CatalogProduct[] {
  const list = Array.isArray((input as { products?: unknown })?.products) ? (input as { products: unknown[] }).products : []
  const out: CatalogProduct[] = []
  for (const item of list.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const slug = String(p.slug ?? '')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50) continue
    const latest = p.latest && typeof p.latest === 'object' ? p.latest as Record<string, unknown> : null
    const valid = latest && isVersion(latest.version) && /^[0-9a-f]{64}$/.test(String(latest.sha256 ?? ''))
    const price = /^\d{1,15}$/.test(String(p.price ?? '')) ? String(p.price) : '0'
    out.push({
      slug, kind: p.kind === 'THEME' ? 'THEME' : 'PLUGIN', name: text(p.name, 80) || slug, summary: text(p.summary, 200), icon: httpsOrPath(p.icon), author: text(p.author, 80), category: text(p.category, 40),
      price, currency: 'IRT', free: price === '0', siteLimit: int(p.siteLimit, 0, 1000, 1), supportDays: int(p.supportDays, 0, 3650, 365), featured: p.featured === true,
      latest: valid ? { version: String(latest!.version), size: int(latest!.size, 0, 50_000_000, 0), sha256: String(latest!.sha256), requiresCore: text(latest!.requiresCore, 20), runtime: latest!.runtime === 'code' ? 'code' : 'declarative', changelog: String(latest!.changelog ?? '').slice(0, 5000), publishedAt: text(latest!.publishedAt, 40), signature: /^[A-Za-z0-9_-]{60,120}$/.test(String(latest!.signature ?? '')) ? String(latest!.signature) : '' } : null,
    })
  }
  return out
}

/** Does a package that needs core `range` (like ^1.2.0) run on `core`? */
export function coreSatisfies(range: string, core: string): boolean {
  if (!range) return true
  const need = /^\^?(\d+)\.(\d+)\.(\d+)$/.exec(range), have = /^(\d+)\.(\d+)\.(\d+)/.exec(core)
  if (!need || !have) return false
  if (Number(need[1]) !== Number(have[1])) return false
  return Number(have[2]) > Number(need[2]) || (Number(have[2]) === Number(need[2]) && Number(have[3]) >= Number(need[3]))
}
