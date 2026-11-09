import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { metricsSnapshot } from '@/platform/observability/metrics'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { auditAdmin } from '@/platform/audit/server'
import { ok, err } from '@/platform/http/response'
import { AiError, generate } from '../client'
import { withPersonalAi } from '../admin-context'
import { SiteOpsError, groupErrors, parseSummary, summaryPrompt, type ErrorSample } from '../../domain/site-operations'

const DAY = 86_400_000
const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (e: unknown) => e instanceof SiteOpsError || e instanceof JsonBodyError || e instanceof AiError ? err(e.message, e.status) : err('گزارش خطاها فعلاً در دسترس نیست', 503)

/** Errors of the last week from the places the site already records them; nothing new is stored. */
async function collect(now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY), metrics = metricsSnapshot()
  const [jobs, mails, sms, ai] = await Promise.all([
    db.backgroundJob.findMany({ where: { status: 'FAILED', createdAt: { gte: since } }, orderBy: { id: 'desc' }, take: 300, select: { kind: true, lastError: true, finishedAt: true, createdAt: true } }),
    db.mailLog.findMany({ where: { status: 'FAILED', createdAt: { gte: since } }, orderBy: { id: 'desc' }, take: 200, select: { error: true, createdAt: true } }),
    db.smsLog.findMany({ where: { status: 'FAILED', createdAt: { gte: since } }, orderBy: { id: 'desc' }, take: 200, select: { event: true, error: true, createdAt: true } }),
    db.aiInvocation.findMany({ where: { status: 'FAILED', startedAt: { gte: since } }, orderBy: { startedAt: 'desc' }, take: 300, select: { purpose: true, provider: true, errorKind: true, errorStatus: true, startedAt: true } }),
  ])
  const samples: ErrorSample[] = [
    ...metrics.errors.map(e => ({ source: 'server' as const, at: e.at, event: e.event, message: e.message, path: e.path })),
    ...jobs.map(j => ({ source: 'job' as const, at: (j.finishedAt || j.createdAt).toISOString(), event: j.kind, message: j.lastError || 'job failed' })),
    ...mails.map(m => ({ source: 'mail' as const, at: m.createdAt.toISOString(), event: 'mail.send', message: m.error || 'mail failed' })),
    ...sms.map(s => ({ source: 'sms' as const, at: s.createdAt.toISOString(), event: s.event || 'sms.send', message: s.error || 'sms failed' })),
    ...ai.map(a => ({ source: 'ai' as const, at: a.startedAt.toISOString(), event: `ai.${a.purpose}`, message: `${a.provider} ${a.errorKind || 'failed'} ${a.errorStatus ?? ''}`.trim() })),
  ]
  return { since: since.toISOString(), processStartedAt: metrics.startedAt, total: samples.length, counts: { server: metrics.errors.length, job: jobs.length, mail: mails.length, sms: sms.length, ai: ai.length }, groups: groupErrors(samples) }
}

export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  try { return reply(await collect()) } catch (e) { return failure(e) }
}

/** POST { action:'summarize' } — an AI reading of the same groups; bounded, audited, never an action. */
export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const admin = await requirePerm(req, 'settings.manage'); if (!admin) return err('دسترسی مجاز نیست', 403)
  const site = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(site) || mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(site).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  if (!(await rateLimitStrict(`ai:site-ops:${admin.id}`, 10, 600000)).ok) return err('درخواست زیاد است؛ کمی بعد دوباره امتحان کنید', 429)
  try {
    const body = await readJsonObject(req, 2000)
    if (body.action !== 'summarize') throw new SiteOpsError('عملیات معتبر نیست')
    const { groups } = await collect()
    if (!groups.length) throw new SiteOpsError('خطایی برای خلاصه کردن نیست', 409)
    const result = await withPersonalAi(admin.id, () => generate({ system: 'فقط JSON معتبر برگردان.', user: summaryPrompt(groups), maxTokens: 1200, json: true }), 'operations')
    const summary = parseSummary(result.text, groups.map(g => g.id))
    await auditAdmin({ req, actor: admin, action: 'ai.site-operations.summary', targetType: 'site', targetId: 'errors', metadata: { groups: groups.length, model: result.model } })
    return reply({ ...summary, model: result.model })
  } catch (e) { return failure(e) }
}
