import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { getViewer } from '@/modules/membership/server/membership'
import { parseItemKey } from '@/modules/content/domain/items'
import { itemCard } from '@/modules/content/server/registry'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { ReviewError } from '@/modules/reviews/domain/reviews'
import { deleteReview, itemEngagement, moderateReview, reviewQueue, saveReview, setFavorite, setReviewHelpful } from '@/modules/reviews/server/reviews'

function failure(error: unknown) {
  if (error instanceof ReviewError) return err(error.message, error.status)
  console.error('[reviews]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

async function member(req: NextRequest) {
  const off = await moduleGuard('reviews')
  if (off) return { response: off }
  const user = await requireUser(req)
  return user ? { user } : { response: err('برای این کار وارد حساب خود شوید', 401) }
}

const refOf = (value: unknown) => parseItemKey(value)

/** GET /api/engage?item=software:12&page=2&sort=new|helpful|high|low&verified=1 */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('reviews')
  if (off) return off
  const ref = refOf(req.nextUrl.searchParams.get('item'))
  if (!ref) return err('invalid item')
  if (!await itemCard(ref)) return err('Item unavailable', 404)
  const viewer = await getViewer()
  return ok(await itemEngagement(ref, viewer.userId, Number(req.nextUrl.searchParams.get('page')), { sort: req.nextUrl.searchParams.get('sort'), verifiedOnly: req.nextUrl.searchParams.get('verified') === '1' }))
}

/** POST /api/engage/review { item, rating, body, scores? } — scores: optional per-type dimension scores, e.g. { gameplay: 5 } */
export async function POST_review(req: NextRequest) {
  const g = await member(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const ref = refOf(body.item)
  if (!ref) return err('invalid item')
  try { return ok(await saveReview(g.user.id, ref, body)) } catch (error) { return failure(error) }
}

/** DELETE /api/engage/review?item=software:12 */
export async function DELETE_review(req: NextRequest) {
  const g = await member(req)
  if ('response' in g) return g.response
  const ref = refOf(req.nextUrl.searchParams.get('item'))
  if (!ref) return err('invalid item')
  try { return ok(await deleteReview(g.user.id, ref)) } catch (error) { return failure(error) }
}

/** POST /api/engage/review/helpful { reviewId, on } */
export async function POST_helpful(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const g = await member(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const reviewId = Number(body.reviewId)
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || typeof body.on !== 'boolean') return err('invalid input')
  try { return ok(await setReviewHelpful(g.user.id, reviewId, body.on)) } catch (error) { return failure(error) }
}

/** POST /api/engage/favorite { item, on, notify } */
export async function POST_favorite(req: NextRequest) {
  const g = await member(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const ref = refOf(body.item)
  if (!ref) return err('invalid item')
  try { return ok(await setFavorite(g.user.id, ref, { on: body.on !== false, notify: body.notify !== false })) } catch (error) { return failure(error) }
}

/** GET /api/admin/reviews?status=PENDING&page=1 */
export async function GET_admin(req: NextRequest) {
  const g = await adminGuard(req, 'reviews', ['reviews.moderate'])
  if ('response' in g) return g.response
  return ok(await reviewQueue(req.nextUrl.searchParams.get('status') || 'PENDING', Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)))
}

/** POST /api/admin/reviews { id, action: approve | reject | delete } */
export async function POST_admin(req: NextRequest) {
  const g = await adminGuard(req, 'reviews', ['reviews.moderate'])
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'reject', 'delete'].includes(body.action)) return err('invalid input')
  try {
    const result = await moderateReview(id, body.action)
    await auditAdmin({ req, actor: g.admin, action: `reviews.${body.action}`, targetType: 'item-review', targetId: id })
    return ok(result)
  } catch (error) { return failure(error) }
}
