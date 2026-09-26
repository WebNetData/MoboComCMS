import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { TransferError } from '@/modules/billing/domain/card-transfer'
import { listBankAccounts, reviewReceipt, saveBankAccount } from '@/modules/billing/server/card-transfer'

const fail = (error: unknown) => error instanceof TransferError ? err(error.message, error.status) : err(error instanceof Error ? error.message : 'failed', 400)

// ------------------------------------------------------------ bank accounts (gateways.manage)

export async function GET_accounts(req: NextRequest) {
  if (!await requirePerm(req, 'gateways.manage')) return err('forbidden', 403)
  const [accounts, usage] = await Promise.all([
    listBankAccounts(),
    db.paymentReceipt.groupBy({ by: ['bankAccountId'], where: { status: 'APPROVED' }, _count: { _all: true }, _sum: { amountMinor: true } }),
  ])
  return ok({ accounts: accounts.map((account) => {
    const used = usage.find((row) => row.bankAccountId === account.id)
    return { ...account, approvedCount: used?._count._all || 0, approvedMinor: (used?._sum.amountMinor || 0n).toString() }
  }) })
}

export async function SAVE_account(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('invalid body')
  try {
    const account = await saveBankAccount(body)
    await auditAdmin({ req, actor: admin, action: 'bank_account.save', targetType: 'BankAccount', targetId: account.id, metadata: { bankName: account.bankName, active: account.active } })
    return ok({ account })
  } catch (error) { return fail(error) }
}

export async function DELETE_account(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage')
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  // Accounts with receipts are kept for the accounting trail and only deactivated.
  const used = await db.paymentReceipt.count({ where: { bankAccountId: id } })
  if (used) await db.bankAccount.update({ where: { id }, data: { active: false } })
  else await db.bankAccount.delete({ where: { id } }).catch(() => null)
  await auditAdmin({ req, actor: admin, action: used ? 'bank_account.deactivate' : 'bank_account.delete', targetType: 'BankAccount', targetId: id })
  return ok({ id, deactivated: used > 0 })
}

// ------------------------------------------------------------ receipts (invoices.manage)

export async function GET_receipts(req: NextRequest) {
  if (!await requirePerm(req, 'invoices.manage')) return err('forbidden', 403)
  const status = req.nextUrl.searchParams.get('status') || 'PENDING'
  if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) return err('invalid status')
  const [receipts, counts] = await Promise.all([
    db.paymentReceipt.findMany({
      where: status === 'ALL' ? undefined : { status }, orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 100,
      include: {
        invoice: { select: { number: true, total: true, currency: true, status: true, product: { select: { name: true } }, plan: { select: { name: true } } } },
        user: { select: { id: true, name: true, email: true, phone: true } },
        bankAccount: { select: { bankName: true, holderName: true, cardNumber: true } },
      },
    }),
    db.paymentReceipt.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  return ok({
    receipts: receipts.map((receipt) => ({ ...receipt, amountMinor: receipt.amountMinor.toString() })),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
  })
}

export async function REVIEW_receipt(req: NextRequest) {
  const admin = await requirePerm(req, 'invoices.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const action = body?.action === 'approve' ? 'approve' : body?.action === 'reject' ? 'reject' : null
  if (!Number.isSafeInteger(id) || id <= 0 || !action) return err('invalid input')
  try {
    const result = await reviewReceipt(admin, id, action, String(body?.note || ''))
    await auditAdmin({ req, actor: admin, action: `receipt.${action}`, targetType: 'PaymentReceipt', targetId: id, metadata: { warning: 'warning' in result ? result.warning : undefined } })
    return ok(result)
  } catch (error) { return fail(error) }
}
