import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { sanitizeMessage, richTextToPlain } from '@/shared/content/sanitize'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { pathDisabled } from '@/platform/extensions/contracts'
import { createSupportTicket } from '@/modules/support/server/create-ticket'
import { isProblemKind, problemKindLabel } from '@/modules/support/domain/report-problem'
import { resolvePublicProblemContext } from '@/modules/support/server/report-context'

function host(value: string | null) {
  if (!value) return null
  try { return new URL(`https://${value}`).host } catch { return null }
}

function configuredHost() {
  try { return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null } catch { return null }
}

/** Create a contextual Support ticket from a server-verified public content page. */
export async function POST(req: NextRequest) {
  const source = mutationOrigin({
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    referer: req.headers.get('referer'),
    hasCookies: Boolean(req.headers.get('cookie')),
    hosts: [host(req.headers.get('host')), configuredHost()],
  })
  if (source !== 'allow') return err(source === 'foreign-origin' ? 'forbidden origin' : 'origin required', 403)
  const length = Number(req.headers.get('content-length') || 0)
  if (length > 8000) return err('Report details are too long.', 413)
  const user = await requireUser(req)
  if (!user) return err('Sign in to open a follow-up support conversation.', 401)
  if (!(await rateLimitStrict(`support:report-problem:${user.id}`, 10, 60 * 60_000)).ok) return err('Too many reports. Please try again later.', 429)

  const body = await req.json().catch(() => null)
  if (!isProblemKind(body?.kind)) return err('Choose a supported problem type.')
  const context = await resolvePublicProblemContext(body?.path)
  if (!context) return err('This page is not a public report target. Open a general ticket from Support.', 404)
  const runtime = await getPublicExtensionRuntime().catch(() => null)
  if (!runtime || pathDisabled('/dashboard/tickets', runtime)) return err('Support is unavailable.', 404)
  const general = await db.ticketDepartment.findUnique({ where: { slug: 'GENERAL' }, select: { active: true } }).catch(() => null)
  if (!general?.active) return err('General support is unavailable.', 404)

  const locale = await getUserLocale(user.id)
  const fa = locale === 'fa'
  const kind = problemKindLabel(body.kind, fa ? 'fa' : 'en')
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 2000) : ''
  const cleanTitle = context.title.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 140)
  const subject = `${fa ? 'گزارش مشکل' : 'Problem report'}: ${cleanTitle}`.slice(0, 200)
  const text = [
    fa ? 'گزارش مشکل از صفحهٔ عمومی' : 'Problem report from a public page',
    `${fa ? 'عنوان' : 'Title'}: ${cleanTitle}`,
    `${fa ? 'نشانی' : 'Page'}: ${context.path}`,
    `${fa ? 'نوع مشکل' : 'Problem type'}: ${kind}`,
    note ? `${fa ? 'توضیح مشتری' : 'Customer details'}: ${note}` : '',
  ].filter(Boolean).join('\n')
  const message = sanitizeMessage(text)
  if (!richTextToPlain(message)) return err('Report details are required.')

  try {
    const ticket = await createSupportTicket({ userId: user.id, subject, message, priority: 'normal', department: 'GENERAL', customFields: {} })
    return ok({ ticketId: ticket.id }, 201)
  } catch {
    return err('Could not create the support conversation. Please try again.', 500)
  }
}
