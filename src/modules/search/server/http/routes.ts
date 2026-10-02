import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { moduleGuard } from '@/extensions/server/modules'
import { parseTypes, searchSite, suggest } from '@/modules/search/server/search'

/** GET /api/search?q=&type=&page= — or ?suggest=1[&types=title,album] for the autocomplete boxes. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('search')
  if (off) return off
  if (!rateLimitHit(`search:${clientIp(req.headers)}`, 60, 60_000).ok) return err('درخواست‌های زیادی فرستادید؛ چند ثانیه صبر کنید', 429)
  const params = req.nextUrl.searchParams
  const q = params.get('q') || ''
  const response = params.get('suggest') === '1'
    ? ok({ results: await suggest(q, parseTypes(params.get('types'))) })
    : ok(await searchSite({ q, type: params.get('type'), page: params.get('page') }))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
