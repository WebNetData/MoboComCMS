import { env } from '@/platform/config/env'
import { DomainError } from '../domain/domains'
import { installationNetworkInput } from '../domain/installation'
import { domainsOverview, importCertificate, issueCertificate, saveCloudflareToken, saveSite, setSiteUrl } from './domains'
import { helper } from './domains/helper'
import { validateCertificateUpload } from './certificates'

export const hostSetupEnabled = () => env('INSTALL_HOST_SETUP') === 'true'

/** Only the existing private Installer gate may call this before first-owner creation. */
export async function installationNetworkState() {
  if (!hostSetupEnabled()) return { enabled: false as const }
  const overview = await domainsOverview()
  let domain = ''
  try { domain = new URL(overview.siteUrl).hostname } catch { /* not configured */ }
  const site = overview.sites.find(item => item.domain === domain && item.mode === 'app')
  const ready = Boolean(site && overview.siteUrl.startsWith('https://') && overview.siteUrl === overview.siteUrlSetting)
  return {
    enabled: true as const, ready, domain: site?.domain || '', email: overview.email,
    siteUrl: ready ? overview.siteUrl : '', www: site?.www || false,
    tools: overview.tools, cloudflare: overview.cloudflare, error: overview.error,
  }
}

export async function configureInstallationNetwork(input: Record<string, unknown>) {
  if (!hostSetupEnabled()) throw new DomainError('تنظیم وب سرور از ویزارد برای این نصب فعال نیست', 409)
  const proposed = installationNetworkInput(input), overview = await domainsOverview()
  if (proposed.method === 'pem') validateCertificateUpload({ domain: proposed.domain, certificate: input.certificate, privateKey: input.privateKey })
  if (!overview.tools.installed || !overview.tools.nginx) throw new DomainError('ابزار وب سرور آماده نیست؛ نصب اولیهٔ سرور را کامل کنید', 503)
  const current = overview.sites.find(site => site.domain === proposed.domain)
  if (current && current.mode !== 'app') throw new DomainError('این دامنه برای سرویس دیگری ثبت شده است؛ تنظیم آن را از پنل سرور مدیریت کنید', 409)
  const site = { domain: proposed.domain, mode: 'app', www: proposed.www, target: '', note: 'راه‌اندازی اولیهٔ سایت' }
  let certificate = current?.https ? current.cert : ''
  // Provision HTTP challenge only on an unconfigured site; a retry never downgrades working TLS.
  if (!current) await saveSite({ ...site, https: false })
  if (proposed.method === 'cloudflare' && input.cloudflareToken) await saveCloudflareToken(input.cloudflareToken)
  if (proposed.method === 'http' || proposed.method === 'cloudflare') {
    certificate = (await issueCertificate({ domain: proposed.domain, www: proposed.www, email: proposed.email, method: proposed.method })).name
  } else if (proposed.method === 'pem') {
    certificate = (await importCertificate({ domain: proposed.domain, certificate: input.certificate, privateKey: input.privateKey })).name
  }
  await saveSite({ ...site, https: true, cert: certificate })
  return setSiteUrl(proposed.url)
}

export async function closeInstallationListener() {
  if (!hostSetupEnabled()) return
  const result = await helper(['setup-close'])
  if (!result.ok) throw new DomainError('بستن شنوندهٔ موقت نصب انجام نشد؛ از پنل سرور بررسی کنید', 502)
}
