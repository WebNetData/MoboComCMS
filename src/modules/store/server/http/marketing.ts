import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { MarketingError } from '@/modules/store/domain/marketing'
import {
  adjustPoints, adminCartRecovery, adminGiftCards, adminLoyalty, adminStockAlerts, issueGiftCards, loyaltyOverview, myGiftCards, purchaseGiftCard,
  redeemGiftCard, redeemPoints, revealGiftCard, runMarketingJobs, saveGiftSettings, saveLoyaltySettings, saveRecoverySettings, setGiftCardStatus,
  stockAlertStatus, subscribeStockAlert, unsubscribeStockAlert,
} from '@/modules/store/server/marketing'

function failure(error: unknown) {
  if (error instanceof MarketingError) return err(error.message, error.status, { code: error.code })
  console.error('[store-marketing]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

async function customer(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return { response: off }
  const user = await requireUser(req)
  if (!user) return { response: err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' }) }
  return { user }
}

// ------------------------------------------------------------------ back in stock

/** GET/POST/DELETE /api/store/stock-alerts?productId=&variantId= */
export async function GET_stockAlert(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  const q = req.nextUrl.searchParams
  return ok(await stockAlertStatus(who.user.id, q.get('productId'), q.get('variantId')))
}
export async function POST_stockAlert(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  const body = (await req.json().catch(() => null)) || {}
  try { return ok(await subscribeStockAlert(who.user.id, body.productId, body.variantId)) } catch (error) { return failure(error) }
}
export async function DELETE_stockAlert(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  const q = req.nextUrl.searchParams
  return ok(await unsubscribeStockAlert(who.user.id, q.get('productId'), q.get('variantId')))
}

// ------------------------------------------------------------------ gift cards

/** GET /api/store/gift-cards — my purchased and redeemed cards. */
export async function GET_giftCards(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  return ok(await myGiftCards(who.user.id))
}

/** POST /api/store/gift-cards {op:'redeem', code} | {op:'buy', toman, recipientName?, recipientEmail?, message?, idempotencyKey} */
export async function POST_giftCards(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.op === 'redeem') {
      // Codes are 80-bit random, but guessing is still throttled per account and IP.
      const limit = await rateLimitStrict(`gift-redeem:${who.user.id}`, 8, 10 * 60_000)
      const ipLimit = await rateLimitStrict(`gift-redeem-ip:${clientIp(req.headers)}`, 20, 10 * 60_000)
      if (!limit.ok || !ipLimit.ok) return err('تلاش‌های زیادی انجام شد؛ چند دقیقهٔ دیگر دوباره امتحان کنید', 429)
      return ok(await redeemGiftCard(who.user.id, body.code))
    }
    if (body.op === 'buy') return ok(await purchaseGiftCard(who.user.id, body))
    return err('عملیات نامعتبر است')
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ customer club

export async function GET_club(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  return ok(await loyaltyOverview(who.user.id))
}

/** POST /api/store/club {op:'redeem', points} */
export async function POST_club(req: NextRequest) {
  const who = await customer(req)
  if ('response' in who) return who.response
  const body = (await req.json().catch(() => null)) || {}
  if (body.op !== 'redeem') return err('عملیات نامعتبر است')
  if (!(await rateLimitStrict(`club-redeem:${who.user.id}`, 10, 60_000)).ok) return err('کمی صبر کنید', 429)
  try { return ok(await redeemPoints(who.user.id, body.points)) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ admin

const marketingAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage', 'settings.manage'])

/** GET /api/admin/store/marketing?view=alerts|carts|gifts|club&status=&page= */
export async function GET_adminMarketing(req: NextRequest) {
  const guard = await marketingAdmin(req)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view')) {
      case 'alerts': return ok(await adminStockAlerts())
      case 'carts': return ok(await adminCartRecovery())
      case 'gifts': return ok(await adminGiftCards({ status: q.get('status'), page: q.get('page') }))
      case 'club': return ok(await adminLoyalty())
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

/** POST /api/admin/store/marketing {op, …} */
export async function POST_adminMarketing(req: NextRequest) {
  const guard = await marketingAdmin(req)
  if ('response' in guard) return guard.response
  const admin = guard.admin
  const body = (await req.json().catch(() => null)) || {}
  const audit = (action: string, targetId: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: admin, action: `store.${action}`, targetType: 'marketing', targetId: String(targetId ?? ''), metadata })
  try {
    switch (body.op) {
      case 'recovery-settings': { const r = await saveRecoverySettings(body.settings); await audit('cart_recovery_settings', '', { enabled: r.enabled }); return ok(r) }
      case 'loyalty-settings': { const r = await saveLoyaltySettings(body.settings); await audit('loyalty_settings', '', { enabled: r.enabled }); return ok(r) }
      case 'gift-settings': { const r = await saveGiftSettings(body.settings); await audit('gift_settings', ''); return ok(r) }
      case 'gift-issue': { const r = await issueGiftCards(body, admin.id); await audit('gift_issue', r.cards.map((card) => card.id).join(','), { count: r.cards.length, toman: r.toman }); return ok(r) }
      case 'gift-status': { await setGiftCardStatus(body.id, body.disabled === true); await audit('gift_status', body.id, { disabled: body.disabled === true }); return ok({ done: true }) }
      case 'gift-reveal': { const r = await revealGiftCard(body.id); await audit('gift_reveal', body.id); return ok(r) }
      case 'points-adjust': { const balance = await adjustPoints(body.userId, body.points, body.note, admin.id); await audit('points_adjust', body.userId, { points: body.points, note: body.note }); return ok({ balance }) }
      case 'run-now': return ok({ results: await runMarketingJobs() })
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
