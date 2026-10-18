import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { auditAdmin } from '@/platform/audit/server'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { INTERVALS, intervalOf, normalizeInvoiceRules } from '@/modules/billing/domain/invoice-rules'
import { getInvoiceRules, issueRecurring, saveInvoiceRules } from '@/modules/billing/server/invoice-rules'
import { pictureOf } from '@/modules/identity/domain/picture'

// Admin: invoices issued on a schedule, and the rules that close unpaid invoices by themselves. Permission: invoices.manage.

const PERM = 'invoices.manage' as Permission
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

async function serialize(rows: Awaited<ReturnType<typeof db.recurringInvoice.findMany>>) {
  const users = (await db.user.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.userId))] } }, select: { id: true, name: true, email: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } })).map(user => ({ id: user.id, name: user.name, email: user.email, avatar: pictureOf(user) }))
  const last = await db.invoice.findMany({ where: { id: { in: rows.map((row) => row.lastInvoiceId).filter((id): id is number => id != null) } }, select: { id: true, number: true, status: true } })
  return rows.map((row) => ({
    id: row.id, userId: row.userId, user: users.find((user) => user.id === row.userId) || null,
    title: row.title, detail: row.detail, amount: minorToNumber(row.amountMinor, row.currency), currency: row.currency,
    interval: row.interval, nextAt: row.nextAt, endsAt: row.endsAt, maxCount: row.maxCount, issuedCount: row.issuedCount,
    dueDays: row.dueDays, gatewayId: row.gatewayId, notes: row.notes, active: row.active,
    lastInvoice: last.find((invoice) => invoice.id === row.lastInvoiceId) || null, createdAt: row.createdAt,
  }))
}

export async function GET(req: NextRequest) {
  if (!(await requirePerm(req, PERM))) return err('forbidden', 403)
  const rows = await db.recurringInvoice.findMany({ orderBy: [{ active: 'desc' }, { nextAt: 'asc' }], take: 500 })
  return ok({ recurring: await serialize(rows), rules: await getInvoiceRules(), intervals: INTERVALS })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, PERM)
  if (!admin) return err('forbidden', 403)
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return err('درخواست نامعتبر است')
  const op = String(b.op || 'save')

  if (op === 'rules') {
    const rules = await saveInvoiceRules(normalizeInvoiceRules(b.rules))
    await auditAdmin({ req, actor: admin, action: 'invoice.rules', targetType: 'setting', targetId: 0, metadata: rules })
    return ok({ rules })
  }

  const id = int(b.id, 0, 2 ** 31, 0)
  if (op === 'delete' || op === 'toggle' || op === 'issue') {
    const row = id ? await db.recurringInvoice.findUnique({ where: { id } }) : null
    if (!row) return err('فاکتور دوره‌ای پیدا نشد', 404)
    if (op === 'delete') {
      // Invoices it already issued stay; only the schedule goes.
      await db.recurringInvoice.delete({ where: { id } })
      await auditAdmin({ req, actor: admin, action: 'invoice.recurring.delete', targetType: 'recurring-invoice', targetId: id, metadata: { userId: row.userId, title: row.title } })
      return ok({ deleted: true })
    }
    if (op === 'toggle') {
      await db.recurringInvoice.update({ where: { id }, data: { active: !row.active } })
      await auditAdmin({ req, actor: admin, action: 'invoice.recurring.toggle', targetType: 'recurring-invoice', targetId: id, metadata: { active: !row.active } })
      return ok({ active: !row.active })
    }
    const invoice = await issueRecurring(id, new Date(), true)
    if (!invoice) return err('فاکتور صادر نشد؛ دوباره امتحان کنید', 409)
    await auditAdmin({ req, actor: admin, action: 'invoice.recurring.issue', targetType: 'recurring-invoice', targetId: id, metadata: { invoiceId: invoice.id } })
    return ok({ number: invoice.number })
  }

  // Save (new or edited).
  const userId = int(b.userId, 0, 2 ** 31, 0)
  if (!userId || !(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) return err('مشتری را انتخاب کنید')
  const title = text(b.title, 120)
  if (!title) return err('شرح فاکتور را بنویسید')
  if (!intervalOf(String(b.interval))) return err('دورهٔ تکرار معتبر نیست')
  const currency = normalizeCurrency(String(b.currency || 'IRT'))
  let amountMinor: bigint
  try { amountMinor = toMinor(String(b.amount ?? ''), currency) } catch { return err('مبلغ معتبر نیست') }
  if (amountMinor <= 0n) return err('مبلغ باید بیشتر از صفر باشد')
  const nextAt = new Date(String(b.nextAt || ''))
  if (Number.isNaN(nextAt.getTime())) return err('تاریخ اولین فاکتور معتبر نیست')
  const endsAt = b.endsAt ? new Date(String(b.endsAt)) : null
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= nextAt)) return err('پایان تکرار باید بعد از اولین فاکتور باشد')
  const gatewayId = int(b.gatewayId, 0, 2 ** 31, 0) || null
  if (gatewayId) {
    const gateway = await db.gateway.findUnique({ where: { id: gatewayId }, select: { active: true, fiat: true } })
    if (!gateway?.active) return err('درگاه انتخاب‌شده فعال نیست')
    if (normalizeCurrency(gateway.fiat || 'USD') !== currency) return err(`این درگاه ${normalizeCurrency(gateway.fiat || 'USD')} می‌گیرد و فاکتور ${currency} است`)
  }
  const data = {
    userId, title, detail: text(b.detail, 500), amountMinor, currency, interval: String(b.interval), nextAt, endsAt,
    maxCount: int(b.maxCount, 0, 1000, 0), dueDays: int(b.dueDays, 0, 365, 7), gatewayId, notes: text(b.notes, 500), active: b.active !== false,
  }
  const row = id ? await db.recurringInvoice.update({ where: { id }, data }) : await db.recurringInvoice.create({ data: { ...data, createdBy: admin.id } })
  await auditAdmin({ req, actor: admin, action: id ? 'invoice.recurring.update' : 'invoice.recurring.create', targetType: 'recurring-invoice', targetId: row.id, metadata: { userId, interval: data.interval, currency, amountMinor: amountMinor.toString() } })
  return ok({ recurring: (await serialize([row]))[0] })
}
