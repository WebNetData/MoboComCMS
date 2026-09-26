import { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'

export async function GET(req: NextRequest) {
  const currency = String(req.nextUrl.searchParams.get('currency') || '').trim()
  const gateways = await checkoutGatewayOptions(currency || undefined)
  const response = ok({ gateways })
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}
