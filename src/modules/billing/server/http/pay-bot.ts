import { NextRequest, NextResponse } from 'next/server'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { PayError } from '@/modules/billing/domain/pay'
import { createBotPayment } from '@/modules/billing/server/pay'

/** Body-token compatibility boundary: no cookie/session authentication or vendor envelope. */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await rateLimitStrict('pay-bot-create:' + clientIp(req.headers), 120, 60_000)).ok) throw new PayError('درخواست زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
    if ((await loadMaintenance())['mobocom-pay']?.enabled) throw new PayError('درگاه موقتاً در حال به‌روزرسانی است', 503)
    const result = await createBotPayment(req, (await context.params).id, await readJsonObject(req, 6000))
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const known = error instanceof PayError || error instanceof JsonBodyError
    return NextResponse.json({ ok: false, message: known ? error.message : 'ساخت لینک پرداخت انجام نشد؛ همان سفارش را دوباره بررسی کنید.' }, { status: known ? error.status : 503, headers: { 'cache-control': 'no-store' } })
  }
}
