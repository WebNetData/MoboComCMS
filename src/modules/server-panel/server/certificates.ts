import { X509Certificate, createPrivateKey } from 'node:crypto'
import { DomainError, normalizeDomain } from '@/modules/server-panel/domain/domains'

/** Only parsed PEM enters the privileged helper; no browser supplied paths or commands. */
export function validateCertificateUpload(input: Record<string, unknown>, requiredDomains: string[] = []) {
  const domain = normalizeDomain(input.domain), label = String(input.name || domain).toLowerCase()
  if (!domain || label.includes('..') || !/^[a-z0-9][a-z0-9.-]{0,85}$/.test(label)) throw new DomainError('دامنه یا نام گواهی معتبر نیست')
  const chain = String(input.certificate || ''), secret = String(input.privateKey || '')
  if (!chain || chain.length > 131072 || !secret || secret.length > 32768) throw new DomainError('اندازهٔ فایل گواهی یا کلید معتبر نیست')
  try {
    const blocks = chain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || []
    if (!blocks.length || blocks.length > 10 || chain.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) throw Error()
    const certs = blocks.map(block => new X509Certificate(block)), leaf = certs[0]
    const key = createPrivateKey(secret)
    if (leaf.ca || !leaf.checkPrivateKey(key) || !leaf.checkHost(domain, { subject: 'never' })) throw Error()
    if (requiredDomains.some(host => !leaf.checkHost(host, { subject: 'never' }))) throw Error()
    if (certs.some(cert => Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now())) throw Error()
    return { name: 'manual-' + label, domain, expiresAt: new Date(leaf.validTo).toISOString(), payload: Buffer.from(blocks.join('\n') + '\n').toString('base64') + '\n' + Buffer.from(key.export({ type: 'pkcs8', format: 'pem' })).toString('base64') + '\n' }
  } catch { throw new DomainError('گواهی باید PEM معتبر و دارای SAN دامنه باشد؛ تاریخ اعتبار و تطابق کلید خصوصی را بررسی کنید. کلید رمزدار پشتیبانی نمی‌شود.') }
}
