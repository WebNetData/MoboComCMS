import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { emallsPage, torobPage, xmlFeed } from '@/modules/store/domain/feeds'
import { PER_PAGE, feedOverview, feedProducts, getFeedSettings, saveFeedSettings, shopInfo } from '@/modules/store/server/feeds'

const headers = { 'Cache-Control': 'public, max-age=600', 'X-Robots-Tag': 'noindex' }
const notFound = () => NextResponse.json({ error: 'feed disabled' }, { status: 404 })

async function requestBody(req: NextRequest): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') return {}
  const type = req.headers.get('content-type') || ''
  if (type.includes('json')) return (await req.json().catch(() => null)) || {}
  const form = await req.formData().catch(() => null)
  return form ? Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)])) : {}
}

const pageOf = (value: unknown) => Math.max(1, Math.min(10_000, Math.floor(Number(value)) || 1))
const slugFromUrl = (value: unknown) => { try { return decodeURIComponent(new URL(String(value)).pathname.split('/').filter(Boolean).pop() || '') } catch { return '' } }

/** GET|POST /api/feeds/torob — torob_api v3 (page, page_uniques[], page_urls[]). */
export async function torobFeed(req: NextRequest) {
  if (await moduleGuard('store')) return notFound()
  const settings = await getFeedSettings()
  if (!settings.torob) return notFound()
  const body = await requestBody(req)
  const q = req.nextUrl.searchParams
  const uniques = Array.isArray(body.page_uniques) ? body.page_uniques.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 200) : null
  const urls = Array.isArray(body.page_urls) ? body.page_urls.map(slugFromUrl).filter(Boolean).slice(0, 200) : null
  const page = pageOf(body.page ?? q.get('page'))
  const { products, total } = await feedProducts(settings, uniques || urls ? 1 : page, uniques ? { ids: uniques } : urls ? { slugs: urls } : {})
  return NextResponse.json(torobPage(products, uniques || urls ? 1 : page, total, PER_PAGE), { headers })
}

/** GET|POST /api/feeds/emalls?page=&token= — Emalls shop web service. */
export async function emallsFeed(req: NextRequest) {
  if (await moduleGuard('store')) return notFound()
  const settings = await getFeedSettings()
  if (!settings.emalls) return notFound()
  const body = await requestBody(req)
  const q = req.nextUrl.searchParams
  if (settings.emallsToken) {
    const given = Buffer.from(String(body.token ?? q.get('token') ?? req.headers.get('x-emalls-token') ?? ''))
    const expected = Buffer.from(settings.emallsToken)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ success: false, error: 'invalid token' }, { status: 401 })
  }
  const page = pageOf(body.page ?? q.get('page'))
  const { products, total } = await feedProducts(settings, page)
  return NextResponse.json(emallsPage(products, page, total, PER_PAGE), { headers })
}

/** GET /api/feeds/products.xml — Google Merchant style feed (all pages, up to 20 000 products). */
export async function xmlProductFeed() {
  if (await moduleGuard('store')) return notFound()
  const settings = await getFeedSettings()
  if (!settings.xml) return notFound()
  const all = []
  for (let page = 1; page <= 200; page++) {
    const { products, total } = await feedProducts(settings, page)
    all.push(...products)
    if (page * PER_PAGE >= total) break
  }
  return new NextResponse(xmlFeed(all, await shopInfo()), { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8' } })
}

// ------------------------------------------------------------------ admin

const feedAdmin = (req: NextRequest) => adminGuard(req, 'store', ['settings.manage', 'cms.products'])

export async function GET_adminFeeds(req: NextRequest) {
  const guard = await feedAdmin(req)
  if ('response' in guard) return guard.response
  return ok(await feedOverview())
}

export async function PUT_adminFeeds(req: NextRequest) {
  const guard = await feedAdmin(req)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  const saved = await saveFeedSettings(body.settings)
  await auditAdmin({ req, actor: guard.admin, action: 'store.feeds', targetType: 'feeds', targetId: '', metadata: { torob: saved.torob, emalls: saved.emalls, xml: saved.xml } })
  return ok(await feedOverview())
}

