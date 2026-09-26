import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireReseller, resellerCan, resellerWholesaleMinor } from '@/modules/reseller/server/reseller'
import { presentOffer, resellerOwnerKey, validateOffer } from '@/modules/offers/server/offers'
import { legacyNumber } from '@/shared/money'

export async function GET(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'offers.view')) return err('forbidden', 403)
  const key = resellerOwnerKey(guard.reseller.id)
  const [offers, plans] = await Promise.all([db.serviceOffer.findMany({ where: { ownerKey: key }, include: { plan: { select: { name: true, nameEn: true } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }] }), db.plan.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true, price: true, priceMinor: true, trafficGB: true, days: true, deviceLimit: true, currency: true, panel: { select: { active: true } } }, orderBy: { sort: 'asc' } })])
  return ok({ offers: offers.map(presentOffer), plans: resellerCan(guard, 'offers.manage') ? plans.map(plan => ({ ...plan, priceMinor: undefined, wholesaleBase: legacyNumber(resellerWholesaleMinor(guard.reseller, plan, plan.trafficGB), plan.currency) })) : [] })
}

export async function POST(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'offers.manage')) return err('forbidden', 403)
  let input: Awaited<ReturnType<typeof validateOffer>>
  try { input = await validateOffer(await req.json(), resellerOwnerKey(guard.reseller.id)) } catch (error) { return err(error instanceof Error ? error.message : 'invalid offer') }
  const offer = await db.serviceOffer.create({ data: input })
  return ok({ id: offer.id }, 201)
}

export async function PATCH(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'offers.manage')) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const existing = Number.isSafeInteger(id) ? await db.serviceOffer.findUnique({ where: { id } }) : null
  if (!existing || existing.ownerKey !== resellerOwnerKey(guard.reseller.id)) return err('offer not found', 404)
  let input: Awaited<ReturnType<typeof validateOffer>>
  try { input = await validateOffer(body, existing.ownerKey) } catch (error) { return err(error instanceof Error ? error.message : 'invalid offer') }
  await db.serviceOffer.update({ where: { id }, data: input })
  return ok({ id })
}
