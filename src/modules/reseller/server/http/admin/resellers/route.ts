import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { resellerUsage, usageReport } from '@/modules/reseller/server/reseller'
import { walletBalances, walletBalancesForUsers, type WalletBalanceView } from '@/modules/wallet/server/wallet'
import { auditAdmin } from '@/platform/audit/server'


const LIMIT_FIELDS = [
  'maxAccounts',
  'maxActiveAccounts',
  'trafficQuotaGB',
  'maxTrafficPerAccountGB',
  'maxDaysPerAccount',
  'maxDevicesPerAccount',
] as const
const BOOL_FIELDS = ['allowUnlimitedTraffic', 'allowUnlimitedDays', 'active'] as const

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 18 }, () => chars[randomInt(chars.length)]).join('')
}

function serialize(r: any, usage?: Awaited<ReturnType<typeof resellerUsage>>, walletBalances: WalletBalanceView[] = []) {
  const base = {
    id: r.id,
    userId: r.userId,
    active: r.active,
    priceMode: r.priceMode,
    discountPercent: r.discountPercent,
    maxAccounts: r.maxAccounts,
    maxActiveAccounts: r.maxActiveAccounts,
    trafficQuotaGB: r.trafficQuotaGB,
    maxTrafficPerAccountGB: r.maxTrafficPerAccountGB,
    allowUnlimitedTraffic: r.allowUnlimitedTraffic,
    maxDaysPerAccount: r.maxDaysPerAccount,
    allowUnlimitedDays: r.allowUnlimitedDays,
    maxDevicesPerAccount: r.maxDevicesPerAccount,
    note: r.note,
    createdAt: r.createdAt,
    user: r.user ? { id: r.user.id, email: r.user.email, name: r.user.name, walletBalance: r.user.walletBalance, walletBalances, status: r.user.status } : null,
    prices: r.prices ? r.prices.map((p: any) => ({ planId: p.planId, price: p.price, planName: p.plan?.name || '', currency: p.plan?.currency || 'USD' })) : [],
  }
  return usage ? { ...base, usage: usageReport(r, usage) } : base
}

/** GET /api/admin/resellers — every contract with live usage. */
export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'resellers.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const rows = await db.reseller.findMany({
    orderBy: { id: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true, walletBalance: true, status: true } },
      prices: { include: { plan: { select: { name: true, currency: true } } } },
    },
  })
  const balanceMap = await walletBalancesForUsers(rows.map((r) => r.userId))
  const [bots, sales] = await Promise.all([db.resellerBot.findMany({ where: { resellerId: { in: rows.map(r => r.id) } }, select: { resellerId: true, username: true, active: true, lastError: true } }), db.resellerSale.groupBy({ by: ['resellerId', 'status'], where: { resellerId: { in: rows.map(r => r.id) } }, _count: { _all: true } })])
  const withUsage = await Promise.all(rows.map(async (r) => ({ ...serialize(r, await resellerUsage(r.id), balanceMap.get(r.userId) || []), bot: bots.find(bot => bot.resellerId === r.id) || null, botSales: sales.filter(s => s.resellerId === r.id).reduce((sum, s) => sum + s._count._all, 0), botReview: sales.filter(s => s.resellerId === r.id && ['REVIEW', 'NEEDS_REVIEW'].includes(s.status)).reduce((sum, s) => sum + s._count._all, 0) })))

  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, select: { id: true, name: true, price: true, currency: true, trafficGB: true, days: true } })
  const [totalAccounts, totalTraffic] = await Promise.all([
    db.subscription.count({ where: { resellerId: { not: null } } }),
    db.subscription.aggregate({ where: { resellerId: { not: null } }, _sum: { trafficLimit: true } }),
  ])

  return ok({
    resellers: withUsage,
    plans,
    summary: {
      count: rows.length,
      active: rows.filter((r) => r.active).length,
      accounts: totalAccounts,
      trafficGrantedGB: totalTraffic._sum.trafficLimit || 0,
    },
  })
}

/** POST /api/admin/resellers — create a contract (and the login when needed). */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'resellers.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const b = await req.json().catch(() => null)
  const email = String(b?.email || '').trim().toLowerCase()
  const userId = Number(b?.userId) || 0
  if (!email && !userId) return err('an email or a user id is required', 400)

  let user = userId
    ? await db.user.findUnique({ where: { id: userId } })
    : await db.user.findUnique({ where: { email } })
  let generatedPassword = ''
  if (!user) {
    if (!email.includes('@')) return err('a valid email is required', 400)
    generatedPassword = randomPassword()
    user = await db.user.create({
      data: {
        email,
        passwordHash: bcrypt.hashSync(generatedPassword, 10),
        name: String(b?.name || email.split('@')[0]),
        role: 'CUSTOMER',
        roleId: await db.role.findUnique({ where: { name: 'reseller' } }).then((r) => r?.id ?? null),
        note: 'reseller account',
      },
    })
  }
  if (!user) return err('user not found', 404)

  const existing = await db.reseller.findUnique({ where: { userId: user.id } })
  if (existing) return err('this user is already a reseller', 400)

  const limits: Record<string, number> = {}
  for (const field of LIMIT_FIELDS) limits[field] = Math.max(0, Math.round(Number(b?.[field]) || 0))
  const flags: Record<string, boolean> = {}
  for (const field of BOOL_FIELDS) flags[field] = Boolean(b?.[field])

  const reseller = await db.reseller.create({
    data: {
      userId: user.id,
      active: b?.active !== false,
      priceMode: b?.priceMode === 'CUSTOM' ? 'CUSTOM' : 'DISCOUNT',
      discountPercent: Math.min(Math.max(Number(b?.discountPercent) || 0, 0), 100),
      note: String(b?.note || ''),
      maxAccounts: limits.maxAccounts,
      maxActiveAccounts: limits.maxActiveAccounts,
      trafficQuotaGB: limits.trafficQuotaGB,
      maxTrafficPerAccountGB: limits.maxTrafficPerAccountGB,
      maxDaysPerAccount: limits.maxDaysPerAccount,
      maxDevicesPerAccount: limits.maxDevicesPerAccount,
      allowUnlimitedTraffic: flags.allowUnlimitedTraffic,
      allowUnlimitedDays: flags.allowUnlimitedDays,
    },
  })

  const prices = Array.isArray(b?.prices) ? b.prices : []
  for (const p of prices) {
    const planId = Number(p?.planId)
    const price = Number(p?.price)
    if (!planId || !(price >= 0)) continue
    await db.resellerPrice.upsert({
      where: { resellerId_planId: { resellerId: reseller.id, planId } },
      update: { price },
      create: { resellerId: reseller.id, planId, price },
    })
  }

  const full = await db.reseller.findUnique({
    where: { id: reseller.id },
    include: { user: { select: { id: true, email: true, name: true, walletBalance: true, status: true } }, prices: { include: { plan: { select: { name: true, currency: true } } } } },
  })
  await auditAdmin({ req, actor: admin, action: 'reseller.create', targetType: 'reseller', targetId: reseller.id, metadata: { userId: user.id, createdUser: Boolean(generatedPassword), priceMode: reseller.priceMode, active: reseller.active } })
  return ok({ ...serialize(full, await resellerUsage(reseller.id), await walletBalances(user.id)), generatedPassword }, 201)
}

/** PATCH /api/admin/resellers — limits, pricing and status. */
export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'resellers.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id', 400)
  const reseller = await db.reseller.findUnique({ where: { id } })
  if (!reseller) return err('not found', 404)

  const data: Record<string, unknown> = {}
  for (const field of LIMIT_FIELDS) if (b?.[field] !== undefined) data[field] = Math.max(0, Math.round(Number(b[field]) || 0))
  for (const field of BOOL_FIELDS) if (b?.[field] !== undefined) data[field] = Boolean(b[field])
  if (b?.priceMode !== undefined) data.priceMode = b.priceMode === 'CUSTOM' ? 'CUSTOM' : 'DISCOUNT'
  if (b?.discountPercent !== undefined) data.discountPercent = Math.min(Math.max(Number(b.discountPercent) || 0, 0), 100)
  if (b?.note !== undefined) data.note = String(b.note)

  if (Object.keys(data).length) await db.reseller.update({ where: { id }, data })

  if (Array.isArray(b?.prices)) {
    for (const p of b.prices) {
      const planId = Number(p?.planId)
      if (!planId) continue
      if (p?.price === '' || p?.price === null || p?.price === undefined) {
        await db.resellerPrice.deleteMany({ where: { resellerId: id, planId } })
        continue
      }
      const price = Number(p.price)
      if (!(price >= 0)) continue
      await db.resellerPrice.upsert({
        where: { resellerId_planId: { resellerId: id, planId } },
        update: { price },
        create: { resellerId: id, planId, price },
      })
    }
  }

  const full = await db.reseller.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true, walletBalance: true, status: true } }, prices: { include: { plan: { select: { name: true, currency: true } } } } },
  })
  await auditAdmin({ req, actor: admin, action: 'reseller.update', targetType: 'reseller', targetId: id, metadata: { userId: reseller.userId, fields: Object.keys(data), pricingUpdated: Array.isArray(b?.prices) } })
  return ok(serialize(full, await resellerUsage(id), await walletBalances(reseller.userId)))
}

/** DELETE /api/admin/resellers?id=1 — the accounts stay, the contract goes. */
export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'resellers.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id', 400)
  const accounts = await db.subscription.count({ where: { resellerId: id } })
  if (accounts > 0) {
    // keep the history: deactivate instead of orphaning live accounts
    await db.reseller.update({ where: { id }, data: { active: false } })
    await auditAdmin({ req, actor: admin, action: 'reseller.deactivate', targetType: 'reseller', targetId: id, metadata: { accounts } })
    return ok({ ok: true, deactivated: true, accounts })
  }
  await db.resellerPrice.deleteMany({ where: { resellerId: id } })
  await db.reseller.delete({ where: { id } })
  await auditAdmin({ req, actor: admin, action: 'reseller.delete', targetType: 'reseller', targetId: id })
  return ok({ ok: true, deleted: true })
}
