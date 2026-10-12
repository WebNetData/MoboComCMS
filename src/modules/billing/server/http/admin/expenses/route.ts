import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { EXPENSE_CATEGORIES } from '@/modules/billing/server/billing'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor, BASE_CURRENCY } from '@/shared/money'

function rowMinor(row: { amountMinor?: bigint | null; amount: number }, currency: string) {
  return typeof row.amountMinor === 'bigint' && row.amountMinor !== 0n ? row.amountMinor : toMinor(row.amount || 0, currency)
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const currencyRows = await db.expense.findMany({ select: { currency: true }, distinct: ['currency'] })
  const currencies = [...new Set(currencyRows.map((x) => normalizeCurrency(x.currency || 'USD')))].sort()
  if (!currencies.length) currencies.push(BASE_CURRENCY)
  const currency = normalizeCurrency(req.nextUrl.searchParams.get('currency') || currencies[0])
  if (!currencies.includes(currency)) currencies.push(currency)
  const rows = await db.expense.findMany({ where: { currency }, orderBy: { spentAt: 'desc' }, take: 400 })
  let totalMinor = 0n
  const byCategoryMinor = new Map<string, bigint>()
  for (const e of rows) {
    const minor = rowMinor(e, currency)
    totalMinor += minor
    byCategoryMinor.set(e.category, (byCategoryMinor.get(e.category) || 0n) + minor)
  }
  const byCategory = Object.fromEntries([...byCategoryMinor].map(([k, v]) => [k, minorToNumber(v, currency)]))
  return ok({
    expenses: rows.map((e) => ({ ...e, amount: minorToNumber(rowMinor(e, currency), currency) })),
    total: minorToNumber(totalMinor, currency),
    byCategory,
    categories: EXPENSE_CATEGORIES,
    currency,
    currencies: currencies.sort(),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const title = String(b?.title || '').trim()
  const currency = normalizeCurrency(b?.currency || BASE_CURRENCY)
  let amountMinor: bigint
  try { amountMinor = toMinor(String(b?.amount ?? ''), currency) } catch (e) { return err(e instanceof Error ? e.message : 'invalid amount') }
  if (!title) return err('title is required')
  if (amountMinor <= 0n) return err('amount must be greater than zero')
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(String(b?.category)) ? String(b.category) : 'OTHER'
  const spentAt = b?.spentAt ? new Date(b.spentAt) : new Date()
  if (!Number.isFinite(spentAt.getTime())) return err('invalid spentAt')
  const row = await db.expense.create({
    data: {
      title,
      category,
      amount: legacyNumber(amountMinor, currency),
      amountMinor,
      currency,
      spentAt,
      note: String(b?.note || ''),
      createdBy: admin.id,
    },
  })
  return ok(row)
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  await db.expense.delete({ where: { id } })
  return ok({ deleted: true })
}
