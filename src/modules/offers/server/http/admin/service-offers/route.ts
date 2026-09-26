import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { presentOffer, validateOffer } from '@/modules/offers/server/offers'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'plans.manage')) return err('forbidden', 403)
  const [offers, plans] = await Promise.all([db.serviceOffer.findMany({ where: { ownerKey: 'SITE' }, include: { plan: { select: { name: true, nameEn: true } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }] }), db.plan.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true, trafficGB: true, days: true, deviceLimit: true, currency: true, panel: { select: { active: true } } }, orderBy: { sort: 'asc' } })])
  return ok({ offers: offers.map(presentOffer), plans })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage')
  if (!admin) return err('forbidden', 403)
  let input: Awaited<ReturnType<typeof validateOffer>>
  try { input = await validateOffer(await req.json(), 'SITE') } catch (error) { return err(error instanceof Error ? error.message : 'invalid offer') }
  const offer = await db.serviceOffer.create({ data: input })
  await auditAdmin({ req, actor: admin, action: 'service_offer.create', targetType: 'service_offer', targetId: offer.id })
  return ok({ id: offer.id }, 201)
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const existing = Number.isSafeInteger(id) ? await db.serviceOffer.findUnique({ where: { id } }) : null
  if (!existing || existing.ownerKey !== 'SITE') return err('offer not found', 404)
  let input: Awaited<ReturnType<typeof validateOffer>>
  try { input = await validateOffer(body, 'SITE') } catch (error) { return err(error instanceof Error ? error.message : 'invalid offer') }
  await db.serviceOffer.update({ where: { id }, data: input })
  await auditAdmin({ req, actor: admin, action: 'service_offer.update', targetType: 'service_offer', targetId: id })
  return ok({ id })
}
