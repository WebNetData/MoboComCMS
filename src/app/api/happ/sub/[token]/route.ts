import { NextRequest, NextResponse } from 'next/server'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { fetchProfile, upstreamUrl, validProfile } from '@/modules/subscriptions/domain/subscription-content'
import { isHappClient } from '@/modules/subscriptions/server/happ-protocol'
import { loadSub, siteBaseUrl } from '@/modules/subscriptions/server/subs'

import { userOpensSection } from '@/modules/account/server/section-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  if (process.env.ALLOW_LEGACY_HAPP_PROXY !== 'true') {
    return NextResponse.json({ error: 'پروکسی قدیمی ساب غیرفعال است.' }, { status: 410, headers: { 'cache-control': 'no-store' } })
  }
  const params = await paramsPromise
  if (!isHappClient(req.headers)) {
    return NextResponse.json({ error: 'این مسیر فقط در برنامه Happ قابل استفاده است.' }, { status: 403 })
  }
  if (!/^[a-f0-9]{48}$/i.test(params.token)) return NextResponse.json({ error: 'لینک نامعتبر است' }, { status: 404 })
  const limit = rateLimitHit(`happ-sub:${params.token}`, 20, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'درخواست بیش از حد' }, { status: 429, headers: { 'retry-after': String(limit.retryAfter) } })
  const sub = await loadSub({ token: params.token })
  if (!sub) return NextResponse.json({ error: 'اشتراک یافت نشد' }, { status: 404 })
  if (!await userOpensSection('vpn', sub.userId)) return NextResponse.json({ error: 'دسترسی به این بخش محدود است' }, { status: 403, headers: { 'cache-control': 'private, no-store' } })
  if (sub.status !== 'ACTIVE' || sub.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'اشتراک غیرفعال یا منقضی شده است' }, { status: 403 })
  }

  const panel = sub.panel || sub.plan.panel
  const adapter = panel ? getPanelAdapter(panel) : null
  if (!adapter) return NextResponse.json({ error: 'پنل اشتراک آماده نیست' }, { status: 503 })

  let profile = ''
  const api = await adapter.getSubscription(sub.username, 'links').catch(() => null)
  if (api?.ok && api.body && validProfile(api.body, 'links')) profile = api.body
  if (!profile) {
    const publicUrl = upstreamUrl(sub.panelSubUrl, await siteBaseUrl())
    if (publicUrl) profile = await fetchProfile(publicUrl, 'links')
  }
  if (!profile) return NextResponse.json({ error: 'پنل کانفیگ معتبری برنگرداند' }, { status: 502 })

    return new Response(profile, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'subscription-userinfo': `upload=0; download=${Math.round(sub.trafficUsed * 1024 ** 3)}; total=${Math.round(sub.trafficLimit * 1024 ** 3)}; expire=${Math.floor(sub.expiresAt.getTime() / 1000)}`,
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      },
    })
}
