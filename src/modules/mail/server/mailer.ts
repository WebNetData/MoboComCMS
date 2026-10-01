import nodemailer, { type Transporter } from 'nodemailer'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getSettings, readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { EMAIL_EVENTS, deliverableEmail, isEmail, isGmailHost, normalizeSmtp, notificationEmail, readSmtp, type SmtpSettings } from '@/modules/mail/domain/mail'

// Site email: one outgoing account (e.g. a Gmail address with an app
// password) used by every module through sendMail(). The mail goes out
// through that provider, so the site's own server never runs a mail server.
// One pooled, rate-limited connection is reused; every attempt lands in
// MailLog, which also enforces the rolling 24-hour cap.

const KEY = 'mail.smtp.v1'

export async function getSmtp(): Promise<SmtpSettings> {
  return readSmtp(await readJsonSetting(KEY))
}

/** Settings for the browser: the password is replaced by a flag. */
export async function publicSmtp() {
  const { password, ...rest } = await getSmtp()
  return { ...rest, hasPassword: !!password, gmail: rest.mode === 'smtp' && isGmailHost(rest.host), events: Object.fromEntries(EMAIL_EVENTS.map((event) => [event.id, rest.events[event.id] !== false])) }
}

export async function saveSmtp(input: unknown) {
  const current = await getSmtp()
  const result = normalizeSmtp(input, current)
  if (!result.ok) return result
  const value = { ...result.value, password: result.value.password && result.value.password !== current.password ? encryptPanelCredential(result.value.password) : result.value.password }
  await writeJsonSetting(KEY, value)
  closePool()
  return { ok: true as const }
}

// One pooled connection per settings version: fewer logins at the provider,
// and a gentle pace (Gmail throttles bursts).
let pool: { key: string; transport: Transporter } | null = null

function closePool() {
  pool?.transport.close()
  pool = null
}

function transport(settings: SmtpSettings, pooled: boolean): Transporter {
  const key = JSON.stringify([settings.mode, settings.host, settings.port, settings.security, settings.user, settings.password])
  if (pooled && pool?.key === key) return pool.transport
  let password = ''
  try { password = decryptPanelCredential(settings.password) } catch { throw new Error('رمز SMTP قابل رمزگشایی نیست؛ دوباره آن را ذخیره کنید') }
  const created = nodemailer.createTransport({
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
    ...(pooled ? { pool: true, maxConnections: 1, maxMessages: 100, rateDelta: 1000, rateLimit: 2 } : {}),
  })
  if (pooled) { closePool(); pool = { key, transport: created } }
  return created
}

async function sentLast24h() {
  return db.mailLog.count({ where: { status: 'SENT', createdAt: { gte: new Date(Date.now() - 86_400_000) } } })
}

export type OutgoingMail = { to: string; subject: string; text: string; html?: string; source?: string; actorId?: number; from?: { name: string; email: string }; headers?: Record<string, string> }

export async function sendMail(mail: OutgoingMail, override?: SmtpSettings): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const settings = override || await getSmtp()
  const to = String(mail.to || '').trim().toLowerCase()
  const subject = String(mail.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250)
  const log = (status: 'SENT' | 'FAILED', extra: { error?: string; messageId?: string }) => db.mailLog.create({ data: { toAddress: to.slice(0, 320), subject, status, error: (extra.error || '').slice(0, 500), messageId: (extra.messageId || '').slice(0, 250), source: (mail.source || 'system').slice(0, 40), actorId: mail.actorId ?? null } }).catch(() => null)
  if (!isEmail(to)) return { ok: false, error: 'نشانی گیرنده معتبر نیست' }
  if (!settings.enabled && !override) { await log('FAILED', { error: 'ارسال ایمیل خاموش است' }); return { ok: false, error: 'ارسال ایمیل سایت خاموش است' } }
  if (!settings.host || !isEmail(settings.fromEmail)) return { ok: false, error: 'تنظیمات ارسال کامل نیست' }
  if (settings.dailyLimit > 0 && await sentLast24h() >= settings.dailyLimit) {
    const error = `سقف ${settings.dailyLimit.toLocaleString('fa-IR')} ایمیل در ۲۴ ساعت پر شده است`
    await log('FAILED', { error })
    return { ok: false, error }
  }
  try {
    const from = mail.from && isEmail(mail.from.email) ? mail.from : { name: settings.fromName, email: settings.fromEmail }
    const info = await transport(settings, !override).sendMail({
      from: from.name ? { name: from.name, address: from.email } : from.email,
      to, subject, text: mail.text, html: mail.html,
      replyTo: settings.replyTo || undefined,
      headers: mail.headers,
    })
    await log('SENT', { messageId: info.messageId })
    return { ok: true, messageId: info.messageId }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'ارسال انجام نشد'
    // The most common Gmail failure, in words the admin can act on.
    const message = /535|Username and Password not accepted|BadCredentials|Application-specific password required/i.test(raw)
      ? 'جیمیل نام کاربری یا رمز را نپذیرفت؛ باید «رمز برنامه» (App Password) ۱۶ حرفی بسازید، نه رمز خود جیمیل.'
      : raw
    await log('FAILED', { error: message })
    if (!override) closePool()
    return { ok: false, error: message }
  }
}

/** Check the connection and credentials without sending. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSmtp()
  if (!settings.host) return { ok: false, error: 'سرور SMTP تنظیم نشده است' }
  try { await transport(settings, false).verify(); return { ok: true } } catch (error) {
    const raw = error instanceof Error ? error.message : 'اتصال برقرار نشد'
    return { ok: false, error: /535|not accepted|BadCredentials|Application-specific/i.test(raw) ? 'جیمیل نام کاربری یا رمز را نپذیرفت؛ «رمز برنامه» (App Password) لازم است.' : raw }
  }
}

export async function mailLog(input: { page?: unknown; status?: unknown }) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  const where = input.status === 'FAILED' || input.status === 'SENT' ? { status: String(input.status) } : {}
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [rows, total, sent30, failed30, sent24] = await Promise.all([
    db.mailLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 30, take: 30 }),
    db.mailLog.count({ where }),
    db.mailLog.count({ where: { status: 'SENT', createdAt: { gte: since } } }),
    db.mailLog.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
    sentLast24h(),
  ])
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 30)), sent30, failed30, sent24 }
}

async function brand() {
  const settings = await getSettings()
  return { brand: settings.brandName || 'موبوکام', site: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}

/** Email copy of a customer notification (called when the inbox event is first created). */
export async function notifyUserEmail(event: { userId: number; kind: string; titleFa: string; bodyFa?: string; href: string }) {
  const settings = await getSmtp()
  if (!settings.enabled || !settings.notifyUsers || settings.events[event.kind] === false || !EMAIL_EVENTS.some((item) => item.id === event.kind)) return
  const user = await db.user.findUnique({ where: { id: event.userId }, select: { email: true, name: true, status: true, emailAlerts: true } })
  if (!user || user.status !== 'ACTIVE' || !user.emailAlerts || !deliverableEmail(user.email)) return
  if (!await (await import('@/modules/notifications/server/preferences')).isNotificationChannelEnabled(event.userId, event.kind, 'email')) return
  const { brand: name, site } = await brand()
  const email = notificationEmail({ brand: name, site, name: user.name || 'کاربر', title: event.titleFa, body: event.bodyFa, href: event.href })
  const result = await sendMail({ to: user.email, subject: email.subject, text: email.text, html: email.html, source: `notify:${event.kind}`.slice(0, 40), headers: { 'List-Unsubscribe': `<${email.settings}>` } })
  if (!result.ok) logEvent('warn', 'mail.user_event_failed', { kind: event.kind, error: result.error })
}

/** Sample of the notification email for the admin preview. */
export async function previewNotification() {
  const { brand: name, site } = await brand()
  return notificationEmail({ brand: name, site, name: 'علی', title: 'پرداخت تأیید شد', body: 'پرداخت فاکتور INV-1405-0012 تأیید شد. وضعیت تحویل در فاکتور قابل مشاهده است.', href: '/invoice/INV-1405-0012' })
}
