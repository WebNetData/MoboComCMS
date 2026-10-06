// Reseller (agency) domain logic: quotas, per-account limits and agency prices.
// Every limit lives on the Reseller row; `0` always means "unlimited" so the
// admin can leave a field empty to lift that restriction.
import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { db } from '@/platform/database/prisma'
import { err } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { createInvoiceForOrder, markInvoicePaid } from '@/modules/billing/server/billing'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { enqueueFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

export interface ResellerLimits {
  maxAccounts: number
  maxActiveAccounts: number
  trafficQuotaGB: number
  maxTrafficPerAccountGB: number
  allowUnlimitedTraffic: boolean
  maxDaysPerAccount: number
  allowUnlimitedDays: boolean
  maxDevicesPerAccount: number
}

export interface ResellerUsage {
  accounts: number
  activeAccounts: number
  trafficGrantedGB: number
  devicesGranted: number
}

export const RESELLER_PERMISSIONS = ['accounts.view', 'accounts.manage', 'offers.view', 'offers.manage', 'sales.view', 'sales.review'] as const
export type ResellerPermission = typeof RESELLER_PERMISSIONS[number]

export function parseResellerPermissions(value: string): ResellerPermission[] {
  const allowed = new Set<string>(RESELLER_PERMISSIONS)
  return [...new Set(value.split(',').map(x => x.trim()).filter(x => allowed.has(x)))] as ResellerPermission[]
}

export function resellerCan(guard: { owner: boolean; permissions: ResellerPermission[] }, permission: ResellerPermission): boolean {
  if (guard.owner) return true
  if (guard.permissions.includes(permission)) return true
  if (permission === 'sales.view' && guard.permissions.includes('sales.review')) return true
  return permission.endsWith('.view') && guard.permissions.includes(permission.replace('.view', '.manage') as ResellerPermission)
}

const round = (n: number) => Math.round((n || 0) * 100) / 100

/** Admin panel and reseller panel share these guards. */
export async function requireReseller(req: NextRequest) {
  // The whole reseller panel is closed while the module (or the VPN service it sells) is off; contracts and accounts stay as they are.
  if (!await isModuleEnabled('reseller')) return { ok: false as const, response: err('نمایندگی در حال حاضر فعال نیست', 404, { code: 'RESELLER_DISABLED' }) }
  const auth = await requireUser(req)
  if (!auth) return { ok: false as const, response: err('unauthorized', 401) }
  const owned = await loadResellerByUser(auth.id)
  const member = owned ? null : await db.resellerMember.findUnique({ where: { userId: auth.id } })
  const reseller = owned || (member?.active ? await loadResellerById(member.resellerId) : null)
  if (!reseller) return { ok: false as const, response: err('این حساب نمایندگی ندارد', 403, { code: 'NOT_A_RESELLER' }) }
  if (!reseller.active) return { ok: false as const, response: err('قرارداد نمایندگی این حساب غیرفعال است', 403, { code: 'RESELLER_INACTIVE' }) }
  return { ok: true as const, auth, reseller, owner: Boolean(owned), permissions: owned ? [...RESELLER_PERMISSIONS] : parseResellerPermissions(member?.permissions || '') }
}

/** One subscription of the reseller, or null when it is not theirs. */
export async function resellerAccount(resellerId: number, id: number) {
  const sub = await db.subscription.findUnique({
    where: { id },
    include: { plan: { include: { panel: true } }, user: { select: { id: true, email: true, name: true, status: true } } },
  })
  if (!sub || sub.resellerId !== resellerId) return null
  return sub
}

export async function loadResellerByUser(userId: number) {
  return db.reseller.findUnique({ where: { userId }, include: { prices: true, user: { select: { id: true, email: true, name: true, walletBalance: true } } } })
}

async function loadResellerById(id: number) {
  return db.reseller.findUnique({ where: { id }, include: { prices: true, user: { select: { id: true, email: true, name: true, walletBalance: true } } } })
}

export async function resellerUsage(resellerId: number): Promise<ResellerUsage> {
  const [accounts, activeAccounts, agg] = await Promise.all([
    db.subscription.count({ where: { resellerId } }),
    db.subscription.count({ where: { resellerId, status: 'ACTIVE' } }),
    db.subscription.aggregate({ where: { resellerId }, _sum: { trafficLimit: true, deviceLimit: true } }),
  ])
  return {
    accounts,
    activeAccounts,
    trafficGrantedGB: agg._sum.trafficLimit || 0,
    devicesGranted: agg._sum.deviceLimit || 0,
  }
}

/** Agency price for a plan: explicit override first, then the discount. */
export function resellerPlanPrice(
  reseller: { priceMode: string; discountPercent: number; prices?: { planId: number; price: number; priceMinor?: bigint }[] },
  plan: { id: number; price: number; priceMinor?: bigint; currency?: string }
) {
  const currency = normalizeCurrency(plan.currency || 'USD')
  return legacyNumber(resellerWholesaleMinor(reseller, plan, 0), currency)
}

/** Exact wholesale amount for a reseller-configured volume offer. */
export function resellerWholesaleMinor(
  reseller: { priceMode: string; discountPercent: number; prices?: { planId: number; price: number; priceMinor?: bigint }[] },
  plan: { id: number; price: number; priceMinor?: bigint; currency?: string; trafficGB?: number },
  trafficGB: number,
) {
  const currency = normalizeCurrency(plan.currency || 'USD')
  const custom = reseller.prices?.find((p) => p.planId === plan.id)
  let value = custom ? (custom.priceMinor || toMinor(custom.price, currency)) : (plan.priceMinor || toMinor(plan.price, currency))
  if (!custom && reseller.priceMode !== 'CUSTOM') {
    const discountBps = Math.max(0, Math.min(10_000, Math.round((reseller.discountPercent || 0) * 100)))
    value = (value * BigInt(10_000 - discountBps) + 5_000n) / 10_000n
  }
  return plan.trafficGB && trafficGB > 0
    ? (value * BigInt(Math.round(trafficGB * 1000)) + BigInt(plan.trafficGB * 500)) / BigInt(plan.trafficGB * 1000)
    : value
}

export interface AccountRequest {
  trafficGB: number
  days: number
  deviceLimit: number
  /** the reseller may leave the plan out and build a custom account */
  planId?: number | null
  /** the sizes the plan itself allows; a reseller may shrink but never exceed them */
  planLimits?: { trafficGB: number; days: number; deviceLimit: number }
}

export interface LimitCheck {
  ok: boolean
  code?: string
  message?: string
  field?: keyof ResellerLimits | 'trafficQuotaGB'
}

/**
 * Structural guards that do not depend on the size of the account: how many
 * accounts the contract covers and how many of them may be active at once.
 * Checked on its own so "out of accounts" is reported before any size or
 * volume problem, which is always the more useful message.
 */
export function checkContractCapacity(
  reseller: { maxAccounts: number; maxActiveAccounts: number },
  usage: ResellerUsage
): LimitCheck {
  if (reseller.maxAccounts > 0 && usage.accounts >= reseller.maxAccounts) {
    return {
      ok: false,
      code: 'ACCOUNT_LIMIT',
      field: 'maxAccounts',
      message: `account limit reached (${usage.accounts}/${reseller.maxAccounts})`,
    }
  }

  if (reseller.maxActiveAccounts > 0 && usage.activeAccounts >= reseller.maxActiveAccounts) {
    return {
      ok: false,
      code: 'ACTIVE_LIMIT',
      field: 'maxActiveAccounts',
      message: `active account limit reached (${usage.activeAccounts}/${reseller.maxActiveAccounts})`,
    }
  }

  return { ok: true }
}

/**
 * Enforces every admin-defined quota in one place, so neither the reseller
 * panel nor the API can hand out more than the contract allows.
 */
export async function checkResellerLimits(
  reseller: { id: number } & ResellerLimits,
  request: AccountRequest,
  usage: ResellerUsage
): Promise<LimitCheck> {
  const { trafficGB, days, deviceLimit } = request

  const capacity = checkContractCapacity(reseller, usage)
  if (!capacity.ok) return capacity

  if (![trafficGB, days, deviceLimit].every(n => Number.isFinite(n) && n >= 0) || !Number.isInteger(days) || !Number.isInteger(deviceLimit)) {
    return { ok: false, code: 'INVALID_SPEC', message: 'negative values are not allowed' }
  }

  if (trafficGB === 0 && !reseller.allowUnlimitedTraffic) {
    return {
      ok: false,
      code: 'UNLIMITED_TRAFFIC_FORBIDDEN',
      field: 'allowUnlimitedTraffic',
      message: 'unlimited traffic is not enabled for this reseller',
    }
  }

  // the plan is the outer bound: a reseller may sell less than a plan, never more
  const plan = request.planLimits
  if (plan) {
    const sizes: [number, number, string, keyof ResellerLimits | 'trafficQuotaGB'][] = [

      [days, plan.days, 'days', 'maxDaysPerAccount'],
      [deviceLimit, plan.deviceLimit, 'devices', 'maxDevicesPerAccount'],
    ]
    for (const [value, allowed, unit, field] of sizes) {
      if (allowed > 0 && (value === 0 || value > allowed)) {
        return {
          ok: false,
          code: 'PLAN_LIMIT',
          field,
          message: `the plan only allows ${allowed} ${unit} (requested ${value})`,
        }
      }
    }
  }

  if (trafficGB > 0 && reseller.maxTrafficPerAccountGB > 0 && trafficGB > reseller.maxTrafficPerAccountGB) {
    return {
      ok: false,
      code: 'TRAFFIC_PER_ACCOUNT',
      field: 'maxTrafficPerAccountGB',
      message: `each account is capped at ${reseller.maxTrafficPerAccountGB} GB (requested ${trafficGB})`,
    }
  }

  if (days === 0 && !reseller.allowUnlimitedDays) {
    return {
      ok: false,
      code: 'UNLIMITED_DAYS_FORBIDDEN',
      field: 'allowUnlimitedDays',
      message: 'unlimited duration is not enabled for this reseller',
    }
  }

  if (days > 0 && reseller.maxDaysPerAccount > 0 && days > reseller.maxDaysPerAccount) {
    return {
      ok: false,
      code: 'DAYS_LIMIT',
      field: 'maxDaysPerAccount',
      message: `the duration is capped at ${reseller.maxDaysPerAccount} days (requested ${days})`,
    }
  }

  if (reseller.maxDevicesPerAccount > 0 && (deviceLimit === 0 || deviceLimit > reseller.maxDevicesPerAccount)) {
    return {
      ok: false,
      code: 'DEVICE_LIMIT',
      field: 'maxDevicesPerAccount',
      message: `each account is capped at ${reseller.maxDevicesPerAccount} devices (requested ${deviceLimit})`,
    }
  }

  // volume contract: total GB handed out across all accounts
  if (reseller.trafficQuotaGB > 0 && trafficGB === 0) return { ok: false, code: 'TRAFFIC_QUOTA', message: 'قرارداد حجمی اجازه سرویس نامحدود نمی‌دهد' }
  if (reseller.trafficQuotaGB > 0 && trafficGB > 0) {
    const left = reseller.trafficQuotaGB - usage.trafficGrantedGB
    if (trafficGB > left) {
      return {
        ok: false,
        code: 'TRAFFIC_QUOTA',
        field: 'trafficQuotaGB',
        message: `only ${Math.max(left, 0)} GB are left of the ${reseller.trafficQuotaGB} GB contract`,
      }
    }
  }

  return { ok: true }
}

export interface ResellerAccountInput {
  email: string
  planId: number
  username?: string
  trafficGB?: number
  days?: number
  deviceLimit?: number
  note?: string
  idempotencyKey: string
}

export interface ResellerAccountResult {
  ok: boolean
  orderId?: number
  code?: string
  message?: string
  needed?: number
  balance?: number
  price?: number
  subscriptionId?: number
  username?: string
  subUrl?: string
  expiresAt?: Date
  currency?: string
  fulfillmentPending?: boolean
  replayed?: boolean
  customer?: { id: number; email: string; password?: string }
}

function randomPasswordFor() { return randomBytes(18).toString('base64url') }

/**
 * Creates an account for the reseller's own customer: panel user + local
 * subscription, charged from the reseller's wallet at the agency price.
 *
 * Financial settlement is committed first, then remote provisioning runs as
 * a durable idempotent job. Transient panel failures are retried safely.
 */
export async function createResellerAccount(
  reseller: { id: number; userId: number; priceMode: string; discountPercent: number; prices?: { planId: number; price: number; priceMinor?: bigint }[] } & ResellerLimits,
  input: ResellerAccountInput
): Promise<ResellerAccountResult> {
  const email = String(input.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, code: 'BAD_EMAIL', message: 'a customer email is required' }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey || '')) return { ok: false, code: 'IDEMPOTENCY_REQUIRED', message: 'a valid Idempotency-Key is required' }
  const orderKey = `reseller:${reseller.id}:${input.idempotencyKey}`

  const prior = await db.order.findUnique({ where: { idempotencyKey: orderKey }, include: { invoice: true } })
  if (prior) {
    if (prior.status !== 'PAID' || prior.invoice?.status !== 'PAID') return { ok: false, code: 'PREVIOUS_ATTEMPT_FAILED', message: 'This sale requires manual review before retrying' }
    let sub = await db.subscription.findFirst({ where: { orderId: prior.id } })
    let meta: any = {}
    try { meta = JSON.parse(prior.meta || '{}') } catch {}
    const customer = meta.customerUserId ? await db.user.findUnique({ where: { id: Number(meta.customerUserId) } }) : null
    let job = await db.fulfillmentJob.findUnique({ where: { dedupeKey: `RESELLER_PROVISION:order:${prior.id}` } })
    if (!job && !sub && meta.customerUserId) {
      job = await enqueueFulfillment({ kind: 'RESELLER_PROVISION', dedupeKey: `RESELLER_PROVISION:order:${prior.id}`, orderId: prior.id, invoiceId: prior.invoice.id, payload: { customerUserId: Number(meta.customerUserId), resellerId: reseller.id, planId: prior.planId, username: meta.username || '', trafficGB: Number(meta.trafficGB), days: Number(meta.days), deviceLimit: Number(meta.deviceLimit) } })
      await processFulfillmentJob(job.id)
      sub = await db.subscription.findFirst({ where: { orderId: prior.id } })
    }
    return {
      ok: true,
      orderId: prior.id,
      replayed: true,
      price: prior.totalAmount,
      currency: prior.currency,
      balance: await walletBalance(reseller.userId, prior.currency),
      fulfillmentPending: !sub || (job ? job.status !== 'DONE' : true),
      subscriptionId: sub?.id,
      username: sub?.status === 'ACTIVE' ? sub.username : undefined,
      subUrl: sub?.status === 'ACTIVE' ? await safeHappLink(sub.subToken) : undefined,
      expiresAt: sub?.expiresAt,
      customer: customer ? { id: customer.id, email: customer.email } : undefined,
    }
  }

  const plan = await db.plan.findUnique({ where: { id: Number(input.planId) }, include: { panel: true } })
  if (!plan || !plan.active) return { ok: false, code: 'PLAN_NOT_FOUND', message: 'plan not found' }
  if (!plan.panel || !plan.panel.active) return { ok: false, code: 'PANEL_INACTIVE', message: 'the panel of this plan is not active' }
  const usage = await resellerUsage(reseller.id)
  const capacity = checkContractCapacity(reseller, usage)
  if (!capacity.ok) return { ok: false, code: capacity.code, message: capacity.message }
  const remainingGB = reseller.trafficQuotaGB > 0 ? Math.max(0, reseller.trafficQuotaGB - usage.trafficGrantedGB) : null
  if (input.trafficGB == null && remainingGB !== null && remainingGB <= 0) return { ok: false, code: 'TRAFFIC_QUOTA', message: `the ${reseller.trafficQuotaGB} GB contract is fully used` }

  const pick = (requested: number | undefined, planValue: number, cap: number, pool: number | null = null) => {
    if (requested != null) return Number(requested)
    const caps = [planValue, cap, pool].filter((value): value is number => value != null && value > 0)
    const max = caps.length ? Math.min(...caps) : Infinity
    if (!Number.isFinite(max)) return 0
    return Math.min(planValue > 0 ? planValue : max, max)
  }
  const trafficGB = pick(input.trafficGB, plan.trafficGB, reseller.maxTrafficPerAccountGB, remainingGB)
  const days = pick(input.days, plan.days, reseller.maxDaysPerAccount)
  const deviceLimit = pick(input.deviceLimit, plan.deviceLimit, reseller.maxDevicesPerAccount)
  const check = await checkResellerLimits(reseller, { trafficGB, days, deviceLimit, planId: plan.id, planLimits: { trafficGB: plan.trafficGB, days: plan.days, deviceLimit: plan.deviceLimit } }, usage)
  if (!check.ok) return { ok: false, code: check.code, message: check.message }
  if (plan.trafficGB > 0 && trafficGB === 0) return { ok: false, code: 'UNLIMITED_PLAN_REQUIRED', message: 'برای حجم نامحدود یک پلن نامحدود انتخاب کنید' }

  const currency = normalizeCurrency(plan.currency)
  const priceMinor = resellerWholesaleMinor(reseller, plan, trafficGB)
  const price = legacyNumber(priceMinor, currency)
  const balance = await walletBalance(reseller.userId, currency)
  const balanceMinor = toMinor(balance, currency)
  if (balanceMinor < priceMinor) return { ok: false, code: 'INSUFFICIENT_FUNDS', message: `reseller ${currency} wallet balance is too low`, needed: legacyNumber(priceMinor - balanceMinor, currency), balance, currency }

  let createdPassword = ''
  let customer = await db.user.findUnique({ where: { email } })
  if (!customer) {
    createdPassword = randomPasswordFor()
    customer = await db.user.create({ data: { email, passwordHash: bcrypt.hashSync(createdPassword, 10), name: email.split('@')[0], role: 'CUSTOMER', note: input.note || `created by reseller #${reseller.id}` } })
  }

  const order = await db.order.create({
    data: {
      userId: reseller.userId,
      planId: plan.id,
      totalAmount: price,
      totalMinor: priceMinor,
      currency,
      idempotencyKey: orderKey,
      status: 'PENDING',
      provider: 'wallet',
      meta: JSON.stringify({ kind: 'reseller', resellerId: reseller.id, customerUserId: customer.id, customerEmail: email, username: input.username || '', trafficGB, days, deviceLimit }),
    },
  })
  const invoice = await createInvoiceForOrder({
    orderId: order.id,
    userId: reseller.userId,
    planId: plan.id,
    subtotal: price,
    currency,
    walletApplied: price,
    notes: `Reseller account for ${email}`,
    idempotencyKey: `reseller-invoice:${reseller.id}:${input.idempotencyKey}`,
  })
  const debit = await moveWallet({
    userId: reseller.userId,
    amount: -price,
    currency,
    type: 'PURCHASE',
    description: `${plan.name} ${invoice.number}`,
    orderId: order.id,
    invoiceId: invoice.id,
    idempotencyKey: `reseller-wallet:${reseller.id}:${input.idempotencyKey}`,
  })
  if (!debit.ok) {
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', walletApplied: 0, walletAppliedMinor: 0n } }).catch(() => {})
    await db.order.update({ where: { id: order.id }, data: { status: 'FAILED' } }).catch(() => {})
    return { ok: false, code: 'WALLET_FAILED', message: debit.message || 'wallet charge failed', currency }
  }
  const settled = await markInvoicePaid({ invoiceId: invoice.id, provider: 'WALLET', amount: 0, raw: { source: 'reseller' } })
  if (!settled.ok) return { ok: false, code: 'SETTLEMENT_FAILED', message: settled.message || 'settlement failed', currency }

  const job = await enqueueFulfillment({
    kind: 'RESELLER_PROVISION',
    dedupeKey: `RESELLER_PROVISION:order:${order.id}`,
    orderId: order.id,
    invoiceId: invoice.id,
    payload: { customerUserId: customer.id, resellerId: reseller.id, planId: plan.id, username: input.username || '', trafficGB, days, deviceLimit },
  })
  const processed = await processFulfillmentJob(job.id)
  const sub = await db.subscription.findFirst({ where: { orderId: order.id } })
  await db.order.update({ where: { id: order.id }, data: { paymentUrl: `/invoice/${invoice.number}`, paidAmount: String(price) } }).catch(() => {})
  return {
    ok: true,
    orderId: order.id,
    price,
    currency,
    balance: debit.balance,
    fulfillmentPending: !processed.ok || !sub || sub.status !== 'ACTIVE',
    subscriptionId: sub?.id,
    username: sub?.status === 'ACTIVE' ? sub.username : undefined,
    subUrl: sub?.status === 'ACTIVE' ? await safeHappLink(sub.subToken) : undefined,
    expiresAt: sub?.expiresAt,
    customer: { id: customer.id, email: customer.email, password: createdPassword || undefined },
  }
}

/** Effective quota report for the reseller panel. */
export function usageReport(reseller: { id: number } & ResellerLimits, usage: ResellerUsage) {
  const pct = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0)
  return {
    ...usage,
    trafficQuotaLeftGB: reseller.trafficQuotaGB > 0 ? Math.max(0, reseller.trafficQuotaGB - usage.trafficGrantedGB) : 0,
    accountsUsedPercent: pct(usage.accounts, reseller.maxAccounts),
    activeUsedPercent: pct(usage.activeAccounts, reseller.maxActiveAccounts),
    trafficUsedPercent: pct(usage.trafficGrantedGB, reseller.trafficQuotaGB),
  }
}
