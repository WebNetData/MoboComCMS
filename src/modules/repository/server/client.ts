import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { currentVersion } from '@/modules/updater/server/service'
import { installPackage, loadPackage, setPackageEnabled } from '@/modules/packages/server/store'
import { PackageError } from '@/modules/packages/domain/format'
import {
  RepoError, certificateProblem, compareVersions, coreSatisfies, isCertificate, normalizeCatalog, normalizeLicenseKey, normalizeSiteHost, safeRepositoryUrl,
  type Certificate, type CatalogProduct,
} from '@/modules/repository/domain/repository'
import { fingerprintOf, sha256, verifyPayload } from './crypto'

// The site side of the repository: browse a vendor's catalog, keep licenses, install and update packages.
// Everything a vendor sends is checked: the key is pinned by the administrator, releases and certificates are signed.

const CONFIG_KEY = 'repository.client.v1'
const LICENSES_KEY = 'repository.licenses.v1'
const INSTALLED_KEY = 'repository.installed.v1'
const MAX_CATALOG = 2 * 1024 * 1024
const MAX_PACKAGE = 4 * 1024 * 1024

const allowPrivate = () => process.env.REPOSITORY_ALLOW_PRIVATE === '1'
/** The default vendor for new sites (an installation can preset it with REPOSITORY_URL). */
export const defaultRepositoryUrl = () => { try { return safeRepositoryUrl(process.env.REPOSITORY_URL, { allowPrivate: allowPrivate() }) } catch { return '' } }

export interface ClientConfig { url: string; name: string; publicKey: string; fingerprint: string; connectedAt: string }
interface StoredLicense { keyEnc: string; certificate: Certificate; signature: string; checkedAt: string; state: 'active' | 'revoked' | 'unreachable' }

async function readConfig(): Promise<ClientConfig | null> {
  const raw = await readJsonSetting(CONFIG_KEY)
  if (!raw || typeof raw.url !== 'string' || typeof raw.publicKey !== 'string' || !raw.url) return null
  return { url: raw.url, name: String(raw.name || ''), publicKey: raw.publicKey, fingerprint: String(raw.fingerprint || ''), connectedAt: String(raw.connectedAt || '') }
}
export const getClientConfig = readConfig

async function readMap<T>(key: string): Promise<Record<string, T>> {
  const raw = await readJsonSetting(key)
  return (raw && typeof raw === 'object' ? raw : {}) as Record<string, T>
}

// ------------------------------------------------------------------ safe HTTP

/** A hostname must resolve only to public addresses (development can allow private ones). */
async function assertPublicHost(host: string) {
  if (allowPrivate()) return
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new RepoError('نشانی مخزن پیدا نشد', 502) })
  for (const { address } of addresses) {
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address)) throw new RepoError('نشانی مخزن به یک شبکهٔ خصوصی اشاره می‌کند', 400)
  }
}

async function request(base: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}, limit = MAX_CATALOG): Promise<{ status: number; buffer: Buffer; json: () => unknown }> {
  const root = safeRepositoryUrl(base, { allowPrivate: allowPrivate() })
  await assertPublicHost(new URL(root).hostname)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${root}${path}`, {
      method: init.method || 'GET', signal: controller.signal, redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'MoboComCMS-repository-client', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) { await reader.cancel(); throw new RepoError('پاسخ مخزن بیش از حد بزرگ است', 502) }
      chunks.push(part.value)
    }
    const buffer = Buffer.concat(chunks)
    return { status: response.status, buffer, json: () => { try { return JSON.parse(buffer.toString('utf8')) } catch { throw new RepoError('پاسخ مخزن معتبر نیست', 502) } } }
  } catch (error) {
    if (error instanceof RepoError) throw error
    throw new RepoError('اتصال به مخزن برقرار نشد', 502)
  } finally { clearTimeout(timer) }
}

const problem = (r: { status: number; json: () => unknown }, fallback: string) => {
  let message = fallback
  try { const body = r.json() as { error?: string }; if (body?.error) message = String(body.error).slice(0, 300) } catch { /* keep the fallback */ }
  return new RepoError(message, r.status === 402 ? 402 : r.status >= 500 ? 502 : r.status)
}

// ------------------------------------------------------------------ connecting

/** Step one: what the repository says about itself. The administrator confirms the key fingerprint before it is pinned. */
export async function fetchRepositoryMeta(url: string) {
  const r = await request(url, '/api/repo/v1/meta')
  if (r.status !== 200) throw problem(r, 'این نشانی مخزن افزونه نیست')
  const meta = r.json() as { name?: unknown; publicKey?: unknown }
  const publicKey = String(meta.publicKey || '')
  if (!/^-----BEGIN PUBLIC KEY-----[A-Za-z0-9+/=\s]+-----END PUBLIC KEY-----\s*$/.test(publicKey) || publicKey.length > 400) throw new RepoError('کلید عمومی مخزن معتبر نیست', 502)
  return { url: safeRepositoryUrl(url, { allowPrivate: allowPrivate() }), name: String(meta.name || '').slice(0, 80), publicKey, fingerprint: fingerprintOf(publicKey) }
}

/** Step two: pin the key the administrator confirmed. A changed key is never accepted silently. */
export async function connectRepository(url: string, confirmedFingerprint: string) {
  const meta = await fetchRepositoryMeta(url)
  if (meta.fingerprint.replace(/-/g, '') !== String(confirmedFingerprint || '').toUpperCase().replace(/[^0-9A-F]/g, '')) throw new RepoError('اثر انگشت کلید تأیید نشد؛ دوباره «بررسی» را بزنید', 409)
  await writeJsonSetting(CONFIG_KEY, { ...meta, connectedAt: new Date().toISOString() })
  return meta
}

export async function disconnectRepository() { await writeJsonSetting(CONFIG_KEY, {}) }

// ------------------------------------------------------------------ catalog

async function requireConfig() {
  const config = await readConfig()
  if (!config) throw new RepoError('ابتدا به یک مخزن وصل شوید', 409)
  return config
}

export async function browseCatalog(filter: { q?: string; kind?: string } = {}) {
  const config = await requireConfig()
  const r = await request(config.url, `/api/repo/v1/catalog?${new URLSearchParams({ q: filter.q || '', kind: filter.kind || '' })}`)
  if (r.status !== 200) throw problem(r, 'دریافت فهرست ناموفق بود')
  const raw = r.json() as { products?: { slug?: unknown; latest?: { signature?: unknown; size?: unknown } | null }[] }
  const products = normalizeCatalog(raw)
  const [licenses, installedMap, core] = [await readMap<StoredLicense>(LICENSES_KEY), await readMap<{ version: string; installedAt: string }>(INSTALLED_KEY), currentVersion()]
  const out = []
  for (const product of products) {
    // A release the pinned key did not sign is shown but cannot be installed.
    const latest = product.latest && verifyPayload({ slug: product.slug, version: product.latest.version, sha256: product.latest.sha256, size: product.latest.size }, product.latest.signature, config.publicKey) ? product.latest : null
    const installed = installedMap[product.slug]
    const local = installed ? await loadPackage(product.slug).catch(() => null) : null
    out.push({
      ...product, latest, unverified: !!product.latest && !latest,
      compatible: latest ? coreSatisfies(latest.requiresCore, core) : true,
      installed: local ? { version: local.manifest.version, enabled: local.enabled } : null,
      update: local && latest && compareVersions(latest.version, local.manifest.version) > 0 ? latest.version : '',
      license: licenses[product.slug] ? { state: licenses[product.slug].state, last5: decryptPanelCredential(licenses[product.slug].keyEnc).slice(-5), updatesUntil: licenses[product.slug].certificate.updatesUntil, checkedAt: licenses[product.slug].checkedAt } : null,
    })
  }
  return { repository: { url: config.url, name: config.name, fingerprint: config.fingerprint, connectedAt: config.connectedAt }, products: out }
}

// ------------------------------------------------------------------ licenses

async function siteHost() { return normalizeSiteHost(await siteBaseUrl()) }

export async function activateRepositoryLicense(slug: string, rawKey: unknown) {
  const config = await requireConfig()
  const key = normalizeLicenseKey(rawKey)
  if (!key) throw new RepoError('کلید لایسنس معتبر نیست (مثل MBC-XXXXX-XXXXX-XXXXX-XXXXX)')
  const site = await siteHost()
  const r = await request(config.url, '/api/repo/v1/licenses/activate', { method: 'POST', body: { key, slug, site, coreVersion: currentVersion() } })
  if (r.status !== 200) throw problem(r, 'فعال‌سازی لایسنس ناموفق بود')
  const answer = r.json() as { certificate?: unknown; signature?: unknown }
  if (!isCertificate(answer.certificate) || typeof answer.signature !== 'string' || !verifyPayload(answer.certificate, answer.signature, config.publicKey)) throw new RepoError('گواهی لایسنس با کلید مخزن تأیید نشد', 502)
  const bad = certificateProblem(answer.certificate, { product: slug, site }, new Date())
  if (bad) throw new RepoError('گواهی لایسنس برای این سایت معتبر نیست', 502)
  const licenses = await readMap<StoredLicense>(LICENSES_KEY)
  licenses[slug] = { keyEnc: encryptPanelCredential(key), certificate: answer.certificate, signature: answer.signature, checkedAt: new Date().toISOString(), state: 'active' }
  await writeJsonSetting(LICENSES_KEY, licenses)
  return { updatesUntil: answer.certificate.updatesUntil }
}

export async function deactivateRepositoryLicense(slug: string) {
  const config = await requireConfig()
  const licenses = await readMap<StoredLicense>(LICENSES_KEY)
  const stored = licenses[slug]
  if (!stored) return
  // Freeing the place is best effort: the license is removed here even when the repository cannot be reached.
  await request(config.url, '/api/repo/v1/licenses/deactivate', { method: 'POST', body: { key: decryptPanelCredential(stored.keyEnc), slug, site: await siteHost() } }).catch(() => undefined)
  delete licenses[slug]
  await writeJsonSetting(LICENSES_KEY, licenses)
}

/** Daily: asks the repository about every stored license; a revoked one switches its package off. */
export async function refreshRepositoryLicenses(): Promise<{ checked: number; revoked: string[] }> {
  const config = await readConfig()
  if (!config) return { checked: 0, revoked: [] }
  const licenses = await readMap<StoredLicense>(LICENSES_KEY)
  const site = await siteHost()
  const revoked: string[] = []
  for (const [slug, stored] of Object.entries(licenses)) {
    try {
      const r = await request(config.url, '/api/repo/v1/licenses/check', { method: 'POST', body: { key: decryptPanelCredential(stored.keyEnc), slug, site } })
      if (r.status !== 200) { if (r.status === 403 || r.status === 404) stored.state = 'revoked'; else stored.state = 'unreachable' } else {
        const answer = r.json() as { certificate?: unknown; signature?: unknown }
        if (isCertificate(answer.certificate) && typeof answer.signature === 'string' && verifyPayload(answer.certificate, answer.signature, config.publicKey)) {
          stored.certificate = answer.certificate; stored.signature = answer.signature
          stored.state = answer.certificate.status === 'ACTIVE' ? 'active' : 'revoked'
        } else stored.state = 'unreachable'
      }
    } catch { stored.state = 'unreachable' }
    stored.checkedAt = new Date().toISOString()
    if (stored.state === 'revoked') { revoked.push(slug); await setPackageEnabled(slug, false).catch(() => undefined) }
  }
  await writeJsonSetting(LICENSES_KEY, licenses)
  return { checked: Object.keys(licenses).length, revoked }
}

// ------------------------------------------------------------------ installing

export async function installFromRepository(slug: string, actor: string) {
  const config = await requireConfig()
  const catalog = await browseCatalog()
  const product: (typeof catalog.products)[number] | undefined = catalog.products.find((p) => p.slug === slug)
  if (!product) throw new RepoError('این محصول در مخزن نیست', 404)
  const latest = product.latest
  if (!latest) throw new RepoError(product.unverified ? 'امضای نسخه با کلید مخزن تأیید نشد؛ نصب انجام نمی‌شود' : 'این محصول نسخهٔ منتشرشده ندارد', product.unverified ? 502 : 404)
  if (!product.compatible) throw new RepoError(`این نسخه به هستهٔ ${latest.requiresCore || '؟'} نیاز دارد و با نسخهٔ فعلی سایت (${currentVersion()}) سازگار نیست`, 409)

  const headers: Record<string, string> = {}
  if (!product.free) {
    const licenses = await readMap<StoredLicense>(LICENSES_KEY)
    const stored = licenses[slug]
    if (!stored) throw new RepoError('این محصول پولی است؛ ابتدا کلید لایسنس را وارد کنید', 402)
    const site = await siteHost()
    if (!verifyPayload(stored.certificate, stored.signature, config.publicKey) || certificateProblem(stored.certificate, { product: slug, site }, new Date()) === 'revoked') throw new RepoError('لایسنس معتبر نیست', 403)
    headers['x-license-key'] = decryptPanelCredential(stored.keyEnc)
    headers['x-license-site'] = site
  }
  const r = await request(config.url, `/api/repo/v1/download/${encodeURIComponent(slug)}/${encodeURIComponent(latest.version)}`, { headers: { ...headers, Accept: 'application/zip' } }, MAX_PACKAGE)
  if (r.status !== 200) throw problem(r, 'دریافت بسته ناموفق بود')
  // The bytes must be exactly what the pinned key signed.
  if (sha256(r.buffer) !== latest.sha256 || r.buffer.length !== latest.size) throw new RepoError('بستهٔ دریافتی با امضای مخزن نمی‌خواند؛ نصب لغو شد', 502)
  try {
    const { pkg, upgraded } = await installPackage(r.buffer, actor)
    const installed = await readMap<{ version: string; installedAt: string }>(INSTALLED_KEY)
    installed[slug] = { version: pkg.manifest.version, installedAt: new Date().toISOString() }
    await writeJsonSetting(INSTALLED_KEY, installed)
    return { version: pkg.manifest.version, upgraded, runtime: pkg.manifest.runtime, kind: pkg.manifest.kind }
  } catch (error) {
    if (error instanceof PackageError) throw new RepoError(error.message)
    throw error
  }
}

export type CatalogItem = CatalogProduct
