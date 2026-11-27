import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { CloudWorkspaceError, cloudWorkspaceUser } from '@/modules/hosting/server/workspace-access'
import { walletOverview } from '@/modules/wallet/server/overview'
import { startWalletTopup } from '@/modules/wallet/server/topup'

export async function GET(req: NextRequest) {
  try {
    const user = await cloudWorkspaceUser(req)
    return privateResponse(ok(await walletOverview(user.id, 'cloud')))
  } catch (error) {
    if (error instanceof CloudWorkspaceError) return privateResponse(err(error.message, error.status))
    return privateResponse(err('Could not load wallet', 503))
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await cloudWorkspaceUser(req)
    const body = await req.json().catch(() => null)
    const result = await startWalletTopup({
      userId: user.id,
      email: user.email,
      amount: String(body?.amount ?? ''),
      currency: body?.currency ? String(body.currency) : undefined,
      gatewayRef: typeof body?.gatewayRef === 'string' ? body.gatewayRef.trim() : undefined,
      idempotencyKey: String(req.headers.get('idempotency-key') || body?.idempotencyKey || '').trim(),
      surface: 'cloud',
    })
    if (!result.ok) return privateResponse(err(result.message, result.status, { code: result.code }))
    return privateResponse(ok(result))
  } catch (error) {
    if (error instanceof CloudWorkspaceError) return privateResponse(err(error.message, error.status))
    return privateResponse(err('Could not start wallet top-up', 503))
  }
}

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}
