import type { NextRequest } from 'next/server'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { apiOk } from '@/modules/public-api/server/v1'
import { PayError } from '@/modules/billing/domain/pay'
import { submitCollectionReceipt } from '@/modules/billing/server/pay'
import { payHttpFailure } from '@/modules/billing/server/http/pay'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!(await rateLimitStrict('bale-receipt:' + clientIp(req.headers) + ':' + id.slice(0, 32), 6, 3600000)).ok) throw new PayError('تعداد درخواست زیاد است', 429)
    const configuredHost = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null
    if (mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: Boolean(req.headers.get('cookie')), hosts: [req.headers.get('host'), configuredHost] }) !== 'allow') throw new PayError('مبدأ درخواست مجاز نیست', 403)
    const response = apiOk(await submitCollectionReceipt(req, id)); response.headers.set('Cache-Control', 'private, no-store'); return response
  } catch (error) { return payHttpFailure(error) }
}
