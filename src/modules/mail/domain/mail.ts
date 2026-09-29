// Mail: site sending settings and the domain-mailbox registry that Postfix
// and Dovecot read. Pure: validation, the plain-text map formats and the DNS
// records a domain needs. No I/O here.

export type SmtpSecurity = 'tls' | 'starttls' | 'none'

export type SmtpSettings = {
  enabled: boolean
  /** "local" = the server's own Postfix on 127.0.0.1:25 without auth. */
  mode: 'local' | 'smtp'
  host: string
  port: number
  security: SmtpSecurity
  user: string
  /** Stored encrypted; never sent to the browser. */
  password: string
  fromName: string
  fromEmail: string
  replyTo: string
  /** Most emails sent in any 24 hours (0 = no cap). Gmail allows ~500 a day. */
  dailyLimit: number
  /** Email copies of customer notifications (payments, tickets, deliveries…). */
  notifyUsers: boolean
  /** Per notification kind; a missing kind counts as on. */
  events: Record<string, boolean>
}

export const SMTP_DEFAULTS: SmtpSettings = { enabled: false, mode: 'smtp', host: '', port: 587, security: 'starttls', user: '', password: '', fromName: '', fromEmail: '', replyTo: '', dailyLimit: 0, notifyUsers: false, events: {} }

/** Gmail / Google Workspace through smtp.gmail.com with an app password. */
export const GMAIL_HOST = 'smtp.gmail.com'
export const GMAIL_DAILY_LIMIT = 450
export const isGmailHost = (host: string) => host === GMAIL_HOST || host === 'smtp.googlemail.com'

/** Customer notification kinds that may also go out by email. */
export const EMAIL_EVENTS: { id: string; label: string }[] = [
  { id: 'PAYMENT_PAID', label: 'پرداخت تأیید شد' },
  { id: 'RECEIPT_REJECTED', label: 'رسید کارت به کارت رد شد' },
  { id: 'PAYMENT_CLOSED', label: 'فاکتور بسته شد' },
  { id: 'PRODUCT_DELIVERED', label: 'محصول تحویل/ارسال شد' },
  { id: 'DELIVERY_DELAYED', label: 'تأخیر در تحویل' },
  { id: 'MEMBERSHIP', label: 'اشتراک ویژه (VIP)' },
  { id: 'TICKET_REPLY', label: 'پاسخ تیکت پشتیبانی' },
  { id: 'SUBSCRIPTION_EXPIRING', label: 'نزدیک شدن پایان اشتراک' },
  { id: 'SUBSCRIPTION_EXPIRED', label: 'پایان اشتراک' },
  { id: 'SUBSCRIPTION_READY', label: 'فعال شدن سرویس' },
  { id: 'SUBSCRIPTION_RENEWED', label: 'تمدید سرویس' },
  { id: 'ORDER_REFUND', label: 'لغو/مرجوعی و برگشت وجه' },
  { id: 'STOCK_BACK', label: 'موجود شدن کالای موردنظر' },
  { id: 'CART_REMINDER', label: 'یادآوری سبد خرید رهاشده' },
  { id: 'GIFT_CARD', label: 'کارت هدیه' },
  { id: 'LOYALTY', label: 'باشگاه مشتریان (امتیاز و سطح)' },
  { id: 'CONTENT_PURCHASE', label: 'خرید فایل یا مقالهٔ پولی' },
  { id: 'MARKETPLACE', label: 'فروشندگان (سفارش تازه، تسویه، وضعیت فروشگاه)' },
  { id: 'LIVECHAT', label: 'گفت‌وگوی آنلاین (پاسخ اپراتور)' },
  { id: 'FX_RATE', label: 'نرخ ارز منتظر تأیید (مدیر)' },
  { id: 'ADS', label: 'تبلیغات (تأیید و وضعیت کمپین)' },
]

/** Placeholder accounts (phone sign-up, bots, Telegram) have no real inbox. */
export const deliverableEmail = (email: string) => isEmail(email) && !/@(phone|bot)\.mobocom\.local$|@telegram\.local$|\.(local|invalid|test)$/i.test(email)

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
const DOMAIN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/i
const HOST = /^(?=.{1,253}$)[a-z0-9.-]+$/i

export const isEmail = (value: unknown): value is string => typeof value === 'string' && EMAIL.test(value) && !/[\r\n]/.test(value)
export const isDomain = (value: unknown): value is string => typeof value === 'string' && DOMAIN.test(value)
export const normalizeDomain = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\.$/, '')
export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

/** Local part rules for mailboxes we create (stricter than RFC on purpose). */
export const isLocalPart = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(value) && !value.includes('..')

const oneLine = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n\0]/g, ' ').trim().slice(0, max)

/**
 * Normalises SMTP settings from the form. An empty password keeps the stored
 * one (the browser never sees it); returns the settings or an error.
 */
export function normalizeSmtp(input: unknown, current: SmtpSettings): { ok: true; value: SmtpSettings } | { ok: false; error: string } {
  const raw = (input || {}) as Record<string, unknown>
  const mode = raw.mode === 'local' ? 'local' : 'smtp'
  const security: SmtpSecurity = raw.security === 'tls' || raw.security === 'none' ? raw.security : 'starttls'
  const port = Math.round(Number(raw.port))
  const value: SmtpSettings = {
    enabled: raw.enabled === true,
    mode,
    host: mode === 'local' ? '127.0.0.1' : oneLine(raw.host, 253).toLowerCase(),
    port: mode === 'local' ? 25 : port,
    security: mode === 'local' ? 'none' : security,
    user: mode === 'local' ? '' : oneLine(raw.user, 200),
    password: mode === 'local' ? '' : typeof raw.password === 'string' && raw.password !== '' ? raw.password.slice(0, 500) : current.password,
    fromName: oneLine(raw.fromName, 80),
    fromEmail: normalizeEmail(raw.fromEmail),
    replyTo: normalizeEmail(raw.replyTo),
    dailyLimit: Math.max(0, Math.min(100_000, Math.round(Number(raw.dailyLimit) || 0))),
    notifyUsers: raw.notifyUsers === true,
    events: Object.fromEntries(EMAIL_EVENTS.map((event) => [event.id, (raw.events as Record<string, unknown> | undefined)?.[event.id] !== false])),
  }
  if (mode === 'smtp' && isGmailHost(value.host)) {
    // Google shows app passwords as "abcd efgh ijkl mnop".
    if (typeof raw.password === 'string' && raw.password !== '') value.password = raw.password.replace(/\s+/g, '')
    if (!isEmail(value.user)) return { ok: false, error: 'برای جیمیل، نام کاربری همان نشانی کامل جیمیل است' }
    // Gmail rewrites any other From to the signed-in account unless it is a verified "Send mail as" alias.
    if (!value.fromEmail) value.fromEmail = normalizeEmail(value.user)
    if (value.security === 'none') return { ok: false, error: 'جیمیل فقط با STARTTLS (۵۸۷) یا SSL (۴۶۵) کار می‌کند' }
    if (!value.dailyLimit) value.dailyLimit = GMAIL_DAILY_LIMIT
  }
  if (mode === 'smtp' && !HOST.test(value.host)) return { ok: false, error: 'نشانی سرور SMTP نامعتبر است' }
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return { ok: false, error: 'پورت نامعتبر است' }
  if (value.enabled && !isEmail(value.fromEmail)) return { ok: false, error: 'نشانی فرستنده (From) معتبر نیست' }
  if (value.fromEmail && !isEmail(value.fromEmail)) return { ok: false, error: 'نشانی فرستنده (From) معتبر نیست' }
  if (value.replyTo && !isEmail(value.replyTo)) return { ok: false, error: 'نشانی پاسخ (Reply-To) معتبر نیست' }
  if (/[<>"]/.test(value.fromName)) return { ok: false, error: 'نام فرستنده نباید < > یا " داشته باشد' }
  return { ok: true, value }
}

export function readSmtp(stored: Record<string, unknown> | undefined): SmtpSettings {
  const raw = stored || {}
  return {
    ...SMTP_DEFAULTS,
    enabled: raw.enabled === true,
    mode: raw.mode === 'local' ? 'local' : 'smtp',
    host: typeof raw.host === 'string' ? raw.host : '',
    port: Number.isInteger(raw.port) ? Number(raw.port) : 587,
    security: raw.security === 'tls' || raw.security === 'none' ? raw.security : 'starttls',
    user: typeof raw.user === 'string' ? raw.user : '',
    password: typeof raw.password === 'string' ? raw.password : '',
    fromName: typeof raw.fromName === 'string' ? raw.fromName : '',
    fromEmail: typeof raw.fromEmail === 'string' ? raw.fromEmail : '',
    dailyLimit: Number.isInteger(raw.dailyLimit) ? Number(raw.dailyLimit) : 0,
    notifyUsers: raw.notifyUsers === true,
    events: raw.events && typeof raw.events === 'object' ? Object.fromEntries(Object.entries(raw.events as Record<string, unknown>).map(([key, value]) => [key, value !== false])) : {},
    replyTo: typeof raw.replyTo === 'string' ? raw.replyTo : '',
  }
}

// ---------------------------------------------------------------- notification email

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A branded, RTL, table-based email (renders in Gmail, Outlook and phones) plus its text part. */
export function notificationEmail(input: { brand: string; site: string; name: string; title: string; body?: string; href: string; accent?: string }) {
  const link = /^https?:\/\//.test(input.href) ? input.href : `${input.site}${input.href}`
  const settings = `${input.site}/dashboard/profile`
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent! : '#4b45ee'
  const body = input.body && input.body !== input.title ? input.body : ''
  const text = [`${input.name} عزیز،`, '', input.title, body, '', `مشاهده: ${link}`, '', input.brand, `برای قطع ایمیل‌های اطلاع‌رسانی: ${settings}`].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Tahoma,Vazirmatn,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${accent};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold;text-align:right">${escapeHtml(input.brand)}</td></tr>
<tr><td style="padding:28px 24px 8px;text-align:right;font-size:15px;line-height:2">
<p style="margin:0 0 8px">${escapeHtml(input.name)} عزیز،</p>
<h1 style="margin:0 0 8px;font-size:19px;line-height:1.8">${escapeHtml(input.title)}</h1>
${body ? `<p style="margin:0;color:#4b5563">${escapeHtml(body).replace(/\n/g, '<br>')}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px 28px;text-align:right"><a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:bold;font-size:14px">مشاهده جزئیات</a></td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #eef0f3;text-align:right;font-size:12px;line-height:2;color:#6b7280">این ایمیل به دلیل فعالیت در حساب کاربری شما در ${escapeHtml(input.brand)} ارسال شده است. برای قطع ایمیل‌های اطلاع‌رسانی به <a href="${escapeHtml(settings)}" style="color:#6b7280">تنظیمات حساب</a> بروید.</td></tr>
</table></td></tr></table></body></html>`
  return { subject: `${input.title} — ${input.brand}`.replace(/[\r\n]+/g, ' ').slice(0, 200), text, html, link, settings }
}

/** Transactional security email (password reset, sign-in alerts): one action, no unsubscribe footer. */
export function actionEmail(input: { brand: string; site: string; name: string; title: string; body: string; href: string; button: string; note?: string; accent?: string }) {
  const link = /^https?:\/\//.test(input.href) ? input.href : `${input.site}${input.href}`
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent! : '#4b45ee'
  const text = [`${input.name} عزیز،`, '', input.title, input.body, '', `${input.button}: ${link}`, '', input.note || '', input.brand].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Tahoma,Vazirmatn,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${accent};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold;text-align:right">${escapeHtml(input.brand)}</td></tr>
<tr><td style="padding:28px 24px 8px;text-align:right;font-size:15px;line-height:2">
<p style="margin:0 0 8px">${escapeHtml(input.name)} عزیز،</p>
<h1 style="margin:0 0 8px;font-size:19px;line-height:1.8">${escapeHtml(input.title)}</h1>
<p style="margin:0;color:#4b5563">${escapeHtml(input.body).replace(/\n/g, '<br>')}</p>
</td></tr>
<tr><td style="padding:16px 24px 20px;text-align:right"><a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:bold;font-size:14px">${escapeHtml(input.button)}</a></td></tr>
<tr><td style="padding:0 24px 24px;text-align:right;font-size:12px;line-height:2;color:#6b7280;direction:ltr;word-break:break-all">${escapeHtml(link)}</td></tr>
${input.note ? `<tr><td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #eef0f3;text-align:right;font-size:12px;line-height:2;color:#6b7280">${escapeHtml(input.note)}</td></tr>` : ''}
</table></td></tr></table></body></html>`
  return { subject: `${input.title} — ${input.brand}`.replace(/[\r\n]+/g, ' ').slice(0, 200), text, html }
}

// ---------------------------------------------------------------- registry files
//
// domains    : one domain per line                       (Postfix virtual_mailbox_domains, texthash)
// mailboxes  : "user@domain domain/user/"                 (Postfix virtual_mailbox_maps, texthash)
// aliases    : "from@domain to1@x,to2@y"                  (Postfix virtual_alias_maps, texthash)
// passwd     : "user@domain:{BLF-CRYPT}hash::::::extra"   (Dovecot passwd-file; re-read on change)
// Lines starting with # are comments; the files are rewritten whole.

export type Mailbox = { address: string; hash: string; quotaMb: number; disabled: boolean }
export type Alias = { address: string; targets: string[] }
export type Registry = { domains: string[]; mailboxes: Mailbox[]; aliases: Alias[] }

const HEADER = '# Managed by MoboCom server panel — edits here are overwritten.\n'
const contentLines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))

export function parseRegistry(files: { domains: string; mailboxes: string; aliases: string; passwd: string }): Registry {
  const domains = [...new Set(contentLines(files.domains).map((line) => normalizeDomain(line.split(/\s+/)[0])).filter(isDomain))]
  const mailboxSet = new Set(contentLines(files.mailboxes).map((line) => normalizeEmail(line.split(/\s+/)[0])).filter(isEmail))
  const mailboxes: Mailbox[] = []
  for (const line of contentLines(files.passwd)) {
    const parts = line.split(':')
    const address = normalizeEmail(parts[0])
    if (!isEmail(address)) continue
    const extra = parts.slice(7).join(':')
    const quota = Number(extra.match(/userdb_quota_rule=\*:storage=(\d+)M/)?.[1] || 0)
    const hash = parts[1] || ''
    // A disabled mailbox keeps its mail but cannot log in ("!" hash) or receive (not in the map).
    mailboxes.push({ address, hash: hash.replace(/^!/, ''), quotaMb: quota, disabled: hash.startsWith('!') || !mailboxSet.has(address) })
  }
  const aliases: Alias[] = contentLines(files.aliases).map((line) => {
    const [address, targets = ''] = line.split(/\s+/, 2)
    return { address: normalizeEmail(address), targets: targets.split(',').map(normalizeEmail).filter(isEmail) }
  }).filter((alias) => isEmail(alias.address) && alias.targets.length > 0)
  return { domains, mailboxes, aliases }
}

export function serializeRegistry(registry: Registry): { domains: string; mailboxes: string; aliases: string; passwd: string } {
  const domains = [...new Set(registry.domains)].sort()
  const boxes = [...registry.mailboxes].sort((a, b) => a.address.localeCompare(b.address))
  return {
    domains: HEADER + domains.map((domain) => `${domain} OK`).join('\n') + '\n',
    mailboxes: HEADER + boxes.filter((box) => !box.disabled).map((box) => { const [local, domain] = box.address.split('@'); return `${box.address} ${domain}/${local}/` }).join('\n') + '\n',
    aliases: HEADER + [...registry.aliases].sort((a, b) => a.address.localeCompare(b.address)).map((alias) => `${alias.address} ${alias.targets.join(',')}`).join('\n') + '\n',
    passwd: HEADER + boxes.map((box) => `${box.address}:${box.disabled ? '!' : ''}${box.hash}::::::${box.quotaMb > 0 ? `userdb_quota_rule=*:storage=${box.quotaMb}M` : ''}`).join('\n') + '\n',
  }
}

/** Dovecot scheme for bcrypt hashes ($2y$ is understood by every libxcrypt). */
export const dovecotHash = (bcrypt: string) => `{BLF-CRYPT}${bcrypt.replace(/^\$2[ab]\$/, '$2y$')}`

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'رمز صندوق باید دست‌کم ۱۰ نویسه باشد'
  if (password.length > 128) return 'رمز بیش از حد طولانی است'
  if (/[\s:]/.test(password)) return 'رمز نباید فاصله یا «:» داشته باشد'
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'رمز باید حرف و عدد داشته باشد'
  return null
}

// ---------------------------------------------------------------- DNS

export type DnsRecord = { type: 'MX' | 'TXT' | 'A'; name: string; value: string; purpose: string }

export function dnsRecords(domain: string, mailHost: string, serverIp: string, dkim?: { selector: string; publicKey: string }): DnsRecord[] {
  const records: DnsRecord[] = [
    { type: 'MX', name: domain, value: `10 ${mailHost}.`, purpose: 'دریافت ایمیل‌های این دامنه' },
    { type: 'TXT', name: domain, value: `v=spf1 mx a${serverIp ? ` ip4:${serverIp}` : ''} ~all`, purpose: 'SPF: اجازهٔ ارسال از این سرور' },
    { type: 'TXT', name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}; adkim=s; aspf=s`, purpose: 'DMARC: سیاست برخورد با ایمیل جعلی' },
  ]
  if (serverIp && mailHost.endsWith(domain)) records.unshift({ type: 'A', name: mailHost, value: serverIp, purpose: 'نشانی سرور ایمیل' })
  if (dkim) records.push({ type: 'TXT', name: `${dkim.selector}._domainkey.${domain}`, value: `v=DKIM1; k=rsa; p=${dkim.publicKey}`, purpose: 'DKIM: امضای دیجیتال ایمیل‌های ارسالی' })
  return records
}

/** Whether a TXT/MX lookup result satisfies a suggested record (loose, human-level check). */
export function recordPresent(record: DnsRecord, found: string[]): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim()
  if (record.type === 'MX') return found.some((value) => norm(value).endsWith(norm(record.value.split(' ')[1])))
  if (record.type === 'A') return found.includes(record.value)
  const key = record.value.split(/[;\s]/)[0].toLowerCase()
  if (key === 'v=dkim1') return found.some((value) => value.replace(/\s/g, '').includes(record.value.split('p=')[1]?.slice(0, 40) || '~'))
  return found.some((value) => norm(value).startsWith(key))
}
