import type { NextRequest, NextResponse } from 'next/server'
import { payPayerCookie } from '../payer'

/** Copy the ALREADY VERIFIED Pay ticket to one narrow bank-checkout path; never widen the original cookie. */
export function scopeBalePayerCookie(req: NextRequest, response: NextResponse, payId: string, collectionId: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(payId) || !/^[A-Za-z0-9_-]{32}$/.test(collectionId)) return
  const name = payPayerCookie(payId), token = req.cookies.get(name)?.value || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return
  response.cookies.set(name, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || req.nextUrl.protocol === 'https:', sameSite: 'lax',
    path: `/api/payment/mobocom-pay/collections/${collectionId}`, maxAge: 86400 })
}
