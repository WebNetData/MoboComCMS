import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { CART_COOKIE, type CartOwner } from '@/modules/store/server/cart'
import { StoreError } from '@/modules/store/domain/store'
import { addReorderToCart, previewReorder } from '@/modules/store/server/reorder'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { rateLimitStrict } from '@/platform/http/rate-limit'

type Context = { params: Promise<{ id: string }> }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const idOf = (raw: unknown) => { const id = Number(raw); return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0 }
function failure(error: unknown) {
  if (error instanceof StoreError || error instanceof JsonBodyError) return reply({ error: error.message, code: error instanceof StoreError ? error.code : undefined }, error.status)
  console.error('[store.reorder]', error)
  return reply({ error: 'خطای داخلی؛ دوباره تلاش کنید' }, 500)
}

export async function GET_reorder(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'برای سفارش مجدد وارد حساب شوید' }, 401)
  const id = idOf((await context.params).id); if (!id) return reply({ error: 'شناسه سفارش معتبر نیست' }, 400)
  try { return reply(await previewReorder(user.id, id)) } catch (error) { return failure(error) }
}

export async function POST_reorder(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'برای سفارش مجدد وارد حساب شوید' }, 401)
  let publicHost: string | null = null
  try { publicHost = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null } catch { /* an invalid public URL cannot authorize a foreign Origin */ }
  const origin = mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: Boolean(req.headers.get('cookie')), hosts: [req.headers.get('host'), publicHost] })
  if (origin !== 'allow') return reply({ error: origin === 'foreign-origin' ? 'درخواست از سایت دیگری پذیرفته نمی‌شود' : 'برای تغییر سبد، درخواست مرورگر معتبر لازم است' }, 403)
  const id = idOf((await context.params).id); if (!id) return reply({ error: 'شناسه سفارش معتبر نیست' }, 400)
  if (!(await rateLimitStrict(`store-reorder:${user.id}:${id}`, 8, 300_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  try {
    const body = await readJsonObject(req, 8192)
    if (!Array.isArray(body.sourceLineIds) || body.sourceLineIds.length < 1 || body.sourceLineIds.length > 50 || body.sourceLineIds.some(value => !Number.isSafeInteger(value) || Number(value) < 0) || new Set(body.sourceLineIds).size !== body.sourceLineIds.length) return reply({ error: 'ردیف‌های انتخاب‌شده معتبر نیستند' }, 400)
    const owner: CartOwner = { userId: user.id, token: req.cookies.get(CART_COOKIE)?.value || null }
    const result = await addReorderToCart(owner, id, body.sourceLineIds as number[])
    const response = reply(result)
    if (result.cart.token) response.headers.append('Set-Cookie', `${CART_COOKIE}=${encodeURIComponent(result.cart.token)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=5184000`)
    return response
  } catch (error) { return failure(error) }
}
