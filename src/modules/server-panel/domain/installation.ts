import { DomainError, normalizeDomain } from './domains'

export type InstallTlsMethod = 'http' | 'cloudflare' | 'pem'

/** The first-run wizard may configure this application only, never an arbitrary proxy/path. */
export function installationNetworkInput(input: Record<string, unknown>) {
  const domain = normalizeDomain(input.domain)
  if (!domain) throw new DomainError('دامنهٔ معتبر وارد کنید؛ مثل mobocom.net')
  const method = String(input.method || 'http') as InstallTlsMethod
  if (!['http', 'cloudflare', 'pem'].includes(method)) throw new DomainError('روش SSL معتبر نیست')
  const email = String(input.email || '').trim()
  if (['http', 'cloudflare'].includes(method) && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) throw new DomainError('ایمیل معتبر برای گواهی SSL وارد کنید')
  if (['http', 'cloudflare'].includes(method) && input.acmeAgreement !== true) throw new DomainError('شرایط صدور گواهی Let’s Encrypt را تأیید کنید')
  return { domain, method, email, www: input.www === true, url: `https://${domain}` }
}
