import type { NextRequest } from 'next/server'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { apiOk } from '@/modules/public-api/server/v1'
import { baleCheckout, changeBaleCheckout, scopeBalePayerCookie } from '@/modules/billing/server/pay'
import { PayError } from '@/modules/billing/domain/pay'
import { payHttpFailure } from './pay'

export async function baleCollectionHttp(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!(await rateLimitStrict('bale-checkout:' + clientIp(req.headers) + ':' + id.slice(0, 32), req.method === 'GET' ? 120 : 12, 60000)).ok) throw new PayError('تعداد درخواست زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
    if (req.method === 'POST') {
      const configuredHost = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null
      if (mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: Boolean(req.headers.get('cookie')),
        hosts: [req.headers.get('host'), configuredHost] }) !== 'allow') throw new PayError('مبدأ درخواست مجاز نیست', 403)
      const result = await changeBaleCheckout(id, req, (await readJsonObject(req, 1000)).action), response = apiOk(result)
      const payId = result.payCheckoutUrl?.match(/^\/pay\/([A-Za-z0-9_-]{32})$/)?.[1]
      if (payId) scopeBalePayerCookie(req, response, payId, result.id)
      return response
    }
    return apiOk(await baleCheckout(id, req))
  } catch (error) { return payHttpFailure(error) }
}
