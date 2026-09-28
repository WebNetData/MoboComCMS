import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { serverGate } from '@/modules/server-panel/server/gate'
import { getSmtp, mailLog, publicSmtp, saveSmtp, sendMail, verifySmtp } from '@/modules/mail/server/mailer'
import { MailError, addDomain, createMailbox, deleteAlias, deleteMailbox, domainDns, listRegistry, mailStatus, removeDomain, saveAlias, updateMailbox } from '@/modules/mail/server/mailboxes'
import { deleteMessage, listFolders, listMessages, readMessage, sendAs } from '@/modules/mail/server/imap'

function failure(error: unknown) {
  if (error instanceof MailError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/mail?view=overview|log|dns&domain=|folders&box=|messages&box=&folder=&page=|message&box=&folder=&uid= */
export async function GET_mail(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view') || 'overview') {
      case 'overview': {
        const status = await mailStatus()
        return ok({ smtp: await publicSmtp(), status, registry: status.installed ? await listRegistry().catch(() => null) : null })
      }
      case 'log': return ok(await mailLog({ page: q.get('page'), status: q.get('status') }))
      case 'dns': return ok(await domainDns(q.get('domain')))
      case 'folders': return ok({ folders: await listFolders(q.get('box')) })
      case 'messages': return ok(await listMessages(q.get('box'), q.get('folder'), q.get('page')))
      case 'message': {
        const message = await readMessage(q.get('box'), q.get('folder'), q.get('uid'))
        await auditAdmin({ req, actor: gate.user, action: 'server.mail_read', targetType: 'mailbox', targetId: q.get('box'), metadata: { folder: message.folder, uid: message.uid } })
        return ok(message)
      }
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

type Body = { op?: string; settings?: unknown; to?: unknown; domain?: unknown; local?: unknown; password?: unknown; quotaMb?: unknown; address?: unknown; disabled?: unknown; targets?: unknown; box?: unknown; folder?: unknown; uid?: unknown; subject?: unknown; text?: unknown; inReplyTo?: unknown }

/** POST /api/admin/server/mail {op, …} */
export async function POST_mail(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = (await req.json().catch(() => null) || {}) as Body
  const audit = (action: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: gate.user, action: `server.${action}`, targetType: 'mail', targetId: String(target ?? ''), metadata })
  try {
    switch (body.op) {
      case 'smtp': {
        const result = await saveSmtp(body.settings)
        if (!result.ok) return err(result.error)
        await audit('mail_settings', 'smtp')
        return ok({ smtp: await publicSmtp() })
      }
      case 'verify': return ok(await verifySmtp())
      case 'test': {
        const settings = await getSmtp()
        const result = await sendMail({ to: String(body.to || ''), subject: 'ایمیل آزمایشی سایت', text: `این یک ایمیل آزمایشی از پنل سرور است.\nزمان: ${new Date().toISOString()}`, source: 'test', actorId: gate.user.id }, settings)
        await audit('mail_test', body.to, { ok: result.ok })
        return result.ok ? ok(result) : err(result.error, 502)
      }
      case 'domain-add': { const r = await addDomain(body.domain); await audit('mail_domain', r.domain, { added: true }); return ok(r) }
      case 'domain-remove': { const r = await removeDomain(body.domain); await audit('mail_domain', r.domain, { removed: true }); return ok(r) }
      case 'mailbox-create': { const r = await createMailbox(body); await audit('mailbox_create', r.address, { quotaMb: body.quotaMb }); return ok(r) }
      case 'mailbox-update': { const r = await updateMailbox(body); await audit('mailbox_update', r.address, { password: !!body.password, quotaMb: body.quotaMb, disabled: body.disabled }); return ok(r) }
      case 'mailbox-delete': { const r = await deleteMailbox(body.address); await audit('mailbox_delete', r.address); return ok(r) }
      case 'alias-save': { const r = await saveAlias(body); await audit('mail_alias', r.address, { targets: body.targets }); return ok(r) }
      case 'alias-delete': { const r = await deleteAlias(body.address); await audit('mail_alias', r.address, { removed: true }); return ok(r) }
      case 'message-delete': { const r = await deleteMessage(body.box, body.folder, body.uid); await audit('mail_delete', body.box, { folder: body.folder, uid: body.uid }); return ok(r) }
      case 'send': { const r = await sendAs({ address: body.box, to: body.to, subject: body.subject, text: body.text, inReplyTo: body.inReplyTo }); await audit('mail_send', body.box, { to: r.to, subject: body.subject }); return ok(r) }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
