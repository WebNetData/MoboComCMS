import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { DemandError, demandDraft, demandId, demandSection, demandText } from '@/modules/support/domain/demand'
import { parseDemandTarget, resolveDemandTarget, storedDemandTarget, targetFields } from './targets'

export async function demandManager(req: NextRequest, section: string, tx: Prisma.TransactionClient | typeof db = db) {
  const owner = demandSection(section)
  if (!owner || !await isModuleEnabled(owner.module)) throw new DemandError('این بخش فعال نیست', 404)
  const user = await requirePerm(req, owner.permission, tx)
  if (!user) throw new DemandError('دسترسی این بخش را ندارید', 403)
  if (section === 'forum') {
    const { viewerFor } = await import('@/modules/forum/server/forum')
    if (!(await viewerFor(user.id)).moderator) throw new DemandError('مدیر کل تالار باید رسیدگی کند', 403)
  }
  return user
}
export async function submitDemand(req: NextRequest, raw: Record<string, unknown>) {
  const draft = demandDraft(raw), owner = demandSection(draft.section)!
  if (!await isModuleEnabled(owner.module) || !await isModuleEnabled('support')) throw new DemandError('ثبت درخواست در این بخش فعال نیست', 404)
  try {
    return await db.$transaction(async tx => {
      const user = await requireUser(req, tx)
      if (!user) throw new DemandError('برای ثبت و پیگیری درخواست وارد حساب شوید', 401)
      let demand = await tx.contentDemand.findUnique({ where: { section_normalizedTitle: { section: draft.section, normalizedTitle: draft.normalizedTitle } } })
      if (demand && demandId(raw.joinDemandId) !== demand.id) throw new DemandError('درخواست مشابه موجود است؛ ابتدا آن را بررسی و پیوستن را تأیید کنید', 409)
      if (!demand) demand = await tx.contentDemand.create({ data: { section: draft.section, title: draft.title, normalizedTitle: draft.normalizedTitle } })
      if (demand.status === 'DECLINED') throw new DemandError('این مورد فعلاً قابل انجام نیست؛ نتیجهٔ قبلی را بررسی کنید', 409)
      await tx.contentDemandSupporter.upsert({ where: { demandId_userId: { demandId: demand.id, userId: user.id } }, create: { demandId: demand.id, userId: user.id, note: draft.note }, update: {} })
      if (demand.status === 'FULFILLED') await enqueue('support.demand-fulfilled', { demandId: demand.id, version: demand.version, userId: user.id }, { dedupeKey: `demand:${demand.id}:${demand.version}:user:${user.id}` }, tx)
      return { id: demand.id, status: demand.status }
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (['P2002', 'P2034'].includes(String((error as { code?: string }).code))) throw new DemandError('درخواست هم‌زمان تغییر کرد؛ فهرست مشابه‌ها را دوباره بررسی کنید', 409)
    throw error
  }
}
export async function decideDemand(req: NextRequest, raw: Record<string, unknown>) {
  const id = demandId(raw.id), version = demandId(raw.version), status = String(raw.status), section = String(raw.section)
  if (!id || !version || !['REVIEWING', 'FULFILLED', 'DECLINED'].includes(status)) throw new DemandError('تصمیم یا نسخه معتبر نیست')
  return db.$transaction(async tx => {
    const actor = await demandManager(req, section, tx)
    const row = await tx.contentDemand.findFirst({ where: { id, section, version } })
    if (!row || !['OPEN', 'REVIEWING'].includes(row.status)) throw new DemandError('درخواست تغییر کرده یا رسیدگی به آن پایان یافته است', 409)
    const target = status === 'FULFILLED' ? parseDemandTarget(section, raw) : null
    if (status === 'FULFILLED' && (!target || !await resolveDemandTarget(section, target, tx))) throw new DemandError('مقصد باید متعلق به همین بخش و هم‌اکنون عمومی و آماده باشد', 409)
    const note = demandText(raw.note, 1500)
    if (status === 'DECLINED' && note.length < 3) throw new DemandError('دلیل پاسخ را برای درخواست‌کنندگان بنویسید')
    const changed = await tx.contentDemand.updateMany({ where: { id, section, status: row.status, version }, data: { status, version: { increment: 1 }, decisionNote: note, decidedById: actor.id, ...Object.fromEntries(targetFields.map(key => [key, target?.[key] || null])) } })
    if (!changed.count) throw new DemandError('نسخهٔ درخواست عوض شد؛ تازه‌سازی کنید', 409)
    await auditAdminStrict({ req, actor, action: 'support.demand.decide', targetType: 'content-demand', targetId: id, metadata: { section, before: row.status, status, version, target } }, tx)
    if (status === 'FULFILLED') await enqueue('support.demand-fulfilled', { demandId: id, version: version + 1 }, { dedupeKey: `demand:${id}:${version + 1}` }, tx)
    return { id, version: version + 1, status }
  }, { isolationLevel: 'Serializable' })
}
/** Replay-safe in-account notices. The owned request page revalidates the target before showing its link. */
export async function deliverDemandFulfilled(payload: Record<string, unknown>) {
  const id = demandId(payload.demandId), version = demandId(payload.version), cursor = Number(payload.cursor) || 0, userId = demandId(payload.userId)
  if (!await isModuleEnabled('support')) return { done: true, skipped: 'support-off' }
  const row = await db.contentDemand.findUnique({ where: { id } })
  if (!row || row.version !== version || row.status !== 'FULFILLED') return { done: true, skipped: 'changed' }
  const target = await resolveDemandTarget(row.section, storedDemandTarget(row))
  if (!target) return { done: true, skipped: 'target-not-public' }
  const supporters = await db.contentDemandSupporter.findMany({ where: { demandId: id, userId: userId || { gt: cursor }, user: { status: 'ACTIVE' } }, orderBy: { userId: 'asc' }, take: 50 })
  for (const supporter of supporters) await createInboxEvent({ userId: supporter.userId, kind: 'CONTENT_DEMAND_FULFILLED', dedupeKey: `demand:${id}:version:${version}:user:${supporter.userId}`, titleFa: 'درخواست شما آماده شد', titleEn: 'Your request is available', bodyFa: `${row.title} — ${target.title}؛ مشاهدهٔ مورد آماده‌شده در پیگیری درخواست`, bodyEn: row.title, href: `/dashboard/content-requests?id=${id}`, channels: [] })
  return { done: supporters.length < 50, cursor: supporters.at(-1)?.userId || cursor }
}
