import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || ''
  const provider = sp.get('provider') || ''
  const q = (sp.get('q') || '').trim()
  const take = Math.min(Number(sp.get('take')) || 200, 500)

  const where: any = {}
  if (status) where.status = status
  if (provider) where.provider = provider
  if (q) {
    where.OR = [
      { providerTxnId: { contains: q } },
      { cryptoCurrency: { contains: q } },
      { user: { email: { contains: q } } },
    ]
  }

  const rows = await db.payment.findMany({
    where,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      gateway: { select: { name: true, provider: true } },
      invoice: { select: { number: true } },
    },
  })

  return ok(
    rows.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      cryptoCurrency: p.cryptoCurrency,
      cryptoAmount: p.cryptoAmount,
      fee: p.fee,
      txnId: p.providerTxnId,
      gatewayName: p.gateway?.name || '',
      user: p.user?.email || '—',
      orderId: p.orderId,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice?.number || '',
      createdAt: p.createdAt,
      confirmedAt: p.confirmedAt,
    }))
  )
}
