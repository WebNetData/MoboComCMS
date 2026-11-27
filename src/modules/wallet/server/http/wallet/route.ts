import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { walletOverview } from '@/modules/wallet/server/overview'
import { startWalletTopup } from '@/modules/wallet/server/topup'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  return ok(await walletOverview(auth.id))
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  const result = await startWalletTopup({
    userId: auth.id,
    email: auth.email,
    amount: String(body?.amount ?? ''),
    currency: body?.currency ? String(body.currency) : undefined,
    gatewayRef: typeof body?.gatewayRef === 'string' ? body.gatewayRef.trim() : undefined,
    idempotencyKey: String(req.headers.get('idempotency-key') || body?.idempotencyKey || '').trim(),
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code })
  return ok(result)
}
