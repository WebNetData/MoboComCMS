import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { NewsletterError } from '@/modules/mail/domain/newsletter'
import {
  audienceSizes, campaignCancel, campaignDelete, campaignDuplicate, campaignGet, campaignList, campaignPreview, campaignReport, campaignSave, campaignSchedule,
  campaignTest, exportSubscribers, getNewsletterSettings, importSubscribers, removeSubscriber, runNewsletter, saveNewsletterSettings, subscribe, subscriberList,
  trackClick, trackOpen, unsubscribe, verifySignature,
} from '@/modules/mail/server/newsletter'

function failure(error: unknown) {
  if (error instanceof NewsletterError) return err(error.message, error.status)
  console.error('[newsletter]', error)
  return err('انجام نشد؛ دوباره تلاش کنید', 500)
}

/** POST /api/newsletter/subscribe {email, name?} */
export async function POST_subscribe(req: NextRequest) {
  if (!rateLimitHit(`newsletter:${clientIp(req.headers)}`, 6, 10 * 60_000).ok) return err('تلاش‌های زیادی انجام شد؛ کمی بعد دوباره امتحان کنید', 429)
  const body = (await req.json().catch(() => null)) || {}
  const user = await requireUser(req).catch(() => null)
  try { return ok(await subscribe({ email: body.email, name: body.name, source: 'form', userId: user?.id ?? null })) } catch (error) { return failure(error) }
}

/** POST /api/newsletter/unsubscribe?t= (also the one-click List-Unsubscribe target) */
export async function POST_unsubscribe(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const value = req.nextUrl.searchParams.get('t') || String(form?.get('t') || '')
  const email = await unsubscribe(value)
  if (req.headers.get('content-type')?.includes('form')) return NextResponse.redirect(new URL(`/newsletter/unsubscribe?done=${email ? 1 : 0}`, req.url), 303)
  return email ? ok({ unsubscribed: true }) : err('پیوند لغو عضویت معتبر نیست', 404)
}

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** GET /api/newsletter/o/<token>.gif — open pixel. */
export async function GET_open(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const raw = (await context.params).token.replace(/\.gif$/, '')
  if (/^[A-Za-z0-9_-]{10,60}$/.test(raw)) await trackOpen(raw).catch(() => undefined)
  return new NextResponse(PIXEL, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0', 'Content-Length': String(PIXEL.length) } })
}

/** GET /api/newsletter/c/<token>?u=<url>&s=<signature> — counts the click and forwards. */
export async function GET_click(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const raw = (await context.params).token
  const target = req.nextUrl.searchParams.get('u') || ''
  const valid = /^https?:\/\//i.test(target) && verifySignature(target, req.nextUrl.searchParams.get('s') || '')
  if (!valid) return NextResponse.redirect(new URL('/', req.url), 302)
  if (/^[A-Za-z0-9_-]{10,60}$/.test(raw)) await trackClick(raw).catch(() => undefined)
  return NextResponse.redirect(target, 302)
}

// ------------------------------------------------------------------ admin

const newsletterAdmin = (req: NextRequest) => adminGuard(req, null, ['settings.manage', 'cms.posts'])

/** GET /api/admin/newsletter?view=campaigns|campaign&id=|report&id=|subscribers&q=&status=&page=|sizes|export */
export async function GET_admin(req: NextRequest) {
  const guard = await newsletterAdmin(req)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view') || 'campaigns') {
      case 'campaigns': return ok({ campaigns: await campaignList(), settings: await getNewsletterSettings() })
      case 'campaign': return ok(await campaignGet(q.get('id')))
      case 'report': return ok(await campaignReport(q.get('id')))
      case 'subscribers': return ok(await subscriberList({ q: q.get('q'), status: q.get('status'), page: q.get('page') }))
      case 'sizes': return ok(await audienceSizes())
      case 'export': return new NextResponse(await exportSubscribers(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="newsletter-subscribers.csv"' } })
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

/** POST /api/admin/newsletter {op, …} */
export async function POST_admin(req: NextRequest) {
  const guard = await newsletterAdmin(req)
  if ('response' in guard) return guard.response
  const admin = guard.admin
  const body = (await req.json().catch(() => null)) || {}
  const audit = (action: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: admin, action: `newsletter.${action}`, targetType: 'newsletter', targetId: String(target ?? ''), metadata })
  try {
    switch (body.op) {
      case 'save': { const row = await campaignSave(body.campaign || {}, admin.id); await audit('save', row.id); return ok(row) }
      case 'schedule': { const row = await campaignSchedule(body.id, body.at); await audit('schedule', row.id, { at: row.scheduledAt }); return ok(row) }
      case 'cancel': { const row = await campaignCancel(body.id); await audit('cancel', row.id); return ok(row) }
      case 'duplicate': return ok(await campaignDuplicate(body.id, admin.id))
      case 'delete': { await campaignDelete(body.id); await audit('delete', body.id); return ok({ deleted: true }) }
      case 'test': return ok(await campaignTest(body.campaign || {}, body.to))
      case 'preview': return ok({ html: await campaignPreview(body.campaign || {}) })
      case 'import': { const r = await importSubscribers(body.text); await audit('import', '', r); return ok(r) }
      case 'remove-subscriber': { await removeSubscriber(body.id); return ok({ removed: true }) }
      case 'settings': return ok(await saveNewsletterSettings(body.settings || {}))
      case 'run-now': return ok(await runNewsletter())
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
