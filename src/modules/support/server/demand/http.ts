import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok as jsonOk } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { moduleGuard, isModuleEnabled } from '@/extensions/server/modules'
import { DemandError, demandSection, demandTitleKey, demandText } from '@/modules/support/domain/demand'
import { decideDemand, demandManager, submitDemand } from './commands'
import { resolveDemandTarget, storedDemandTarget } from './targets'

const ok = (value: unknown, status = 200) => { const response = jsonOk(value, status); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (error: unknown) => error instanceof DemandError ? err(error.message, error.status) : err('درخواست انجام نشد؛ دوباره تلاش کنید', 503)
export async function GET(req: NextRequest) {
  const off = await moduleGuard('support'); if (off) return off
  try {
    const section = demandSection(req.nextUrl.searchParams.get('section'))
    if (req.nextUrl.searchParams.get('similar') === '1') {
      if (!section || !await isModuleEnabled(section.module)) return err('بخش فعال نیست', 404)
      if (!(await rateLimitStrict(`demand-preview:${clientIp(req.headers)}`, 50)).ok) return err('کمی بعد تلاش کنید', 429)
      const key = demandTitleKey(demandText(req.nextUrl.searchParams.get('title'), 160))
      const row = key.length >= 2 ? await db.contentDemand.findUnique({ where: { section_normalizedTitle: { section: section.id, normalizedTitle: key } }, select: { id: true, title: true, status: true, _count: { select: { supporters: true } } } }) : null
      return ok({ similar: row ? { id: row.id, title: row.title, status: row.status, count: row._count.supporters } : null })
    }
    if (req.nextUrl.searchParams.get('admin') === '1') {
      if (!section) return err('بخش را انتخاب کنید')
      await demandManager(req, section.id)
      const rows = await db.contentDemand.findMany({ where: { section: section.id }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, include: { _count: { select: { supporters: true } }, supporters: { select: { note: true }, orderBy: { createdAt: 'desc' }, take: 10 } } })
      return ok({ requests: await Promise.all(rows.map(async row => ({ id: row.id, section: row.section, title: row.title, status: row.status, version: row.version, count: row._count.supporters, notes: row.supporters.map(item => item.note).filter(Boolean), decisionNote: row.decisionNote, target: row.status === 'FULFILLED' ? await resolveDemandTarget(row.section, storedDemandTarget(row)) : null }))) })
    }
    const user = await requireUser(req); if (!user) return err('ابتدا وارد حساب شوید', 401)
    const rows = await db.contentDemandSupporter.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { demand: true } })
    return ok({ requests: await Promise.all(rows.map(async item => ({ id: item.demand.id, section: item.demand.section, title: item.demand.title, status: item.demand.status, note: item.note, decisionNote: item.demand.decisionNote, target: item.demand.status === 'FULFILLED' ? await resolveDemandTarget(item.demand.section, storedDemandTarget(item.demand)) : null }))) })
  } catch (error) { return failure(error) }
}
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin || !originIsThisSite(origin, req.headers.get('host') || req.nextUrl.host)) return err('forbidden origin', 403)
  const off = await moduleGuard('support'); if (off) return off
  const user = await requireUser(req); if (!user) return err('برای ثبت و پیگیری درخواست وارد حساب شوید', 401)
  if (!(await rateLimitStrict(`demand-submit:${user.id}`, 10, 3600_000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  try { const body = await readJsonObject(req, 8192); return ok(await (body.action === 'decide' ? decideDemand(req, body) : submitDemand(req, body)), body.action === 'decide' ? 200 : 201) } catch (error) { return failure(error) }
}
