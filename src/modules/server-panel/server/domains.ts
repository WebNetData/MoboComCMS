import dns from 'node:dns/promises'
import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { env } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { helper } from './domains/helper'
import { validateCertificateUpload } from '@/modules/server-panel/server/certificates'
import {
  DomainError, apexOf, certCovers, certificateNames, normalizeCertDomain, normalizeDomain, normalizeSiteUrl, parseCertificates, siteApplyArgs,
  validateDnsRecord, validateSite, type CertInfo, type SiteDomain,
} from '@/modules/server-panel/domain/domains'

// Domains, SSL and the site address. Root actions go through the helper
// /usr/local/sbin/mobocom-webctl (sudo), which validates its own arguments.

const KEY = 'server-panel.domains.v1'
type Stored = { sites: SiteDomain[]; email: string; cfToken: string }

async function load(): Promise<Stored> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => null)
  try {
    const raw = row ? JSON.parse(row.value) : {}
    return { sites: Array.isArray(raw.sites) ? raw.sites.map((item: Record<string, unknown>) => { try { return validateSite(item) } catch { return null } }).filter(Boolean) : [], email: String(raw.email || ''), cfToken: String(raw.cfToken || '') }
  } catch { return { sites: [], email: '', cfToken: '' } }
}

async function save(state: Stored) {
  const value = JSON.stringify(state)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
}

const cfToken = (state: Stored) => { try { return state.cfToken ? decryptPanelCredential(state.cfToken) : '' } catch { return '' } }

// ------------------------------------------------------------------ helper

const helperError = (out: string) => (out.match(/ERROR: (.+)/)?.[1] || out.split('\n').filter(Boolean).slice(-3).join(' — ') || 'انجام نشد').slice(0, 600)

// ------------------------------------------------------------------ overview

export async function domainsOverview() {
  const state = await load()
  const [statusResult, certResult, settings] = await Promise.all([helper(['status'], 10_000), helper(['cert-list'], 30_000), db.setting.findUnique({ where: { key: 'siteUrl' } }).catch(() => null)])
  let tools: Record<string, unknown> = { installed: false }
  try { if (statusResult.ok) tools = { installed: true, ...JSON.parse(statusResult.out.trim().split('\n').pop() || '{}') } } catch { tools = { installed: false } }
  const certificates: CertInfo[] = certResult.ok ? parseCertificates(certResult.out) : []
  const ip = String(tools.ip || '')
  const sites = await Promise.all(state.sites.map(async (site) => {
    const dnsIps = await dns.resolve4(site.domain).catch(() => [] as string[])
    const cert = site.https ? certificates.find((item) => item.name === site.cert) : certificates.find((item) => certCovers(item.domains, site.domain))
    return { ...site, dns: dnsIps, pointsHere: ip ? dnsIps.includes(ip) : null, certificate: cert || null }
  }))
  return {
    tools, sites, certificates, email: state.email, cloudflare: !!state.cfToken,
    siteUrl: env('NEXTAUTH_URL') || '', siteUrlSetting: settings?.value || '',
    error: statusResult.ok ? '' : helperError(statusResult.out),
  }
}

// ------------------------------------------------------------------ sites (vhosts)

export async function saveSite(input: Record<string, unknown>, apply = true) {
  const site = validateSite(input)
  const state = await load()
  if (site.https) {
    const certs = parseCertificates((await helper(['cert-list'])).out)
    const eligible = (item: CertInfo) => item.valid && certCovers(item.domains, site.domain) && (!site.www || certCovers(item.domains, `www.${site.domain}`))
    const cert = certs.find((item) => item.name === site.cert && eligible(item)) || certs.find(eligible)
    if (!cert) throw new DomainError('برای این دامنه گواهی SSL پیدا نشد؛ اول از بخش «گواهی SSL» گواهی بگیرید، سپس HTTPS را روشن کنید.', 409)
    site.cert = cert.name
  }
  if (apply) {
    const result = await helper(siteApplyArgs(site), 60_000)
    if (!result.ok) throw new DomainError(`اعمال روی Nginx انجام نشد: ${helperError(result.out)}`, 502)
  }
  const sites = state.sites.filter((item) => item.domain !== site.domain)
  await save({ ...state, sites: [...sites, site].sort((a, b) => a.domain.localeCompare(b.domain)) })
  logEvent('info', 'server.domain.saved', { domain: site.domain, mode: site.mode, https: site.https })
  return site
}

export async function removeSite(domainInput: unknown) {
  const domain = normalizeDomain(domainInput)
  if (!domain) throw new DomainError('دامنه معتبر نیست')
  const result = await helper(['site-remove', domain])
  if (!result.ok) throw new DomainError(`حذف از Nginx انجام نشد: ${helperError(result.out)}`, 502)
  const state = await load()
  await save({ ...state, sites: state.sites.filter((item) => item.domain !== domain) })
}

// ------------------------------------------------------------------ certificates

/**
 * Issues (or expands) a Let's Encrypt certificate: HTTP validation for plain
 * names (the domain must already point here), Cloudflare DNS for wildcard.
 * Certbot's timer renews it automatically before expiry.
 */
export async function issueCertificate(input: { domain: unknown; wildcard?: boolean; www?: boolean; email?: unknown; extra?: unknown; method?: unknown }) {
  const domain = normalizeDomain(input.domain)
  if (!domain) throw new DomainError('دامنه معتبر نیست')
  const state = await load()
  const email = String(input.email || state.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError('ایمیل برای ثبت در Let\'s Encrypt لازم است (اطلاع‌رسانی انقضا)')
  const wildcard = input.wildcard === true
  const method = input.method === undefined ? (wildcard ? 'cloudflare' : 'http') : String(input.method)
  if (!['http', 'cloudflare', 'standalone'].includes(method)) throw new DomainError('روش صدور گواهی معتبر نیست')
  if (wildcard && method !== 'cloudflare') throw new DomainError('گواهی Wildcard به روش DNS نیاز دارد')
  if (method === 'cloudflare' && !state.cfToken) throw new DomainError('ابتدا توکن محدود DNS کلادفلر را ثبت کنید.')
  const extra = Array.isArray(input.extra) ? input.extra.map(normalizeCertDomain).filter(Boolean) : []
  const names = [...new Set([...certificateNames(domain, { wildcard, www: input.www === true }), ...extra])]
  if (method === 'cloudflare') await writeCloudflareIni(state)
  const name = wildcard ? apexOf(domain) : domain
  const result = await helper(['cert-issue', name, method, email, ...names], 240_000)
  if (email !== state.email) await save({ ...state, email })
  if (!result.ok) {
    const out = result.out
    const hint = /DNS problem|NXDOMAIN|no valid A records/i.test(out) ? 'رکورد DNS دامنه هنوز به این سرور اشاره نمی‌کند.'
      : /Timeout during connect|Connection refused|firewall/i.test(out) ? 'پورت ۸۰ سرور از اینترنت در دسترس نیست (فایروال یا پروکسی کلادفلر؛ برای دامنه‌های نارنجی کلادفلر روش DNS را انتخاب کنید).'
        : /too many certificates|rate limit/i.test(out) ? 'به سقف صدور Let\'s Encrypt رسیده‌اید؛ یک ساعت بعد دوباره تلاش کنید.'
          : /Invalid API Token|Authentication error|6003|9109/i.test(out) ? 'توکن کلادفلر پذیرفته نشد؛ دسترسی Zone:DNS:Edit لازم است.' : ''
    throw new DomainError(`صدور گواهی انجام نشد. ${hint} ${helperError(out)}`.trim(), 502)
  }
  logEvent('info', 'server.cert.issued', { name, names, wildcard })
  return { name, names }
}

export async function importCertificate(input: Record<string, unknown>) {
  const proposed = validateCertificateUpload(input), state = await load()
  const required = state.sites.filter(site => site.https && site.cert === proposed.name).flatMap(site => site.www ? [site.domain, `www.${site.domain}`] : [site.domain])
  const cert = validateCertificateUpload(input, required)
  const result = await helper(['cert-import', cert.name, cert.domain], 30_000, cert.payload)
  if (!result.ok) throw new DomainError('ذخیرهٔ گواهی انجام نشد؛ ابزار مدیریت سرور، تطابق کلید و گواهی را بررسی کنید.', 502)
  return { name: cert.name, domain: cert.domain, expiresAt: cert.expiresAt, automaticRenewal: false }
}

export async function renewCertificates(dry: boolean) {
  const result = await helper(dry ? ['cert-renew', 'dry'] : ['cert-renew'], 300_000)
  return { ok: result.ok, output: result.out }
}

export async function deleteCertificate(nameInput: unknown) {
  const name = String(nameInput ?? '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9.-]{0,99}$/.test(name)) throw new DomainError('نام گواهی معتبر نیست')
  const state = await load()
  if (state.sites.some((site) => site.https && site.cert === name)) throw new DomainError('این گواهی در دامنه‌ای با HTTPS روشن استفاده می‌شود؛ اول HTTPS آن دامنه را خاموش کنید.', 409)
  const result = await helper(['cert-delete', name], 60_000)
  if (!result.ok) throw new DomainError(helperError(result.out), 502)
}

// ------------------------------------------------------------------ site address

/** Changes the public site address: settings, and NEXTAUTH_URL (the site restarts). */
export async function setSiteUrl(input: unknown) {
  const url = normalizeSiteUrl(input)
  if (!url) throw new DomainError('نشانی سایت معتبر نیست (مثل https://mobocom.net)')
  await db.setting.upsert({ where: { key: 'siteUrl' }, create: { key: 'siteUrl', value: url }, update: { value: url } })
  const result = await helper(['site-url', url], 20_000)
  if (!result.ok) throw new DomainError(`نشانی در تنظیمات سایت ذخیره شد، ولی فایل محیطی به‌روز نشد: ${helperError(result.out)}`, 502)
  return { url, restarting: !result.out.includes('site URL unchanged') }
}

// ------------------------------------------------------------------ Cloudflare

const CF = 'https://api.cloudflare.com/client/v4'

async function cf<T>(token: string, pathName: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CF}${pathName}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(20_000) }).catch(() => null)
  if (!response) throw new DomainError('ارتباط با Cloudflare برقرار نشد', 502)
  const body = await response.json().catch(() => null) as { success?: boolean; result?: T; errors?: { message: string }[] } | null
  if (!response.ok || !body?.success) throw new DomainError(`Cloudflare: ${body?.errors?.map((item) => item.message).join('، ') || response.status}`, response.status === 403 ? 403 : 502)
  return body.result as T
}

async function writeCloudflareIni(state: Stored) {
  const token = cfToken(state)
  if (!token) throw new DomainError('توکن کلادفلر ثبت نشده است')
  const file = env('SERVER_PANEL_CF_INI') || '/etc/mobocom/secrets/cloudflare.ini'
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }).catch(() => undefined)
  await fs.writeFile(file, `# Written by the MoboCom server panel (certbot-dns-cloudflare)\ndns_cloudflare_api_token = ${token}\n`, { mode: 0o600 })
  await fs.chmod(file, 0o600).catch(() => undefined)
  // New helpers pin a validated root-private copy for Certbot renewal. Older helpers retain their established path.
  const capabilities = await helper(['status'], 10_000)
  let safeCopy = false
  try { safeCopy = Boolean(JSON.parse(capabilities.out.trim().split('\n').pop() || '{}').safeDnsCredentials) } catch { /* legacy helper */ }
  if (safeCopy && !(await helper(['cf-sync'])).ok) throw new DomainError('ذخیرهٔ امن توکن DNS برای تمدید گواهی انجام نشد؛ ابزار وب سرور را بررسی کنید.', 502)
}

/** Saves (after verifying) a Cloudflare API token with Zone:DNS:Edit. */
export async function saveCloudflareToken(input: unknown) {
  const token = String(input ?? '').trim()
  const state = await load()
  if (!token) { await save({ ...state, cfToken: '' }); return { cloudflare: false } }
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new DomainError('توکن کلادفلر معتبر نیست')
  const check = await cf<{ status: string }>(token, '/user/tokens/verify')
  if (check.status !== 'active') throw new DomainError('این توکن فعال نیست')
  const next = { ...state, cfToken: encryptPanelCredential(token) }
  await save(next)
  await writeCloudflareIni(next).catch((error) => logEvent('warn', 'server.cf_ini_failed', { error: String(error) }))
  return { cloudflare: true }
}

export async function cloudflareZones() {
  const token = cfToken(await load())
  if (!token) throw new DomainError('توکن کلادفلر ثبت نشده است', 409)
  const zones = await cf<{ id: string; name: string; status: string; name_servers: string[] }[]>(token, '/zones?per_page=50')
  return zones.map((zone) => ({ id: zone.id, name: zone.name, status: zone.status, nameServers: zone.name_servers }))
}

const zoneId = (value: unknown) => { const id = String(value ?? ''); if (!/^[a-f0-9]{32}$/.test(id)) throw new DomainError('شناسهٔ zone معتبر نیست'); return id }

export async function cloudflareRecords(zone: unknown) {
  const token = cfToken(await load())
  const records = await cf<{ id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }[]>(token, `/zones/${zoneId(zone)}/dns_records?per_page=200`)
  return records.map(({ id, type, name, content, proxied, ttl }) => ({ id, type, name, content, proxied, ttl }))
}

export async function saveCloudflareRecord(zone: unknown, zoneName: unknown, input: Record<string, unknown>) {
  const token = cfToken(await load())
  const record = validateDnsRecord(input, normalizeDomain(zoneName))
  const id = String(input.id || '')
  if (id && !/^[a-f0-9]{32}$/.test(id)) throw new DomainError('شناسهٔ رکورد معتبر نیست')
  return cf(token, `/zones/${zoneId(zone)}/dns_records${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(record) })
}

export async function deleteCloudflareRecord(zone: unknown, recordId: unknown) {
  const token = cfToken(await load())
  const id = String(recordId ?? '')
  if (!/^[a-f0-9]{32}$/.test(id)) throw new DomainError('شناسهٔ رکورد معتبر نیست')
  await cf(token, `/zones/${zoneId(zone)}/dns_records/${id}`, { method: 'DELETE' })
}

/**
 * Purges the Cloudflare cache of every zone the site uses (its own address
 * and the panel's site domains), so a new theme, asset or image shows at once.
 */
export async function purgeCloudflareCache(): Promise<{ zones: string[] }> {
  const state = await load()
  const token = cfToken(state)
  if (!token) throw new DomainError('توکن کلادفلر ثبت نشده است (پنل سرور ← دامنه‌ها)')
  const siteUrl = (await db.setting.findUnique({ where: { key: 'siteUrl' } }).catch(() => null))?.value || ''
  let siteHost = ''
  try { siteHost = siteUrl ? new URL(siteUrl).hostname : '' } catch { /* no site address */ }
  const apexes = [...new Set([siteHost, ...state.sites.map((site) => site.domain)].filter((host) => host && host.includes('.') && !/^[\d.]+$/.test(host)).map(apexOf))]
  const purged: string[] = []
  for (const apex of apexes) {
    const zones = await cf<{ id: string; name: string }[]>(token, `/zones?name=${encodeURIComponent(apex)}`)
    for (const zone of zones) {
      await cf(token, `/zones/${zone.id}/purge_cache`, { method: 'POST', body: JSON.stringify({ purge_everything: true }) })
      purged.push(zone.name)
    }
  }
  if (!purged.length) throw new DomainError('هیچ زون کلادفلری برای دامنه‌های سایت پیدا نشد')
  logEvent('info', 'cdn.cloudflare_purged', { zones: purged })
  return { zones: purged }
}
