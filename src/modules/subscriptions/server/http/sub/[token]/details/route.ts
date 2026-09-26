// Everything the customer needs to connect, for the "اتصال" panel in the
// dashboard, the Telegram mini app and the admin panel: the live subscription
// URL(s) with their health, the individual configs, usage and expiry.
import { NextRequest, NextResponse } from 'next/server'
import { buildConnectKit } from '@/modules/subscriptions/server/subs'
import { requireUser } from '@/modules/identity/server/access'
import { db } from '@/platform/database/prisma'
import { happImportUrl } from '@/modules/subscriptions/server/happ-protocol'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'


export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const locale = await getUserLocale(user.id) || (req.cookies.get('lang')?.value === 'fa' ? 'fa' : 'en')
  const owned = await db.subscription.findUnique({ where: { subToken: params.token }, select: { userId: true, plan: true } })
  if (!owned || owned.userId !== user.id) return NextResponse.json({ ok: false, error: locale === 'fa' ? 'اشتراک یافت نشد' : 'Subscription not found' }, { status: 404 })
  const sync = req.nextUrl.searchParams.get('sync') !== '0'
  const kit = await buildConnectKit({ token: params.token }, { sync })
  if (!kit) return NextResponse.json({ ok: false, error: locale === 'fa' ? 'اشتراک یافت نشد' : 'Subscription not found' }, { status: 404 })
  const { links: _links, formats: _formats, endpoints: _endpoints, primary: rawPrimary, ...safe } = kit
  let happUrl = '', happError = ''
  try {
    happUrl = await happImportUrl(params.token)
  } catch (e) {
    console.warn(`[sub] Happ import link failed for a panel subscription: ${e instanceof Error ? e.message : 'unknown'}`)
    happError = locale === 'fa' ? 'ساخت لینک رمزگذاری‌شده Happ موقتاً ممکن نشد؛ لینک خام پنل نمایش داده نمی‌شود.' : 'The encrypted Happ link is temporarily unavailable; the raw panel URL remains hidden.'
  }
  const primary = { kind: 'happ' as const, url: happUrl, healthy: Boolean(happUrl) && rawPrimary.healthy }
  return NextResponse.json({
    ...safe,
    planName: planName(owned.plan, locale),
    linksError: safe.linksError ? locale === 'fa' ? safe.linksError : 'No valid configuration was returned by the VPN panel. Sync again or contact support.' : null,
    endpoints: happUrl ? [primary] : [],
    primary,
    happUrl,
    happError,
    syncMessage: kit.syncMessage ? locale === 'fa' ? 'همگام‌سازی پنل کامل نشد' : 'Panel sync did not complete.' : null,
    links: [],
    formats: [],
  }, { headers: { 'cache-control': 'no-store, private' } })
}
