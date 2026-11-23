import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { readJsonObject } from '@/platform/http/read-json'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { apiOk } from '@/modules/public-api/server/v1'
import { TransferError } from '@/modules/billing/domain/card-transfer'
import { PayError } from '@/modules/billing/domain/pay'
import { requestPayPayerOtp, verifyPayPayerOtp, payPayerCookie, payPayerChallengeCookie, startPayGateway, submitPayReceipt, payReceiptImage } from '@/modules/billing/server/pay'
import { payHttpFailure } from './pay'

export async function payCheckoutAction(req: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id, action } = await context.params
    if (!(await rateLimitStrict('pay:checkout-action:' + clientIp(req.headers), 90, 60000)).ok) throw new PayError('درخواست زیاد است', 429)
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production' || req.nextUrl.protocol === 'https:', sameSite: 'lax' as const, path: `/api/pay/checkout/${id}` }
    if (action === 'otp' && req.method === 'POST') {
      const { challengeToken, ...result } = await requestPayPayerOtp(req, id, await readJsonObject(req, 3000))
      const response = NextResponse.json({ ok: true, data: result })
      response.cookies.set(payPayerChallengeCookie(id), challengeToken, { ...options, maxAge: result.expiresIn })
      return response
    }
    if (action === 'otp' && req.method === 'PUT') {
      const { token, expiresAt, phoneLast4 } = await verifyPayPayerOtp(req, id, await readJsonObject(req, 2000))
      const response = NextResponse.json({ ok: true, data: { verified: true, phoneLast4 } })
      response.cookies.set(payPayerCookie(id), token, { ...options, expires: expiresAt })
      response.cookies.set(payPayerChallengeCookie(id), '', { ...options, maxAge: 0 })
      return response
    }
    if (action === 'gateway' && req.method === 'POST') return apiOk(await startPayGateway(req, id, await readJsonObject(req, 2000)))
    if (action === 'receipt' && req.method === 'POST') return apiOk(await submitPayReceipt(req, id), 201)
    if (action === 'receipt-image' && req.method === 'GET') return await payReceiptImage(req, Number(req.nextUrl.searchParams.get('receiptId')), id)
    throw new PayError('پیدا نشد', 404)
  } catch (error) { return payHttpFailure(error instanceof TransferError ? new PayError(error.message, error.status) : error) }
}
export async function payReceiptImageHttp(req: NextRequest, context: { params: Promise<{ receiptId: string }> }) {
  try { return await payReceiptImage(req, Number((await context.params).receiptId)) }
  catch (error) { return payHttpFailure(error) }
}
