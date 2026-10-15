import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { businessTransaction } from './commands'
import { BusinessError } from '../domain/businesses'
import { businessId, normalizeBusinessProfile } from '../domain/profiles'
import { normalizeBusinessRequest } from '../domain/requests'
import { getExtensionState } from '@/extensions/server/state'

export async function businessRequestPolicy() {
  const { settings } = await getExtensionState('businesses')
  return { suggestions: settings['allow-suggestions'] === undefined || settings['allow-suggestions'] === true, claims: settings['allow-claims'] === undefined || settings['allow-claims'] === true }
}

/** Requests belong to Businesses; ratings, identities and staff authority retain their existing owners. */
export async function requestBusiness(req: NextRequest, input: Record<string, unknown>) {
  const data = normalizeBusinessRequest(input)
  return businessTransaction(req, false, async (tx, actor) => {
    const { settings } = await getExtensionState('businesses', [], tx, true)
    const key = data.kind === 'CLAIM' ? 'allow-claims' : 'allow-suggestions'
    if (settings[key] !== undefined && settings[key] !== true) throw new BusinessError('ثبت این نوع درخواست در حال حاضر فعال نیست', 403)
    if (await tx.businessRequest.count({ where: { requesterId: actor.id, status: 'PENDING' } }) >= 5) throw new BusinessError('ابتدا منتظر بررسی درخواست‌های قبلی بمانید', 409)
    if (data.kind === 'CLAIM') {
      const business = await tx.businessProfile.findFirst({ where: { id: data.businessId!, status: 'PUBLISHED', kind: 'EXTERNAL' } })
      if (!business) throw new BusinessError('کسب‌وکار پیدا نشد', 404)
      if (business.representativeId) throw new BusinessError('نمایندهٔ این کسب‌وکار قبلاً تعیین شده است', 409)
      data.domain = business.domain!; data.name = business.name
    } else if (await tx.businessProfile.findUnique({ where: { domain: data.domain } })) throw new BusinessError('این دامنه قبلاً ثبت شده است؛ آن را در فهرست جست‌وجو کنید', 409)
    if (await tx.businessRequest.findFirst({ where: { requesterId: actor.id, kind: data.kind, domain: data.domain, status: 'PENDING' } })) throw new BusinessError('درخواست شما قبلاً ثبت شده و در انتظار بررسی است', 409)
    const saved = await tx.businessRequest.create({ data: { ...data, requesterId: actor.id } })
    return { id: saved.id, status: saved.status }
  })
}

export async function decideBusinessRequest(req: NextRequest, input: Record<string, unknown>) {
  const id = businessId(input.requestId)
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') throw new BusinessError('تصمیم معتبر نیست')
  const decision = input.decision
  const note = typeof input.decisionNote === 'string' ? input.decisionNote.trim() : ''
  if (note.length < 10 || note.length > 600) throw new BusinessError('نتیجهٔ بررسی را بین ۱۰ تا ۶۰۰ نویسه بنویسید')
  return businessTransaction(req, true, async (tx, actor) => {
    const request = await tx.businessRequest.findUnique({ where: { id } })
    if (!request || request.status !== 'PENDING') throw new BusinessError('این درخواست قبلاً بررسی شده یا پیدا نشد', 409)
    let businessId = request.businessId
    if (decision === 'APPROVED') {
      if (!await tx.user.findFirst({ where: { id: request.requesterId, status: 'ACTIVE' } })) throw new BusinessError('حساب درخواست‌کننده فعال نیست', 409)
      if (request.kind === 'CLAIM') {
        if (request.requesterId === actor.id) throw new BusinessError('نمایندگی خود را نمی‌توانید تأیید کنید؛ مدیر دیگری باید بررسی کند', 403)
        if (input.acknowledgeRepresentative !== true) throw new BusinessError('بررسی ارتباط حساب و کسب‌وکار را تأیید کنید')
        const assigned = await tx.businessProfile.updateMany({ where: { id: businessId!, kind: 'EXTERNAL', status: 'PUBLISHED', representativeId: null }, data: { representativeId: request.requesterId } })
        if (assigned.count !== 1) throw new BusinessError('وضعیت نماینده یا کسب‌وکار تغییر کرده است', 409)
      } else {
        const data = normalizeBusinessProfile({ kind: 'EXTERNAL', name: request.name, website: request.website, category: request.category, description: '', status: 'PUBLISHED', slug: input.slug })
        businessId = (await tx.businessProfile.create({ data })).id
      }
    }
    const changed = await tx.businessRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: decision, decisionNote: note, reviewerId: actor.id, businessId } })
    if (changed.count !== 1) throw new BusinessError('وضعیت درخواست تغییر کرده است', 409)
    await auditAdminStrict({ req, actor, action: `businesses.request.${decision.toLowerCase()}`, targetType: 'business-request', targetId: id, metadata: { kind: request.kind, businessId } }, tx)
    return { ok: true }
  })
}

/** No requester, representative or staff identifiers leave the owner/staff views. */
export async function myBusinessRequests(userId: number) {
  return db.businessRequest.findMany({ where: { requesterId: userId }, orderBy: { id: 'desc' }, take: 50, select: { id: true, kind: true, name: true, domain: true, status: true, decisionNote: true, createdAt: true, business: { select: { slug: true, status: true } } } })
}
