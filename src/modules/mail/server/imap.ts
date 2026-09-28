import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { env } from '@/platform/config/env'
import sanitizeHtml from 'sanitize-html'
import { isEmail, normalizeEmail } from '@/modules/mail/domain/mail'
import { MailError } from '@/modules/mail/server/mailboxes'

// Reading domain mailboxes from the panel. The app logs in to the local
// Dovecot as "<mailbox>*<master user>" (a Dovecot master user the installer
// creates), so users' own passwords are never needed or stored.

async function withMailbox<T>(addressInput: unknown, work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const address = normalizeEmail(addressInput)
  if (!isEmail(address)) throw new MailError('صندوق نامعتبر است')
  const master = env('MAIL_MASTER_USER'), secret = env('MAIL_MASTER_PASSWORD')
  if (!master || !secret) throw new MailError('دسترسی خواندن صندوق‌ها تنظیم نشده است (MAIL_MASTER_USER / MAIL_MASTER_PASSWORD)', 409)
  const client = new ImapFlow({
    host: env('MAIL_IMAP_HOST') || '127.0.0.1',
    port: Number(env('MAIL_IMAP_PORT') || 143),
    secure: false,
    // Loopback only; Dovecot's snakeoil certificate is not publicly signed.
    tls: { rejectUnauthorized: false },
    auth: { user: `${address}*${master}`, pass: secret },
    logger: false,
    socketTimeout: 30_000,
  })
  try {
    await client.connect()
  } catch {
    throw new MailError('اتصال به سرور ایمیل (Dovecot) برقرار نشد', 502)
  }
  try { return await work(client) } finally { await client.logout().catch(() => null) }
}

/** Email HTML keeps layout (tables, inline styles) but no scripts, forms or remote images (tracking pixels). */
function cleanEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'center', 'font', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'style']),
    allowedAttributes: { '*': ['style', 'align', 'dir', 'width', 'height', 'bgcolor', 'color', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border'], a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowVulnerableTags: true,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  })
}

const FOLDER = /^[\p{L}\p{N} ._/&+-]{1,120}$/u
const folderName = (value: unknown) => { const name = String(value || 'INBOX'); if (!FOLDER.test(name)) throw new MailError('پوشه نامعتبر است'); return name }

export async function listFolders(address: unknown) {
  return withMailbox(address, async (client) => {
    const folders = await client.list({ statusQuery: { messages: true, unseen: true } })
    return folders.map((folder) => ({ path: folder.path, name: folder.name, special: folder.specialUse || '', messages: folder.status?.messages ?? 0, unseen: folder.status?.unseen ?? 0 }))
  })
}

export async function listMessages(address: unknown, folderInput: unknown, pageInput: unknown) {
  const folder = folderName(folderInput)
  const page = Math.max(1, Math.floor(Number(pageInput) || 1))
  const size = 30
  return withMailbox(address, async (client) => {
    const box = await client.mailboxOpen(folder, { readOnly: true })
    const total = box.exists
    const end = total - (page - 1) * size
    const start = Math.max(1, end - size + 1)
    const rows: { uid: number; from: string; subject: string; date: string; seen: boolean; size: number }[] = []
    if (end >= 1) {
      for await (const message of client.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true, size: true })) {
        const sender = message.envelope?.from?.[0]
        rows.push({ uid: message.uid, from: sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address || '') : '', subject: message.envelope?.subject || '(بدون موضوع)', date: new Date(message.envelope?.date || Date.now()).toISOString(), seen: !!message.flags?.has('\\Seen'), size: message.size || 0 })
      }
    }
    return { folder, total, page, pages: Math.max(1, Math.ceil(total / size)), rows: rows.reverse() }
  })
}

export async function readMessage(address: unknown, folderInput: unknown, uidInput: unknown) {
  const folder = folderName(folderInput)
  const uid = Math.floor(Number(uidInput))
  if (!Number.isInteger(uid) || uid < 1) throw new MailError('پیام نامعتبر است')
  return withMailbox(address, async (client) => {
    await client.mailboxOpen(folder)
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
    if (!message || !message.source) throw new MailError('پیام پیدا نشد', 404)
    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => null)
    const parsed = await simpleParser(message.source, { skipImageLinks: true })
    const list = (value: typeof parsed.to) => (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.text).join(', ')
    return {
      uid, folder,
      from: parsed.from?.text || '', to: list(parsed.to), cc: list(parsed.cc),
      subject: parsed.subject || '(بدون موضوع)', date: (parsed.date || new Date()).toISOString(),
      text: (parsed.text || '').slice(0, 200_000),
      // Rendered in a sandboxed iframe on top of this sanitising (no scripts, no remote loads).
      html: parsed.html ? cleanEmailHtml(parsed.html).slice(0, 400_000) : '',
      attachments: parsed.attachments.map((file) => ({ name: file.filename || 'attachment', size: file.size, type: file.contentType })),
      messageId: parsed.messageId || '',
    }
  })
}

export async function deleteMessage(address: unknown, folderInput: unknown, uidInput: unknown) {
  const folder = folderName(folderInput)
  const uid = Math.floor(Number(uidInput))
  if (!Number.isInteger(uid) || uid < 1) throw new MailError('پیام نامعتبر است')
  return withMailbox(address, async (client) => {
    await client.mailboxOpen(folder)
    const trash = (await client.list()).find((item) => item.specialUse === '\\Trash')
    if (trash && trash.path !== folder) await client.messageMove(String(uid), trash.path, { uid: true })
    else await client.messageDelete(String(uid), { uid: true })
    return { uid }
  })
}

/** Send as a domain mailbox through the local Postfix and keep a copy in Sent. */
export async function sendAs(input: { address?: unknown; to?: unknown; subject?: unknown; text?: unknown; inReplyTo?: unknown }) {
  const address = normalizeEmail(input.address)
  const to = String(input.to || '').split(/[\s,;]+/).map(normalizeEmail).filter(Boolean).slice(0, 20)
  if (!isEmail(address)) throw new MailError('صندوق فرستنده نامعتبر است')
  if (!to.length || !to.every(isEmail)) throw new MailError('نشانی گیرنده معتبر نیست')
  const subject = String(input.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250)
  const text = String(input.text || '').slice(0, 100_000)
  if (!text.trim()) throw new MailError('متن پیام خالی است')
  const inReplyTo = typeof input.inReplyTo === 'string' && /^<[^<>\s]{3,250}>$/.test(input.inReplyTo) ? input.inReplyTo : undefined
  const message = { from: address, to, subject, text, inReplyTo, references: inReplyTo }
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: 25, secure: false, tls: { rejectUnauthorized: false }, disableFileAccess: true, disableUrlAccess: true, connectionTimeout: 15_000 })
  try { await transport.sendMail(message) } catch (error) { throw new MailError(`ارسال انجام نشد: ${error instanceof Error ? error.message : ''}`.slice(0, 300), 502) }
  const raw = await new MailComposer(message).compile().build()
  await withMailbox(address, async (client) => {
    const sent = (await client.list()).find((item) => item.specialUse === '\\Sent')
    if (sent) await client.append(sent.path, raw, ['\\Seen'])
  }).catch(() => null)
  return { to }
}
