import nodemailer from 'nodemailer'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { isEmail, normalizeSmtp, readSmtp, type SmtpSettings } from '@/modules/mail/domain/mail'

// Site email: one transport configured in the server panel, used by any
// module through sendMail(). Every attempt lands in MailLog.

const KEY = 'mail.smtp.v1'

export async function getSmtp(): Promise<SmtpSettings> {
  return readSmtp(await readJsonSetting(KEY))
}

/** Settings for the browser: the password is replaced by a flag. */
export async function publicSmtp() {
  const { password, ...rest } = await getSmtp()
  return { ...rest, hasPassword: !!password }
}

export async function saveSmtp(input: unknown) {
  const current = await getSmtp()
  const result = normalizeSmtp(input, current)
  if (!result.ok) return result
  const value = { ...result.value, password: result.value.password && result.value.password !== current.password ? encryptPanelCredential(result.value.password) : result.value.password }
  await writeJsonSetting(KEY, value)
  return { ok: true as const }
}

function transport(settings: SmtpSettings) {
  let password = ''
  try { password = decryptPanelCredential(settings.password) } catch { throw new Error('رمز SMTP قابل رمزگشایی نیست؛ دوباره آن را ذخیره کنید') }
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'tls',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    auth: settings.user ? { user: settings.user, pass: password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    // Local Postfix uses a self-signed certificate for STARTTLS on 127.0.0.1.
    tls: settings.mode === 'local' ? { rejectUnauthorized: false } : undefined,
  })
}

export type OutgoingMail = { to: string; subject: string; text: string; html?: string; source?: string; actorId?: number; from?: { name: string; email: string } }

export async function sendMail(mail: OutgoingMail, override?: SmtpSettings): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const settings = override || await getSmtp()
  const to = String(mail.to || '').trim().toLowerCase()
  const subject = String(mail.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250)
  const log = (status: 'SENT' | 'FAILED', extra: { error?: string; messageId?: string }) => db.mailLog.create({ data: { toAddress: to.slice(0, 320), subject, status, error: (extra.error || '').slice(0, 500), messageId: (extra.messageId || '').slice(0, 250), source: (mail.source || 'system').slice(0, 40), actorId: mail.actorId ?? null } }).catch(() => null)
  if (!isEmail(to)) return { ok: false, error: 'نشانی گیرنده معتبر نیست' }
  if (!settings.enabled && !override) { await log('FAILED', { error: 'ارسال ایمیل خاموش است' }); return { ok: false, error: 'ارسال ایمیل سایت خاموش است' } }
  if (!settings.host || !isEmail(settings.fromEmail)) return { ok: false, error: 'تنظیمات ارسال کامل نیست' }
  try {
    const from = mail.from && isEmail(mail.from.email) ? mail.from : { name: settings.fromName, email: settings.fromEmail }
    const info = await transport(settings).sendMail({
      from: from.name ? { name: from.name, address: from.email } : from.email,
      to, subject, text: mail.text, html: mail.html,
      replyTo: settings.replyTo || undefined,
    })
    await log('SENT', { messageId: info.messageId })
    return { ok: true, messageId: info.messageId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ارسال انجام نشد'
    await log('FAILED', { error: message })
    return { ok: false, error: message }
  }
}

/** Check the connection and credentials without sending. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSmtp()
  if (!settings.host) return { ok: false, error: 'سرور SMTP تنظیم نشده است' }
  try { await transport(settings).verify(); return { ok: true } } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'اتصال برقرار نشد' } }
}

export async function mailLog(input: { page?: unknown; status?: unknown }) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  const where = input.status === 'FAILED' || input.status === 'SENT' ? { status: String(input.status) } : {}
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [rows, total, sent30, failed30] = await Promise.all([
    db.mailLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 30, take: 30 }),
    db.mailLog.count({ where }),
    db.mailLog.count({ where: { status: 'SENT', createdAt: { gte: since } } }),
    db.mailLog.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
  ])
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 30)), sent30, failed30 }
}
