import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { siteRedirect } from '@/platform/http/redirect'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { isMember } from '@/modules/membership/server/membership'
import { walletBalance } from '@/modules/wallet/server/wallet'
import { receiveImage } from '@/modules/site/server/http/admin/media/route'
import { AdsError, parsePlacementList } from '@/modules/ads/domain/ads'
import { getAdsConfig, recordClick, recordImpression, serveAd } from '@/modules/ads/server/serving'
import { advertiserAction, advertiserPortal, buyPackage, publicPackages } from '@/modules/ads/server/manage'

/**
 * Public side of advertising. Named "promo" on purpose: address-based blockers
 * remove /ads/ and /banner/ paths, and the site's own sponsors should still show.
 */

const failure = (error: unknown) => {
  if (error instanceof AdsError) return err(error.message, error.status, error.meta)
  throw error
}
const userIdOf = async (req: NextRequest) => (await requireUser(req))?.id ?? null
const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/promo/serve?p=<placement>&path=<page>&lang=fa → the promotion to show (or null).
 * GET /api/promo/serve?ps=<a,b,c>&path=…&lang=… → { ads: { a: …, b: … } }: every slot of a page in one request.
 */
export async function GET_serve(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const many = q.has('ps') ? parsePlacementList(q.get('ps')) : undefined
  if (many === null) return err('invalid placements', 400)
  const none = { ad: null, fallback: '', reserve: null }
  const off = await moduleGuard('ads')
  if (off) return NextResponse.json(many ? { ads: Object.fromEntries(many.map((key) => [key, none])) } : none, { headers: NO_STORE })
  if (!rateLimitHit(`promo:serve:${clientIp(req.headers)}`, 240, 60_000).ok) return NextResponse.json(many ? { ads: {} } : none, { status: 429, headers: NO_STORE })
  if (many) {
    const userId = await userIdOf(req)
    const input = { path: q.get('path') || '/', language: q.get('lang') || 'fa', userAgent: req.headers.get('user-agent') || '', userId, vip: () => (userId ? isMember(userId) : Promise.resolve(false)) }
    const served = await Promise.all(many.map((placement) => serveAd({ ...input, placement })))
    return NextResponse.json({ ads: Object.fromEntries(many.map((key, index) => [key, served[index]])) }, { headers: NO_STORE })
  }
  const placement = String(q.get('p') || '')
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(placement)) return err('invalid placement', 400)
  const userId = await userIdOf(req)
  const served = await serveAd({ placement, path: q.get('path') || '/', language: q.get('lang') || 'fa', userAgent: req.headers.get('user-agent') || '', userId, vip: () => (userId ? isMember(userId) : Promise.resolve(false)) })
  return NextResponse.json(served, { headers: NO_STORE })
}

/** POST /api/promo/view — the banner has been on screen long enough ({ t: token }). */
export async function POST_view(req: NextRequest) {
  if (!rateLimitHit(`promo:view:${clientIp(req.headers)}`, 300, 60_000).ok) return new NextResponse(null, { status: 204 })
  const body = await req.json().catch(() => null)
  await recordImpression(String(body?.t || ''), req.headers.get('user-agent') || '').catch(() => false)
  return new NextResponse(null, { status: 204, headers: NO_STORE })
}

/** GET /api/promo/click?t=<token> → counts the click and sends the visitor to the advertiser. */
export async function GET_click(req: NextRequest) {
  const visitor = `${clientIp(req.headers)}|${(req.headers.get('user-agent') || '').slice(0, 60)}`
  const target = await recordClick(req.nextUrl.searchParams.get('t') || '', visitor, req.headers.get('user-agent') || '').catch(() => null)
  if (!target) return siteRedirect('/', 302)
  return new Response(null, { status: 302, headers: { Location: target, 'Referrer-Policy': 'origin', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
}

/** GET /api/promo/packages — packages on sale (public). */
export async function GET_packages() {
  const off = await moduleGuard('ads')
  if (off) return off
  const config = await getAdsConfig()
  return ok({ selfServe: config.selfServe, packages: await publicPackages() })
}

/** GET /api/promo/mine — the signed-in advertiser: campaigns, results and wallet. */
export async function GET_mine(req: NextRequest) {
  const off = await moduleGuard('ads')
  if (off) return off
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  const [portal, packages, balance, config] = await Promise.all([advertiserPortal(userId), publicPackages(), walletBalance(userId, 'IRT'), getAdsConfig()])
  return ok({ ...portal, packages, balance, selfServe: config.selfServe })
}

/** POST /api/promo/buy — { packageId, requestId, advertiser?, creative } */
export async function POST_buy(req: NextRequest) {
  const off = await moduleGuard('ads')
  if (off) return off
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  if (!rateLimitHit(`promo:buy:${userId}`, 10, 3_600_000).ok) return err('درخواست‌های خرید زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
  const body = (await req.json().catch(() => null)) || {}
  try { return ok(await buyPackage(userId, body)) } catch (error) { return failure(error) }
}

/** PATCH /api/promo/mine — { campaignId, action: pause | resume | creative, ...creative } */
export async function PATCH_mine(req: NextRequest) {
  const off = await moduleGuard('ads')
  if (off) return off
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  const body = (await req.json().catch(() => null)) || {}
  try { await advertiserAction(userId, Number(body.campaignId) || 0, String(body.action || ''), body.creative || {}); return ok({ ok: true }) } catch (error) { return failure(error) }
}

/** POST /api/promo/media — a banner image from a signed-in advertiser. */
export async function POST_media(req: NextRequest) {
  const off = await moduleGuard('ads')
  if (off) return off
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  if (!rateLimitHit(`promo:media:${userId}`, 30, 3_600_000).ok) return err('بارگذاری‌ها زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
  return receiveImage(req)
}
