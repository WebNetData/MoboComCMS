import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'
import { env } from '@/platform/config/env'
import { dnsRecords, dovecotHash, isDomain, isEmail, isLocalPart, normalizeDomain, normalizeEmail, parseRegistry, passwordProblem, recordPresent, serializeRegistry, type Registry } from '@/modules/mail/domain/mail'

// Domain mailboxes. The installer (deploy/ubuntu/server-panel-install.sh)
// points Postfix and Dovecot at plain files in MAIL_CONFIG_DIR, which the
// app user may write. After a change Postfix is reloaded through a narrow
// sudo rule; Dovecot re-reads its passwd-file by itself.

const run = promisify(execFile)

export class MailError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const mailDir = () => env('MAIL_CONFIG_DIR') || '/etc/mobocom/mail'
const FILES = ['domains', 'mailboxes', 'aliases', 'passwd'] as const
const DKIM_SELECTOR = 'mobocom'

export async function mailStatus() {
  const dir = mailDir()
  const exists = await fs.stat(dir).then((stat) => stat.isDirectory(), () => false)
  const writable = exists && await fs.access(dir, fs.constants.W_OK).then(() => true, () => false)
  return {
    dir, installed: exists, writable,
    imap: !!(env('MAIL_MASTER_USER') && env('MAIL_MASTER_PASSWORD')),
    hostname: env('MAIL_HOSTNAME') || '',
    dkim: exists && await fs.stat(path.join(dir, 'dkim')).then(() => true, () => false),
  }
}

async function readAll(): Promise<Registry> {
  const dir = mailDir()
  const read = (name: string) => fs.readFile(path.join(dir, name), 'utf8').catch(() => '')
  const [domains, mailboxes, aliases, passwd] = await Promise.all(FILES.map(read))
  return parseRegistry({ domains, mailboxes, aliases, passwd })
}

async function writeAll(registry: Registry) {
  const status = await mailStatus()
  if (!status.installed) throw new MailError('سرویس ایمیل روی سرور نصب نشده است؛ اسکریپت نصب را اجرا کنید', 409)
  if (!status.writable) throw new MailError(`برنامه اجازهٔ نوشتن در ${status.dir} را ندارد`, 403)
  const files = serializeRegistry(registry)
  // Written in place: the installer set each file's group (dovecot reads passwd) and mode.
  for (const name of FILES) await fs.writeFile(path.join(status.dir, name), files[name])
  return reload('postfix')
}

/** A failed reload is reported as a warning: the files are already saved. */
async function reload(service: 'postfix' | 'opendkim'): Promise<string | undefined> {
  try { await run('sudo', ['-n', '/usr/bin/systemctl', 'reload', service], { timeout: 20_000 }); return undefined }
  catch { return `ذخیره شد، اما ${service} دوباره بارگذاری نشد و تغییر هنوز اعمال نشده است؛ دسترسی sudo (اسکریپت نصب) را بررسی کنید.` }
}

export async function listRegistry() {
  const registry = await readAll()
  return { ...registry, mailboxes: registry.mailboxes.map(({ hash: _hash, ...box }) => box) }
}

export async function addDomain(input: unknown) {
  const domain = normalizeDomain(input)
  if (!isDomain(domain)) throw new MailError('دامنه نامعتبر است')
  const registry = await readAll()
  if (registry.domains.includes(domain)) throw new MailError('این دامنه از قبل وجود دارد', 409)
  registry.domains.push(domain)
  const warning = await writeAll(registry)
  await ensureDkim(domain).catch(() => null)
  return { domain, warning }
}

export async function removeDomain(input: unknown) {
  const domain = normalizeDomain(input)
  const registry = await readAll()
  if (!registry.domains.includes(domain)) throw new MailError('دامنه پیدا نشد', 404)
  if (registry.mailboxes.some((box) => box.address.endsWith(`@${domain}`)) || registry.aliases.some((alias) => alias.address.endsWith(`@${domain}`))) throw new MailError('اول صندوق‌ها و نام‌های مستعار این دامنه را حذف کنید', 409)
  registry.domains = registry.domains.filter((item) => item !== domain)
  return { domain, warning: await writeAll(registry) }
}

export async function createMailbox(input: { local?: unknown; domain?: unknown; password?: unknown; quotaMb?: unknown }) {
  const local = String(input.local || '').trim().toLowerCase()
  const domain = normalizeDomain(input.domain)
  if (!isLocalPart(local)) throw new MailError('نام صندوق فقط حروف انگلیسی کوچک، عدد و . _ - + باشد')
  const problem = passwordProblem(input.password)
  if (problem) throw new MailError(problem)
  const registry = await readAll()
  if (!registry.domains.includes(domain)) throw new MailError('اول دامنه را اضافه کنید')
  const address = `${local}@${domain}`
  if (registry.mailboxes.some((box) => box.address === address) || registry.aliases.some((alias) => alias.address === address)) throw new MailError('این نشانی وجود دارد', 409)
  registry.mailboxes.push({ address, hash: dovecotHash(await bcrypt.hash(String(input.password), 10)), quotaMb: quota(input.quotaMb), disabled: false })
  return { address, warning: await writeAll(registry) }
}

const quota = (value: unknown) => Math.max(0, Math.min(1_000_000, Math.round(Number(value) || 0)))

export async function updateMailbox(input: { address?: unknown; password?: unknown; quotaMb?: unknown; disabled?: unknown }) {
  const address = normalizeEmail(input.address)
  const registry = await readAll()
  const box = registry.mailboxes.find((item) => item.address === address)
  if (!box) throw new MailError('صندوق پیدا نشد', 404)
  if (input.password !== undefined && input.password !== '') {
    const problem = passwordProblem(input.password)
    if (problem) throw new MailError(problem)
    box.hash = dovecotHash(await bcrypt.hash(String(input.password), 10))
  }
  if (input.quotaMb !== undefined) box.quotaMb = quota(input.quotaMb)
  if (typeof input.disabled === 'boolean') box.disabled = input.disabled
  return { address, warning: await writeAll(registry) }
}

/** Removes the login and delivery; the stored mail stays on disk (the app cannot delete vmail files). */
export async function deleteMailbox(input: unknown) {
  const address = normalizeEmail(input)
  const registry = await readAll()
  if (!registry.mailboxes.some((box) => box.address === address)) throw new MailError('صندوق پیدا نشد', 404)
  registry.mailboxes = registry.mailboxes.filter((box) => box.address !== address)
  registry.aliases = registry.aliases.map((alias) => ({ ...alias, targets: alias.targets.filter((target) => target !== address) })).filter((alias) => alias.targets.length)
  return { address, warning: await writeAll(registry) }
}

export async function saveAlias(input: { address?: unknown; targets?: unknown }) {
  const address = normalizeEmail(input.address)
  const targets = [...new Set((Array.isArray(input.targets) ? input.targets : String(input.targets || '').split(/[\s,]+/)).map(normalizeEmail).filter(Boolean))].slice(0, 50)
  if (!isEmail(address)) throw new MailError('نشانی مستعار نامعتبر است')
  if (!targets.length || !targets.every(isEmail)) throw new MailError('نشانی‌های مقصد معتبر نیستند')
  const registry = await readAll()
  if (!registry.domains.includes(address.split('@')[1])) throw new MailError('دامنهٔ نشانی مستعار باید در فهرست دامنه‌ها باشد')
  if (registry.mailboxes.some((box) => box.address === address)) throw new MailError('این نشانی یک صندوق است', 409)
  registry.aliases = [...registry.aliases.filter((alias) => alias.address !== address), { address, targets }]
  return { address, warning: await writeAll(registry) }
}

export async function deleteAlias(input: unknown) {
  const address = normalizeEmail(input)
  const registry = await readAll()
  registry.aliases = registry.aliases.filter((alias) => alias.address !== address)
  return { address, warning: await writeAll(registry) }
}

// ---------------------------------------------------------------- DKIM & DNS

/** One RSA key per domain in MAIL_CONFIG_DIR/dkim, plus OpenDKIM key/signing tables. */
async function ensureDkim(domain: string) {
  const dir = path.join(mailDir(), 'dkim')
  if (!await fs.stat(dir).then(() => true, () => false)) return null
  const keyFile = path.join(dir, `${domain}.private`)
  if (!await fs.stat(keyFile).then(() => true, () => false)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    await fs.writeFile(keyFile, privateKey, { mode: 0o640, flag: 'wx' })
  }
  const domains = (await readAll()).domains
  await fs.writeFile(path.join(dir, 'KeyTable'), domains.map((item) => `${DKIM_SELECTOR}._domainkey.${item} ${item}:${DKIM_SELECTOR}:${path.join(dir, `${item}.private`)}`).join('\n') + '\n')
  await fs.writeFile(path.join(dir, 'SigningTable'), domains.map((item) => `*@${item} ${DKIM_SELECTOR}._domainkey.${item}`).join('\n') + '\n')
  await reload('opendkim').catch(() => null)
  return keyFile
}

async function dkimPublicKey(domain: string): Promise<string | null> {
  const pem = await fs.readFile(path.join(mailDir(), 'dkim', `${domain}.private`), 'utf8').catch(() => null)
  if (!pem) return null
  const der = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })
  return Buffer.from(der).toString('base64')
}

async function serverIp() {
  const configured = env('MAIL_SERVER_IP')
  if (configured) return configured
  const host = env('MAIL_HOSTNAME')
  if (!host) return ''
  return (await dns.resolve4(host).catch(() => [] as string[]))[0] || ''
}

/** Suggested records for a domain and whether public DNS already has them. */
export async function domainDns(input: unknown) {
  const domain = normalizeDomain(input)
  if (!isDomain(domain)) throw new MailError('دامنه نامعتبر است')
  const [ip, key] = await Promise.all([serverIp(), dkimPublicKey(domain)])
  const records = dnsRecords(domain, env('MAIL_HOSTNAME') || `mail.${domain}`, ip, key ? { selector: DKIM_SELECTOR, publicKey: key } : undefined)
  const lookup = async (type: string, name: string): Promise<string[]> => {
    try {
      if (type === 'MX') return (await dns.resolveMx(name)).map((mx) => `${mx.priority} ${mx.exchange}`)
      if (type === 'A') return await dns.resolve4(name)
      return (await dns.resolveTxt(name)).map((parts) => parts.join(''))
    } catch { return [] }
  }
  return { domain, records: await Promise.all(records.map(async (record) => ({ ...record, ok: recordPresent(record, await lookup(record.type, record.name)) }))) }
}
