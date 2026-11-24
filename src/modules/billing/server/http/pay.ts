import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { apiOk, apiErr } from '@/modules/public-api/server/v1'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { requirePerm } from '@/modules/identity/server/access'
import { updateJsonSetting, sectionSettingsRevision } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { recordRevision } from '@/modules/content/server/revisions'
import { normalizePaySettings, text } from '@/modules/billing/domain/pay-policy'
import { PayError } from '@/modules/billing/domain/pay'
import { listCheckoutGateways } from '@/modules/billing/server/gateways'
import { requirePayPayer, payReceipts, reviewPayReceipt } from '@/modules/billing/server/pay'
import {
  enrollMerchant,
  merchantDirectory, merchantAdminDetail, manageMerchant,
  createTerminal,
  changeTerminal,
  changeMerchant,
  createPayPayment,
  reportPayReference,
  acceptBankEvent,
  createPayQuote,
  requestPaySettlement,
  decidePaySettlement,
  checkoutView,
  payOverview,
  payList,
  payPaymentById,
  adminPayOverview,
  paymentView,
  settlementView,
  merchantView,
  terminalView,
  payActor,
  payContext,
  bankFeedReady,
  paySettings,
  botIntegrations, saveBotIntegration, botDeliveries, recoverBotDelivery, saveBotRouting, botOperations, botOperationDetail, payGatewayOptions,
  baleSourceStatus, smsSources, saveSmsSource,
  transferMonitor, transferReviewQueue, transferReviewDetail, transferReviewSearch, transferCollectionReview, decideTransferReview,
} from '@/modules/billing/server/pay'

export function payHttpFailure(error: unknown) {
  if (error instanceof PayError || error instanceof JsonBodyError)
    return apiErr(error.message, error.status, error instanceof PayError ? error.code : 'INVALID_BODY')
  if ((error as { code?: string })?.code === 'P2002')
    return apiErr('این داده قبلاً ثبت شده است', 409, 'PAY_CONFLICT')
  if ((error as { code?: string })?.code === 'P2034')
    return apiErr('درخواست هم‌زمان تغییر کرده؛ با همان کلید تکرار کنید', 409, 'PAY_RETRY')
  return apiErr('سرویس در دسترس نیست؛ کمی بعد دوباره تلاش کنید', 503, 'PAY_UNAVAILABLE')
}
async function limited(key: string, count = 120) {
  if (!(await rateLimitStrict(key, count, 60000)).ok)
    throw new PayError('تعداد درخواست زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
}
function csv(items: unknown[], total: number) {
  const columns = items.length ? Object.keys(items[0] as object) : ['id']
  const cell = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"'
  const content =
    '\ufeff' +
    [
      columns.map(cell).join(','),
      ...items.map((row) => columns.map((key) => cell((row as Record<string, unknown>)[key])).join(',')),
    ].join('\r\n')
  return new NextResponse(content, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="mobocom-pay.csv"',
      'cache-control': 'no-store',
      'x-total-count': String(total),
      'x-export-limit': '1000',
    },
  })
}
export async function payHttp(req: NextRequest, context: { params: Promise<{ resource: string[] }> }) {
  try {
    const parts = (await context.params).resource,
      resource = parts[0],
      machine = req.nextUrl.pathname.startsWith('/api/v1/')
    const actor = await payActor(req, machine)
    if ((await loadMaintenance())['mobocom-pay']?.enabled && !(await requirePerm(req, 'mobocom-pay.manage')))
      throw new PayError('این بخش در حال به‌روزرسانی است', 503)
    await limited('pay:' + actor.id)
    if (parts.length === 2 && resource === 'payments' && req.method === 'GET')
      return apiOk(await payPaymentById(actor, parts[1]))
    if (parts.length !== 1) return apiErr('پیدا نشد', 404)
    if (req.method === 'GET') {
      if (!machine && resource === 'bot-integrations') return apiOk({ items: await botIntegrations(actor), gateways: await payGatewayOptions() })
      if (!machine && resource === 'bot-operations') return apiOk(req.nextUrl.searchParams.get('id') ? await botOperationDetail(actor, req.nextUrl.searchParams.get('id')!) : await botOperations(actor, Object.fromEntries(req.nextUrl.searchParams)))
      if (!machine && resource === 'bot-deliveries') return apiOk({ items: await botDeliveries(actor) })
      if (resource === 'overview') return apiOk(await payOverview(actor))
      if (resource === 'terminals') return apiOk({ items: (await payOverview(actor)).terminals })
      if (resource === 'payments' || resource === 'settlements') {
        const page = await payList(actor, resource, req.nextUrl.searchParams)
        return req.nextUrl.searchParams.get('format') === 'csv' ? csv(page.items, page.total) : apiOk(page)
      }
    }
    const input = await readJsonObject(req, 12000)
    if (!machine && req.method === 'POST' && resource === 'bot-routing') return apiOk(await saveBotRouting(actor, input))
    if (!machine && req.method === 'POST' && resource === 'bot-integrations') return apiOk(await saveBotIntegration(actor, input))
    if (!machine && req.method === 'POST' && resource === 'bot-deliveries') return apiOk(await recoverBotDelivery(actor, input))
    if (req.method === 'POST') {
      if (resource === 'merchant' && !machine)
        throw new PayError('ثبت‌نام عمومی پذیرندگان بسته است؛ دسترسی توسط مدیر صادر می‌شود', 403, 'PAY_ENROLLMENT_CLOSED')
      if (resource === 'terminals') return apiOk(terminalView(await createTerminal(actor, input)), 201)
      if (resource === 'payments')
        return apiOk(
          paymentView(await createPayPayment(actor, input, req.headers.get('idempotency-key') || '')),
          201,
        )
      if (resource === 'quotes') return apiOk(await createPayQuote(actor, input), 201)
      if (resource === 'settlements')
        return apiOk(
          settlementView(await requestPaySettlement(actor, input, req.headers.get('idempotency-key') || '')),
          201,
        )
    }
    if (req.method === 'PATCH' && resource === 'terminals')
      return apiOk(terminalView(await changeTerminal(actor, input)))
    return apiErr('عملیات پشتیبانی نمی‌شود', 405)
  } catch (error) {
    return payHttpFailure(error)
  }
}
export async function payCheckoutHttp(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    await limited('pay-checkout:' + id, 60)
    if (req.method === 'POST') {
      await requirePayPayer(req, id)
      await reportPayReference(id, (await readJsonObject(req, 2000)).transferReference)
    }
    return apiOk(await checkoutView(id, req))
  } catch (error) {
    return payHttpFailure(error)
  }
}
export async function payAdminHttp(req: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const actor = await payActor(req),
      { resource } = await context.params
    await limited('pay-admin:' + actor.id)
    if (req.method === 'GET' && resource === 'overview') return apiOk(await adminPayOverview(actor))
    if (req.method === 'GET' && resource === 'merchant-directory') return apiOk(req.nextUrl.searchParams.get('id') ? await merchantAdminDetail(actor, req.nextUrl.searchParams.get('id')!) : await merchantDirectory(actor, req.nextUrl.searchParams))
    if (req.method === 'GET' && resource === 'bale-status') return apiOk(await baleSourceStatus(actor, req.nextUrl.searchParams.get('page'), req.nextUrl.searchParams.get('collectionsPage')))
    if (req.method === 'GET' && resource === 'sms-sources') return apiOk(await smsSources(actor))
    if (req.method === 'GET' && resource === 'receipts') return apiOk(await payReceipts(actor))
    if (req.method === 'GET' && resource === 'transfer-operations') return apiOk(await transferMonitor(actor))
    if (req.method === 'GET' && resource === 'transfer-reviews') {
      const collection = req.nextUrl.searchParams.get('collection')
      if (collection) return apiOk(await transferCollectionReview(actor, collection))
      const id = req.nextUrl.searchParams.get('id'), number = req.nextUrl.searchParams.get('invoice')
      return apiOk(id ? number ? await transferReviewSearch(actor, id, number) : await transferReviewDetail(actor, id) : await transferReviewQueue(actor, req.nextUrl.searchParams))
    }
    const input = await readJsonObject(req, 16000)
    if (req.method === 'POST' && resource === 'merchant-directory') return apiOk({ id: (await enrollMerchant(actor, input)).id }, 201)
    if (req.method === 'PATCH' && resource === 'merchant-directory') return apiOk(await manageMerchant(actor, input))
    if (req.method === 'PATCH' && resource === 'transfer-reviews') return apiOk(await decideTransferReview(actor, input))
    if (['POST','PATCH'].includes(req.method) && resource === 'sms-sources') return apiOk(await saveSmsSource(actor, input))
    if (req.method === 'PATCH' && resource === 'merchants')
      return apiOk(merchantView(await changeMerchant(actor, input), 0n, await paySettings.read()))
    if (req.method === 'PATCH' && resource === 'settlements')
      return apiOk(settlementView(await decidePaySettlement(actor, input)))
    if (req.method === 'PATCH' && resource === 'receipts') return apiOk(await reviewPayReceipt(actor, input))
    if (req.method === 'PATCH' && resource === 'settings') {
      const expected = text(input.settingsRevision, 64)
      await updateJsonSetting('billing.mobocom-pay.v1', async (stored, tx) => {
        await payContext(actor, tx, 'mobocom-pay.manage')
        const before = normalizePaySettings(stored)
        if (sectionSettingsRevision(before) !== expected)
          throw new PayError('تنظیمات تغییر کرده؛ صفحه را تازه کنید', 409)
        const next = normalizePaySettings(input)
        const gateways = await listCheckoutGateways('IRR')
        if (next.incomingEnabled && !gateways.length)
          throw new PayError('ابتدا یک درگاه فعال سازگار با پرداخت ریالی تنظیم کنید', 409)
        if (
          next.bankAccountIds.length &&
          (await tx.bankAccount.count({ where: { id: { in: next.bankAccountIds }, active: true, collectionUse: 'GENERAL' } })) !==
            next.bankAccountIds.length
        )
          throw new PayError('حساب بانکی فعال نیست', 409)
        Object.assign(stored, next)
        await recordRevision({
          entityType: 'settings-mobocom-pay',
          entityId: 1,
          before: { value: JSON.stringify(before) },
          after: { value: JSON.stringify(next) },
          actor,
          client: tx,
          strict: true,
        })
        await auditAdminStrict(
          {
            req,
            actor,
            action: 'mobocom-pay.settings',
            targetType: 'setting',
            targetId: 'billing.mobocom-pay.v1',
            metadata: { providerId: next.providerId, incomingEnabled: next.incomingEnabled },
          },
          tx,
        )
      })
      return apiOk({ saved: true })
    }
    return apiErr('عملیات پشتیبانی نمی‌شود', 405)
  } catch (error) {
    return payHttpFailure(error)
  }
}
export async function payBankHttp(req: NextRequest) {
  try {
    const timestamp = req.headers.get('x-pay-timestamp') || '',
      signature = req.headers.get('x-pay-signature') || ''
    const secret = process.env.MOBOCOM_PAY_BANK_SECRET || ''
    if (
      secret.length < 32 ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new PayError('امضای بانکی معتبر نیست', 401)
    const bytes: Uint8Array[] = []
    let length = 0
    const reader = req.body?.getReader()
    if (!reader) throw new PayError('داده دریافت نشد')
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.length
      if (length > 8000) {
        await reader.cancel()
        throw new PayError('داده بیش از حد بزرگ است', 413)
      }
      bytes.push(part.value)
    }
    const raw = Buffer.concat(bytes),
      expected = createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(raw)
        .digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new PayError('امضای بانکی معتبر نیست', 401)
    await limited('pay-bank-feed:' + (process.env.MOBOCOM_PAY_BANK_PROVIDER || ''), 240)
    let input: unknown
    try {
      input = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new PayError('دادهٔ بانکی معتبر نیست')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new PayError('دادهٔ بانکی معتبر نیست')
    const result = await acceptBankEvent(
      input as Record<string, unknown>,
      createHash('sha256').update(raw).digest('hex'),
    )
    return apiOk({ id: result.id, status: result.status, paymentId: result.paymentId })
  } catch (error) {
    return payHttpFailure(error)
  }
}
