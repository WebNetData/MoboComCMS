import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { requirePerm } from '@/modules/identity/server/access'
import { getSmtp, mailLog, previewNotification, publicSmtp, saveSmtp, sendMail, verifySmtp } from '@/modules/mail/server/mailer'

// Admin → «ایمیل سایت»: the outgoing account (Gmail or any SMTP), user
// notification emails, test send and the sent log. Independent of the
// server panel, so it works without a mail server on this machine.

/** GET /api/admin/email  |  ?view=log&status=&page=  |  ?view=preview */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const view = req.nextUrl.searchParams.get('view')
  if (view === 'log') return ok(await mailLog({ page: req.nextUrl.searchParams.get('page'), status: req.nextUrl.searchParams.get('status') }))
  if (view === 'preview') {
    const email = await previewNotification()
    return new Response(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'no-store' } })
  }
  return ok({ smtp: await publicSmtp() })
}

/** POST /api/admin/email {op: save|verify|test, …} */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null) as { op?: string; settings?: unknown; to?: unknown } | null
  switch (body?.op) {
    case 'save': {
      const result = await saveSmtp(body.settings)
      if (!result.ok) return err(result.error)
      await auditAdmin({ req, actor: admin, action: 'mail.settings', targetType: 'setting', targetId: 'mail.smtp.v1' })
      return ok({ smtp: await publicSmtp() })
    }
    case 'verify': return ok(await verifySmtp())
    case 'test': {
      if (!rateLimitHit(`mail-test:${admin.id}`, 10, 10 * 60_000).ok) return err('ارسال آزمایشی زیاد بود؛ چند دقیقه صبر کنید', 429)
      const email = await previewNotification()
      const result = await sendMail({ to: String(body.to || ''), subject: `ایمیل آزمایشی — ${email.subject}`, text: email.text, html: email.html, source: 'test', actorId: admin.id }, await getSmtp())
      await auditAdmin({ req, actor: admin, action: 'mail.test', targetType: 'email', targetId: String(body.to || '').slice(0, 200), metadata: { ok: result.ok } })
      return result.ok ? ok(result) : err(result.error, 502)
    }
    default: return err('عملیات نامعتبر است')
  }
}
