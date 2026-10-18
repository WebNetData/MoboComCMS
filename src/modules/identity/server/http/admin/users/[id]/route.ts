// Admin "customer 360" endpoint: one place to see and operate on a single user —
// wallet, subscriptions, invoices, orders, tickets and CRM notes.
import { NextRequest } from 'next/server'
import { accountChangeRefusal } from '@/modules/identity/server/staff-guard'
import { memberProfileData } from '@/modules/identity/server/profile-fields'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { moveWallet, walletBalances } from '@/modules/wallet/server/wallet'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor, BASE_CURRENCY } from '@/shared/money'
import { markInvoicePaid } from '@/modules/billing/server/billing'
import { subscriptionAction, type SubAction } from '@/modules/subscriptions/server/submanage'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { auditAdmin } from '@/platform/audit/server'
import { provisionSubscription } from '@/modules/subscriptions/server/provision'
import { pictureOf } from '@/modules/identity/domain/picture'


export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(params.id)
  if (!id) return err('invalid id')

  const user = await db.user.findUnique({
    where: { id },
    include: { roleRef: { select: { id: true, name: true, nameFa: true } }, userProfile: { select: { avatar: true } } },
  })
  if (!user) return err('not found', 404)

  const [subs, invoices, orders, wallet, balances, notes, tickets, keys, paidInvoices, plans] = await Promise.all([
    db.subscription.findMany({
      where: { userId: id },
      orderBy: { id: 'desc' },
      include: { plan: { select: { name: true, days: true, trafficGB: true, price: true } }, panel: { select: { name: true, type: true } } },
    }),
    db.invoice.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, take: 30, include: { plan: { select: { name: true } } } }),
    db.order.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, take: 30, include: { plan: { select: { name: true } } } }),
    db.walletTx.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, take: 50 }),
    walletBalances(id),
    db.crmNote.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, take: 50 }),
    db.ticket.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, take: 20, select: { id: true, subject: true, status: true, createdAt: true } }),
    db.apiKey.findMany({ where: { userId: id }, orderBy: { id: 'desc' }, select: { id: true, name: true, active: true, lastUsedAt: true, requests: true } }),
    db.invoice.findMany({ where: { userId: id, status: 'PAID' }, select: { total: true, totalMinor: true, currency: true } }),
    db.plan.findMany({
      where: { active: true, panelId: { not: null } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, days: true, trafficGB: true, deviceLimit: true, panel: { select: { name: true, active: true } } },
    }),
  ])

  const lifetimeMap = new Map<string, bigint>()
  for (const invoice of paidInvoices) {
    const currency = normalizeCurrency(invoice.currency || 'USD')
    const value = typeof invoice.totalMinor === 'bigint' && invoice.totalMinor !== 0n ? invoice.totalMinor : toMinor(invoice.total || 0, currency)
    lifetimeMap.set(currency, (lifetimeMap.get(currency) || 0n) + value)
  }
  const lifetimePaidByCurrency = [...lifetimeMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({
    currency,
    amount: minorToNumber(value, currency),
  }))

  const profileFields = await memberProfileData(id).catch(() => null)
  return ok({
    profileFields,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: pictureOf(user),
      phone: user.phone,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramLinkedAt: user.telegramLinkedAt,
      role: user.role,
      roleId: user.roleId,
      roleName: user.roleRef?.nameFa || user.roleRef?.name || null,
      status: user.status,
      note: user.note,
      walletBalance: Math.round((user.walletBalance || 0) * 100) / 100, // legacy USD compatibility
      walletBalances: balances.map(({ currency, balance }) => ({ currency, balance })),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      lifetimePaid: lifetimePaidByCurrency.find((item) => item.currency === 'USD')?.amount || 0, // legacy compatibility
      lifetimePaidByCurrency,
    },
    subscriptions: subs.map((s) => ({
      id: s.id,
      plan: s.plan.name,
      panel: s.panel?.name || null,
      panelType: s.panel?.type || null,
      username: s.username,
      status: s.status,
      trafficUsedGB: s.trafficUsed,
      trafficLimitGB: s.trafficLimit,
      deviceLimit: s.deviceLimit,
      expiresAt: s.expiresAt,
      lastSyncAt: s.lastSyncAt,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      plan: i.plan?.name || '',
      total: i.total,
      currency: i.currency,
      status: i.status,
      kind: i.kind,
      createdAt: i.createdAt,
      paidAt: i.paidAt,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      plan: o.plan?.name || '',
      total: o.totalAmount,
      currency: o.currency,
      status: o.status,
      provider: o.provider,
      createdAt: o.createdAt,
    })),
    wallet: wallet.map((t) => ({
      id: t.id,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      currency: t.currency,
      type: t.type,
      status: t.status,
      description: t.description,
      createdAt: t.createdAt,
    })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt })),
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, createdAt: t.createdAt })),
    apiKeys: keys,
    plans: plans.filter((plan) => plan.panel?.active).map((plan) => ({
      id: plan.id,
      name: plan.name,
      days: plan.days,
      trafficGB: plan.trafficGB,
      deviceLimit: plan.deviceLimit,
      panel: plan.panel?.name || '',
    })),
  })
}

/** One endpoint for every customer operation the admin panel offers. */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const id = Number(params.id)
  if (!id) return err('invalid id')
  const body = await req.json().catch(() => null)
  const action = String(body?.action || '')
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } })
  if (!user) return err('not found', 404)

  // ---- wallet: charge / debit any customer manually ----
  if (action === 'wallet') {
    const admin = await requirePerm(req, 'users.manage' as Permission)
    if (!admin) return err('forbidden', 403)
    const raw = Math.round((Number(body?.amount) || 0) * 100) / 100
    if (!raw) return err('amount is required')
    const debit = body?.type === 'ADMIN_DEBIT' || (body?.type === undefined && raw < 0)
    const res = await moveWallet({
      userId: id,
      currency: String(body?.currency || BASE_CURRENCY),
      amount: debit ? -Math.abs(raw) : Math.abs(raw),
      type: debit ? 'ADMIN_DEBIT' : 'ADMIN_CREDIT',
      description: String(body?.description || (debit ? 'Manual debit by admin' : 'Manual credit by admin')),
      adminId: admin.id,
    })
    if (!res.ok) return err(res.message || 'wallet update failed', 400)
    await auditAdmin({
      req, actor: admin, action: 'wallet.adjust', targetType: 'user', targetId: id,
      metadata: { type: debit ? 'ADMIN_DEBIT' : 'ADMIN_CREDIT', amount: debit ? -Math.abs(raw) : Math.abs(raw), currency: res.currency || normalizeCurrency(body?.currency || 'USD'), txId: res.txId },
    })
    return ok({ ok: true, balance: res.balance, txId: res.txId, currency: res.currency })
  }

  // ---- create a VPN service for this customer without charging their wallet ----
  if (action === 'provision') {
    const admin = await requirePerm(req, 'subs.manage' as Permission)
    if (!admin) return err('forbidden', 403)
    const planId = Number(body?.planId)
    if (!Number.isSafeInteger(planId) || planId <= 0) return err('planId is required')
    const username = String(body?.username || '').trim()
    if (username && !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return err('username must be 3-32 letters, numbers, dot, dash or underscore')
    const plan = await db.plan.findUnique({ where: { id: planId }, include: { panel: { select: { active: true } } } })
    if (!plan || !plan.active || !plan.panel?.active) return err('active plan with an active panel is required', 400)
    const result = await provisionSubscription({ userId: id, planId, ...(username ? { username } : {}) })
    if (!result.ok) return err(result.message || 'service creation failed', 502)
    await auditAdmin({
      req,
      actor: admin,
      action: 'subscription.provision',
      targetType: 'subscription',
      targetId: result.subscriptionId,
      metadata: { userId: id, planId, username: result.username, source: 'admin-360' },
    })
    return ok({ ok: true, subscriptionId: result.subscriptionId, username: result.username })
  }

  // ---- subscription controls (enable / disable / rotate / extend / ...) ----
  if (action === 'subscription') {
    const admin = await requirePerm(req, 'subs.manage' as Permission)
    if (!admin) return err('forbidden', 403)
    const subId = Number(body?.subId)
    if (!subId) return err('subId is required')
    const sub = await db.subscription.findUnique({ where: { id: subId }, select: { userId: true } })
    if (!sub || sub.userId !== id) return err('subscription does not belong to this customer', 404)

    const subAction = String(body?.subAction || '') as SubAction | 'extend'

    // admin-only: extend the expiry by N days without touching the customer wallet
    if (subAction === 'extend') {
      const days = Math.max(1, Number(body?.days) || 30)
      const current = await db.subscription.findUnique({ where: { id: subId }, include: { plan: { include: { panel: true } } } })
      if (!current) return err('subscription not found', 404)
      const newExpire = new Date(Math.max(Date.now(), current.expiresAt.getTime()) + days * 86400_000)
      const adapter = current.plan.panel ? getPanelAdapter(current.plan.panel) : null
      if (adapter) {
        const r = await adapter.updateUser(current.username, {
          days: Math.max(1, Math.ceil((newExpire.getTime() - Date.now()) / 86400_000)),
          disabled: false,
        })
        if (!r.ok) return err('panel rejected the extension: ' + (r.message || ''), 502)
      }
      const updated = await db.subscription.update({
        where: { id: subId },
        data: { expiresAt: newExpire, status: adapter ? 'ACTIVE' : current.status, lastSyncAt: new Date() },
      })
      await auditAdmin({ req, actor: admin, action: 'subscription.extend', targetType: 'subscription', targetId: subId, metadata: { userId: id, days, expiresAt: updated.expiresAt, status: updated.status } })
      return ok({ ok: true, id: updated.id, expiresAt: updated.expiresAt, status: updated.status, days })
    }

    const allowed: SubAction[] = ['enable', 'disable', 'rotate', 'renew', 'reset-traffic', 'reset-devices', 'devices', 'delete-device', 'sync']
    if (!allowed.includes(subAction)) return err(`unknown subscription action "${subAction}"`)

    const res = await subscriptionAction(subId, subAction, { hwid: body?.hwid ? String(body.hwid) : undefined, idempotencyKey: req.headers.get('idempotency-key') || body?.idempotencyKey || undefined })
    if (!res.ok) return err(res.message || 'action failed', 502)
    await auditAdmin({ req, actor: admin, action: `subscription.${subAction}`, targetType: 'subscription', targetId: subId, metadata: { userId: id } })
    return ok({ ok: true, ...(typeof res.data === 'object' && res.data ? (res.data as object) : { data: res.data }) })
  }

  // ---- invoice status: paid / unpaid / void / refund ----
  if (action === 'invoice') {
    const admin = await requirePerm(req, 'invoices.manage' as Permission)
    if (!admin) return err('forbidden', 403)
    const invoiceId = Number(body?.invoiceId)
    if (!invoiceId) return err('invoiceId is required')
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { gateway: true } })
    if (!invoice || invoice.userId !== id) return err('invoice not found', 404)

    const change = String(body?.invoiceAction || '')
    if (change === 'markPaid') {
      const res = await markInvoicePaid({
        invoiceId,
        gatewayId: invoice.gatewayId,
        amount: body?.amount ? Number(body.amount) : undefined,
        feePercent: invoice.gateway?.feePercent ?? 0,
        raw: { source: 'admin-360', by: admin.email },
      })
      if (!res.ok) return err(res.message || 'failed', 400)
      // wallet top-up invoices must actually credit the wallet
      if (invoice.kind === 'WALLET_TOPUP') {
        const pending = await db.walletTx.findFirst({ where: { invoiceId: invoice.id, status: 'PENDING' } })
        const amount = body?.amount ? Number(body.amount) : invoice.total
        await moveWallet({
          userId: id,
          currency: invoice.currency,
          amount,
          type: 'TOPUP',
          description: `Wallet top-up ${invoice.number} (admin)`,
          invoiceId: invoice.id,
          adminId: admin.id,
          txId: pending?.id ?? null,
        }).catch(() => {})
      }
      await auditAdmin({ req, actor: admin, action: 'invoice.markPaid', targetType: 'invoice', targetId: invoiceId, metadata: { userId: id, number: invoice.number, currency: invoice.currency, kind: invoice.kind } })
      return ok({ ok: true })
    }
    if (change === 'void') {
      if (invoice.status === 'PAID') return err('a paid invoice cannot be voided — refund it instead')
      const changed = await db.invoice.updateMany({ where: { id: invoiceId, status: { in: ['UNPAID', 'DRAFT', 'VOID'] } }, data: { status: 'VOID' } })
      if (changed.count !== 1) return err('the invoice is no longer open — reload it', 409)
      await auditAdmin({ req, actor: admin, action: 'invoice.void', targetType: 'invoice', targetId: invoiceId, metadata: { userId: id, number: invoice.number, currency: invoice.currency } })
      return ok({ ok: true })
    }
    if (change === 'unpaid') {
      if (invoice.status === 'PAID') return err('use refund to reverse a paid invoice')
      const changed = await db.invoice.updateMany({ where: { id: invoiceId, status: { in: ['UNPAID', 'DRAFT', 'VOID'] } }, data: { status: 'UNPAID' } })
      if (changed.count !== 1) return err('the invoice is paid or refunded — reload it', 409)
      await auditAdmin({ req, actor: admin, action: 'invoice.unpaid', targetType: 'invoice', targetId: invoiceId, metadata: { userId: id, number: invoice.number, currency: invoice.currency } })
      return ok({ ok: true })
    }
    if (change === 'refund') {
      if (invoice.status !== 'PAID') return err('only paid invoices can be refunded')
      const changed = await db.invoice.updateMany({ where: { id: invoiceId, status: 'PAID' }, data: { status: 'REFUNDED' } })
      if (changed.count !== 1) return err('the invoice is no longer paid — reload it', 409)
      const currency = normalizeCurrency(invoice.currency)
      const paidMinor = invoice.paidAmountMinor || invoice.totalMinor || toMinor(invoice.paidAmount || invoice.total, currency)
      const refundMinor = -paidMinor
      await db.payment.create({
        data: {
          userId: id,
          orderId: invoice.orderId,
          invoiceId: invoice.id,
          gatewayId: invoice.gatewayId,
          provider: invoice.gateway?.provider || 'MANUAL',
          eventKey: `invoice:${invoice.id}:admin360-refund`,
          amount: legacyNumber(refundMinor, currency),
          amountMinor: refundMinor,
          currency,
          fee: 0,
          feeMinor: 0n,
          status: 'REFUNDED',
          raw: JSON.stringify({ source: 'admin-360', by: admin.email }),
          confirmedAt: new Date(),
        },
      })
      await auditAdmin({ req, actor: admin, action: 'invoice.refund', targetType: 'invoice', targetId: invoiceId, metadata: { userId: id, number: invoice.number, currency, amountMinor: paidMinor.toString() } })
      return ok({ ok: true })
    }
    return err(`unknown invoice action "${change}"`)
  }

  // ---- account status / role / note ----
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  if (action === 'status') {
    const status = body?.status === 'BANNED' ? 'BANNED' : 'ACTIVE'
    const refusal = await accountChangeRefusal(admin, id, { sensitive: true })
    if (refusal) return err(refusal, 403)
    await db.user.update({ where: { id }, data: { status } })
    await auditAdmin({ req, actor: admin, action: 'user.status', targetType: 'user', targetId: id, metadata: { status } })
    return ok({ ok: true, status })
  }

  if (action === 'role') {
    const role = body?.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER'
    const roleId = body?.roleId ? Number(body.roleId) : null
    const refusal = await accountChangeRefusal(admin, id, { role, roleId: role === 'ADMIN' ? roleId : null })
    if (refusal) return err(refusal, 403)
    await db.user.update({ where: { id }, data: { role, roleId: role === 'ADMIN' ? roleId : null } })
    await auditAdmin({ req, actor: admin, action: 'user.role', targetType: 'user', targetId: id, metadata: { role, roleId: role === 'ADMIN' ? roleId : null } })
    return ok({ ok: true, role, roleId })
  }

  if (action === 'note') {
    const text = String(body?.body || '').trim()
    if (!text) return err('note body is required')
    const note = await db.crmNote.create({ data: { userId: id, body: text, adminId: admin.id } })
    await auditAdmin({ req, actor: admin, action: 'crm.note.create', targetType: 'user', targetId: id, metadata: { noteId: note.id } })
    return ok({ ok: true, note: { id: note.id, body: note.body, createdAt: note.createdAt } })
  }

  if (action === 'noteDelete') {
    const noteId = Number(body?.noteId)
    if (!noteId) return err('noteId is required')
    await db.crmNote.delete({ where: { id: noteId } }).catch(() => {})
    await auditAdmin({ req, actor: admin, action: 'crm.note.delete', targetType: 'user', targetId: id, metadata: { noteId } })
    return ok({ ok: true })
  }

  return err(`unknown action "${action}"`)
}
