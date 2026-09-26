import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { promotionCode } from '@/modules/promotions/server/promotions'

function parseDate(value: unknown) {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) throw Error('invalid date')
  return date
}

function parseInput(body: any) {
  const code = promotionCode(body?.code)
  const kind = body?.kind === 'FIXED' ? 'FIXED' : 'PERCENT'
  const currency = normalizeCurrency(String(body?.currency || 'USD'))
  const value = Number(body?.value)
  const maxUses = Number(body?.maxUses ?? 0)
  const perUserLimit = Number(body?.perUserLimit ?? 1)
  const planId = body?.planId ? Number(body.planId) : null
  const startsAt = parseDate(body?.startsAt)
  const endsAt = parseDate(body?.endsAt)
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isFinite(value) || value <= 0 || kind === 'PERCENT' && value > 100 || !Number.isSafeInteger(maxUses) || maxUses < 0 || !Number.isSafeInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 10 || planId !== null && (!Number.isSafeInteger(planId) || planId <= 0) || startsAt && endsAt && endsAt <= startsAt) throw Error('invalid promotion')
  const amountMinor = kind === 'FIXED' ? toMinor(value, currency) : 0n
  const minSubtotalMinor = toMinor(body?.minSubtotal || 0, currency)
  if (amountMinor < 0n || minSubtotalMinor < 0n || amountMinor > 9_000_000_000_000n || minSubtotalMinor > 9_000_000_000_000n) throw Error('invalid amount')
  return { code, active: body?.active !== false, membersOnly: body?.membersOnly === true, kind, percentBps: kind === 'PERCENT' ? Math.round(value * 100) : 0, amountMinor, currency, planId, minSubtotalMinor, maxUses, perUserLimit, startsAt, endsAt }
}

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'plans.manage')) return err('forbidden', 403)
  const [rows, plans] = await Promise.all([db.promotion.findMany({ orderBy: { id: 'desc' }, take: 300 }), db.plan.findMany({ select: { id: true, name: true, nameEn: true }, orderBy: { sort: 'asc' } })])
  return ok({ promotions: rows.map(row => ({ ...row, amountMinor: undefined, minSubtotalMinor: undefined, value: row.kind === 'PERCENT' ? row.percentBps / 100 : legacyNumber(row.amountMinor, row.currency), minSubtotal: legacyNumber(row.minSubtotalMinor, row.currency) })), plans })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage')
  if (!admin) return err('forbidden', 403)
  let input: ReturnType<typeof parseInput>
  try { input = parseInput(await req.json()) } catch { return err('invalid promotion') }
  if (input.planId && !await db.plan.findUnique({ where: { id: input.planId } })) return err('plan not found', 404)
  if (await db.promotion.findUnique({ where: { code: input.code } })) return err('code already exists', 409)
  const row = await db.promotion.create({ data: input })
  await auditAdmin({ req, actor: admin, action: 'promotion.create', targetType: 'promotion', targetId: row.id, metadata: { code: row.code, kind: row.kind } })
  return ok({ id: row.id }, 201)
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid promotion id')
  const existing = await db.promotion.findUnique({ where: { id } })
  if (!existing) return err('not found', 404)
  let input: ReturnType<typeof parseInput>
  try { input = parseInput(body) } catch { return err('invalid promotion') }
  if (input.maxUses > 0 && input.maxUses < existing.reservedCount) return err('limit is below existing reservations')
  if (input.code !== existing.code && await db.promotion.findUnique({ where: { code: input.code } })) return err('code already exists', 409)
  if (input.planId && !await db.plan.findUnique({ where: { id: input.planId } })) return err('plan not found', 404)
  await db.promotion.update({ where: { id }, data: input })
  await auditAdmin({ req, actor: admin, action: 'promotion.update', targetType: 'promotion', targetId: id, metadata: { code: input.code, active: input.active } })
  return ok({ id })
}
