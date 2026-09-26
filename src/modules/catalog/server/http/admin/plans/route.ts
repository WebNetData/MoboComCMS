import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { normalizeAccess } from '@/modules/membership/domain/membership'

/** VIP fields shared by create and update. */
function vipFields(b: any, currency: string, priceMinor: bigint | null) {
  const data: Record<string, unknown> = {}
  if (b?.access !== undefined) data.access = normalizeAccess(b.access)
  if (b?.memberPrice !== undefined) {
    const minor = b.memberPrice === '' || b.memberPrice === null ? 0n : toMinor(String(b.memberPrice), currency)
    if (minor < 0n || (minor > 0n && priceMinor !== null && minor >= priceMinor)) throw Error('VIP price must be lower than the regular price')
    data.memberPriceMinor = minor
  }
  if (b?.vipGiftDays !== undefined) {
    const days = b.vipGiftDays === '' ? 0 : Number(b.vipGiftDays)
    if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw Error('Invalid VIP gift days')
    data.vipGiftDays = days
  }
  return data
}

const serialize = (plan: { memberPriceMinor: bigint; currency: string } & Record<string, unknown>) => ({ ...plan, memberPrice: plan.memberPriceMinor ? legacyNumber(plan.memberPriceMinor, plan.currency) : '' })

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const plans = await db.plan.findMany({ orderBy: { sort: 'asc' }, include: { panel: { select: { name: true } } } })
  return ok(plans.map(serialize))
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const name = String(b?.name || '').trim()
  if (!name) return err('نام پلن الزامی است')
  const nameEn = String(b?.nameEn || '').trim()
  if (!nameEn) return err('English plan name is required')
  const currency = normalizeCurrency(b?.currency || 'USD')
  let priceMinor: bigint
  try { priceMinor = toMinor(String(b?.price ?? '0'), currency) } catch (e) { return err(e instanceof Error ? e.message : 'invalid price') }
  let vip: Record<string, unknown>
  try { vip = vipFields(b, currency, priceMinor) } catch (e) { return err(e instanceof Error ? e.message : 'invalid VIP settings') }
  const plan = await db.plan.create({
    data: {
      name,
      nameEn,
      description: String(b?.description || ''),
      descriptionEn: String(b?.descriptionEn || ''),
      trafficGB: Math.max(1, Number(b?.trafficGB) || 10),
      days: Math.max(1, Number(b?.days) || 30),
      deviceLimit: Math.max(1, Number(b?.deviceLimit) || 2),
      price: legacyNumber(priceMinor, currency),
      priceMinor,
      currency,
      active: b?.active !== false,
      featured: b?.featured === true,
      sort: Number(b?.sort) || 0,
      panelId: Number(b?.panelId) || null,
      ...vip,
    },
  })
  return ok(serialize(plan))
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const data: Record<string, unknown> = {}
  for (const k of ['name', 'nameEn', 'description', 'descriptionEn']) {
    if (typeof b?.[k] === 'string') data[k] = b[k]
  }
  if (typeof data.nameEn === 'string' && !data.nameEn.trim()) return err('English plan name is required')
  for (const k of ['trafficGB', 'days', 'deviceLimit', 'sort', 'panelId']) {
    if (b?.[k] !== undefined && b?.[k] !== null && b?.[k] !== '') data[k] = Number(b[k])
  }
  const current = await db.plan.findUnique({ where: { id }, select: { currency: true, price: true } })
  if (!current) return err('not found', 404)
  const currency = b?.currency !== undefined ? normalizeCurrency(b.currency) : current.currency
  if (b?.currency !== undefined) data.currency = currency
  if (b?.price !== undefined) {
    try {
      const minor = toMinor(String(b.price), currency)
      data.priceMinor = minor
      data.price = legacyNumber(minor, currency)
    } catch (e) { return err(e instanceof Error ? e.message : 'invalid price') }
  } else if (b?.currency !== undefined && currency !== normalizeCurrency(current.currency)) {
    return err('changing currency requires an explicit price; automatic FX conversion is not performed')
  }
  if (b?.active !== undefined) data.active = Boolean(b.active)
  if (b?.featured !== undefined) data.featured = Boolean(b.featured)
  try {
    const effectiveMinor = (data.priceMinor as bigint | undefined) ?? (await db.plan.findUnique({ where: { id }, select: { priceMinor: true } }))?.priceMinor ?? null
    Object.assign(data, vipFields(b, currency, effectiveMinor))
  } catch (e) { return err(e instanceof Error ? e.message : 'invalid VIP settings') }
  const plan = await db.plan.update({ where: { id }, data })
  return ok(serialize(plan))
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const inUse = await db.subscription.findFirst({ where: { planId: id } })
  if (inUse) {
    await db.plan.update({ where: { id }, data: { active: false } })
    return ok({ deactivated: true, message: 'پلن در حال استفاده است؛ غیرفعال شد' })
  }
  await db.plan.delete({ where: { id } })
  return ok({ deleted: true })
}
