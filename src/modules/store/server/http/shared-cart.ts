import type { NextRequest } from 'next/server'
import { err, ok as jsonOk } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { createSharedCart, revokeSharedCart, addSharedCart, sharedCartPreview, sharedSelection } from '@/modules/store/server/shared-cart'
import { CART_COOKIE, ensureCart, findCart } from '@/modules/store/server/cart'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
type Context = { params: Promise<{ token: string }> }
const ok = (value: unknown, status = 200) => { const response = jsonOk(value, status); response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Referrer-Policy', 'no-referrer'); return response }
const owner = async (req: NextRequest) => ({ userId: (await requireUser(req))?.id || null, token: req.cookies.get(CART_COOKIE)?.value || null })
const failure = (error: unknown) => error instanceof StoreError ? err(error.message, error.status) : err('عملیات سبد مشترک انجام نشد؛ دوباره تلاش کنید', 503)
const responseWithCart = (value: unknown, token: string) => { const response = ok(value); response.cookies.set(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 86400 }); return response }
export async function GET(req: NextRequest, context?: Context) {
  const off = await moduleGuard('store'); if (off) return off
  if (!(await rateLimitStrict(`shared-cart-view:${clientIp(req.headers)}`, 60)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  try {
    const who = await owner(req)
    if (context) return ok(await sharedCartPreview((await context.params).token, who))
    const cart = await findCart(who)
    const shares = cart ? await db.sharedCart.findMany({ where: { sourceCartId: cart.id }, select: { id: true, title: true, version: true, expiresAt: true, revokedAt: true }, orderBy: { id: 'desc' }, take: 20 }) : []
    return ok({ shares })
  } catch (error) { return failure(error) }
}
export async function POST(req: NextRequest, context?: Context) {
  const origin = req.headers.get('origin')
  if (!origin || !originIsThisSite(origin, req.headers.get('host') || req.nextUrl.host)) return err('forbidden origin', 403)
  const off = await moduleGuard('store'); if (off) return off
  if (!(await rateLimitStrict(`shared-cart-write:${clientIp(req.headers)}`, 20)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  try {
    const who = await owner(req), body = await readJsonObject(req, 16_384)
    if (context) { const token = (await context.params).token; if (body.action === 'preview') { const cart = await ensureCart(who); return responseWithCart(await sharedCartPreview(token, { ...who, token: cart.token }, body.lines === undefined ? undefined : sharedSelection(body.lines)), cart.token) }; const result = await addSharedCart(who, token, body); return responseWithCart({ added: true }, result.token) }
    if (body.action === 'revoke') { await revokeSharedCart(who, Number(body.id), Number(body.version)); return ok({ revoked: true }) }
    return ok(await createSharedCart(who, body), 201)
  } catch (error) { return failure(error) }
}
