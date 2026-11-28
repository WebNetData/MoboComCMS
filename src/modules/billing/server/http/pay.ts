import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { apiOk, apiErr } from '@/modules/public-api/server/v1'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { requirePerm } from '@/modules/identity/server/access'
import { updateJsonSetting, sectionSettingsRevision } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { recordRevision } from '@/modules/content/server/revisions'
import { normalizePaySettings, text } from '@/modules/billing/domain/pay-policy'
import { PayError, type PayPaymentView } from '@/modules/billing/domain/pay'
import { listCheckoutGateways } from '@/modules/billing/server/gateways'
import { requirePayPayer, payReceipts, reviewPayReceipt, previewPayStatement, statementAccounts } from '@/modules/billing/server/pay'
import { payFinancialPeriod, changePayFinancialPeriod } from '@/modules/billing/server/pay'
import { payCenterGet, payCenterWrite } from './pay-center'
import {
  applyPayMerchant,
  enrollMerchant,
  merchantDirectory, merchantAdminDetail, manageMerchant,
  createTerminal,
  changeTerminal,
  changeMerchant,
  saveMerchantFeeShare,
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
  adminPayPayments,
  payFinancialReport,
  settlementView,
  merchantView,
  terminalView,
  payActor,
  payContext,
  isPaySerializationConflict,
  bankFeedReady,
  paySettings,
  botIntegrations, saveBotIntegration, botDeliveries, recoverBotDelivery, saveBotRouting, botOperations, botOperationDetail, payGatewayOptions,
  adminGatewayAccess, saveGatewayAccess, terminalGatewayOptions,
  adminTerminalKeys, changeAdminTerminalKey,
  smsSources, saveSmsSource,
  transferMonitor, transferReviewQueue, transferReviewDetail, transferReviewSearch, transferCollectionReview, decideTransferReview,
} from '@/modules/billing/server/pay'

export function payHttpFailure(error: unknown) {
  if (error instanceof PayError || error instanceof JsonBodyError)
    return apiErr(error.message, error.status, error instanceof PayError ? error.code : 'INVALID_BODY')
  if ((error as { code?: string })?.code === 'P2002')
    return apiErr('این داده قبلاً ثبت شده است', 409, 'PAY_CONFLICT')
  if (isPaySerializationConflict(error))
    return apiErr('درخواست هم‌زمان تغییر کرده؛ با همان کلید تکرار کنید', 409, 'PAY_RETRY')
  return apiErr('سرویس در دسترس نیست؛ کمی بعد دوباره تلاش کنید', 503, 'PAY_UNAVAILABLE')
}
async function limited(key: string, count = 120) {
  if (!(await rateLimitStrict(key, count, 60000)).ok)
    throw new PayError('تعداد درخواست زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
}
function csv(items: unknown[], total: number, options?: { filename: string; columns?: string[] }) {
  const columns = options?.columns ?? (items.length ? Object.keys(items[0] as object) : ['id'])
  const cell = (v: unknown) =>
    '"' +
    (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))
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
      'content-disposition': `attachment; filename="${options?.filename ?? 'mobocom-pay.csv'}"`,
      'cache-control': 'no-store',
      'x-total-count': String(total),
      'x-export-limit': '1000',
    },
  })
}
async function financialReportResponse(req: NextRequest, actor: Awaited<ReturnType<typeof payActor>>, scope: 'admin' | 'merchant') {
  const params = req.nextUrl.searchParams
  const report = await payFinancialReport(actor, scope, params)
  if (params.get('format') === 'csv') {
    const section = params.get('section')
    if (section === 'closing' || section === 'settlements') {
      const closing = section === 'closing'
      const rows = (closing ? report.closing : report.settlements).map(row => ({ from: report.from, to: report.to, ...row }))
      const columns = closing
        ? ['from', 'to', 'currency', 'credited', 'paid', 'difference']
        : ['from', 'to', 'currency', 'status', 'count', 'sourceAmount']
      return csv(rows, rows.length, { filename: `mobocom-pay-${section}-${report.from}-${report.to}.csv`, columns })
    }
    const rows = report.terminalId ? report.days.map(row => ({ terminalId: report.terminalId, ...row })) : report.days
    return csv(rows, rows.length, { filename: `mobocom-pay-daily-${report.from}-${report.to}.csv` })
  }
  return apiOk(report)
}
const machinePayment = (row: PayPaymentView) => row.status === 'UNDER_REVIEW' ? { ...row, status: 'PENDING' as const, reviewStatus: 'UNDER_REVIEW' as const } : row
export async function payHttp(req: NextRequest, context: { params: Promise<{ resource: string[] }> }) {
  try {
    const parts = (await context.params).resource,
      resource = parts[0],
      legacyMachine = req.nextUrl.pathname.startsWith('/api/v1/'),
      machine = legacyMachine || req.nextUrl.pathname.startsWith('/api/v2/')
    const actor = await payActor(req, machine)
    if ((await loadMaintenance())['mobocom-pay']?.enabled && !(await requirePerm(req, 'mobocom-pay.manage')))
      throw new PayError('این بخش در حال به‌روزرسانی است', 503)
    await limited(actor.terminalKey ? 'pay-terminal-key:' + actor.terminalKey.id : 'pay:' + actor.id)
    if (actor.terminalKey) {
      const payment = resource === 'payments' && (req.method === 'POST' && parts.length === 1 || req.method === 'GET' && parts.length === 2)
      const catalogue = req.method === 'GET' && resource === 'terminals' && parts.length === 3 && parts[2] === 'gateways'
      if (!payment && !catalogue) throw new PayError('این عملیات در دسترسی کلید پایانه نیست', 403, 'PAY_TERMINAL_KEY_SCOPE')
    }
    if (req.method === 'GET') { const center = await payCenterGet(req, actor, resource); if (center) return center }
    if (parts.length === 3 && resource === 'terminals' && parts[2] === 'gateways' && !legacyMachine && req.method === 'GET') {
      const amounts = req.nextUrl.searchParams.getAll('amountRial')
      if (amounts.length > 1) throw new PayError('مبلغ فقط یک‌بار قابل ارسال است', 422)
      return apiOk(await terminalGatewayOptions(actor, parts[1], amounts[0]))
    }
    if (parts.length === 2 && resource === 'payments' && req.method === 'GET') {
      const payment = await payPaymentById(actor, parts[1])
      return apiOk(machine ? machinePayment(payment) : payment)
    }
    if (parts.length !== 1) return apiErr('پیدا نشد', 404)
    if (req.method === 'GET') {
      if (!machine && resource === 'reports') return await financialReportResponse(req, actor, 'merchant')
      if (!machine && resource === 'bot-integrations') return apiOk({ items: await botIntegrations(actor), gateways: await payGatewayOptions() })
      if (!machine && resource === 'bot-operations') return apiOk(req.nextUrl.searchParams.get('id') ? await botOperationDetail(actor, req.nextUrl.searchParams.get('id')!) : await botOperations(actor, Object.fromEntries(req.nextUrl.searchParams)))
      if (!machine && resource === 'bot-deliveries') return apiOk({ items: await botDeliveries(actor) })
      if (resource === 'overview') {
        const overview = await payOverview(actor)
        const versioned = { ...overview, payments: overview.payments.map(machinePayment) }
        return apiOk(legacyMachine ? { ...versioned, rails: overview.rails.filter(r => ['IRR_BANK','TRX_TRON','USDT_TRON'].includes(r.id)) } : machine ? versioned : overview)
      }
      if (resource === 'terminals') return apiOk({ items: (await payOverview(actor)).terminals })
      if (resource === 'payments' || resource === 'settlements') {
        const page = await payList(actor, resource, req.nextUrl.searchParams)
        const items = machine && resource === 'payments' ? page.items.map(row => row.status === 'UNDER_REVIEW' ? { ...row, status: 'PENDING' as const, reviewStatus: 'UNDER_REVIEW' as const } : row) : page.items
        return req.nextUrl.searchParams.get('format') === 'csv' ? csv(items, page.total) : apiOk({ ...page, items })
      }
    }
    const input = await readJsonObject(req, 12000)
    const center = await payCenterWrite(actor, resource, req.method, input)
    if (center) return center
    if (!machine && req.method === 'POST' && resource === 'bot-routing') return apiOk(await saveBotRouting(actor, input))
    if (!machine && req.method === 'POST' && resource === 'bot-integrations') return apiOk(await saveBotIntegration(actor, input))
    if (!machine && req.method === 'POST' && resource === 'bot-deliveries') return apiOk(await recoverBotDelivery(actor, input))
    if (req.method === 'POST') {
      if (resource === 'merchant' && !machine) {
        if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host'))) throw new PayError('مبدأ درخواست معتبر نیست', 403)
        await limited('pay-application:' + actor.id, 5)
        return apiOk(await applyPayMerchant(actor, input))
      }
      if (resource === 'terminals') return apiOk(terminalView(await createTerminal(actor, input)), 201)
      if (resource === 'payments') {
        if (legacyMachine && Object.hasOwn(input, 'gatewayRef')) throw new PayError('انتخاب درگاه در نسخهٔ ۲ API ارائه می‌شود', 422, 'PAY_API_V2_REQUIRED')
        const created = await createPayPayment(actor, input, req.headers.get('idempotency-key') || '')
        const payment = await payPaymentById(actor, created.id)
        return apiOk(machine ? machinePayment(payment) : payment, 201)
      }
      if (resource === 'quotes') {
        if (legacyMachine && (!['IRR_BANK','TRX_TRON','USDT_TRON'].includes(String(input.railId)) || input.sourceCurrency !== undefined && input.sourceCurrency !== 'IRR')) throw new PayError('برای شبکه‌ها یا موجودی تتر از نسخهٔ ۲ API استفاده کنید', 422, 'PAY_API_V2_REQUIRED')
        return apiOk(await createPayQuote(actor, input), 201)
      }
      if (resource === 'settlements')
        return apiOk(
          settlementView(await requestPaySettlement(actor, input, req.headers.get('idempotency-key') || '')),
          201,
        )
    }
    if (req.method === 'PATCH' && resource === 'terminals')
      return apiOk(terminalView(await changeTerminal(actor, input)))
    if (!machine && req.method === 'PATCH' && resource === 'fee-share') {
      if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host')))
        throw new PayError('مبدأ درخواست معتبر نیست', 403)
      return apiOk(await saveMerchantFeeShare(actor, input))
    }
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
    if (req.method === 'GET') { const center = await payCenterGet(req, actor, resource, true); if (center) return center }
    if (req.method === 'GET' && resource === 'overview') return apiOk(await adminPayOverview(actor))
    if (req.method === 'GET' && resource === 'payments') return apiOk(await adminPayPayments(actor, req.nextUrl.searchParams))
    if (req.method === 'GET' && resource === 'reports') return await financialReportResponse(req, actor, 'admin')
    if (resource === 'financial-periods') {
      if (req.method === 'GET') return apiOk(await payFinancialPeriod(actor, req.nextUrl.searchParams))
      if (req.method === 'POST') {
        const origin = req.headers.get('origin')
        if (!origin || !originIsThisSite(origin, req.nextUrl.host)) throw new PayError('مبدأ درخواست معتبر نیست', 403)
        return apiOk(await changePayFinancialPeriod(actor, await readJsonObject(req, 4096)))
      }
    }
    if (req.method === 'GET' && resource === 'gateway-access') return apiOk(await adminGatewayAccess(actor, req.nextUrl.searchParams.get('id')))
    if (req.method === 'GET' && resource === 'terminal-keys') return apiOk(await adminTerminalKeys(actor, req.nextUrl.searchParams.get('id')))
    if (req.method === 'GET' && resource === 'merchant-directory') return apiOk(req.nextUrl.searchParams.get('id') ? await merchantAdminDetail(actor, req.nextUrl.searchParams.get('id')!) : await merchantDirectory(actor, req.nextUrl.searchParams))
    if (req.method === 'GET' && resource === 'sms-sources') return apiOk(await smsSources(actor))
    if (req.method === 'GET' && resource === 'receipts') {
      const ids = req.nextUrl.searchParams.get('ids')
      if (ids !== null && (!/^[1-9]\d{0,9}(?:,[1-9]\d{0,9}){0,249}$/.test(ids) || ids.split(',').some(value => Number(value) > 2147483647)))
        throw new PayError('شناسه‌های رسید معتبر نیستند', 422)
      return apiOk(await payReceipts(actor, ids?.split(',').map(Number)))
    }
    if (resource === 'statement-preview') {
      if (req.method === 'GET') return apiOk({ accounts: await statementAccounts(actor) })
      if (req.method === 'POST') {
        const origin = req.headers.get('origin')
        if (!origin || !originIsThisSite(origin, req.nextUrl.host)) throw new PayError('مبدأ درخواست معتبر نیست', 403)
        await limited('pay-statement-preview:' + actor.id, 10)
        return apiOk(await previewPayStatement(actor, await readJsonObject(req, 65_536)))
      }
    }
    if (req.method === 'GET' && resource === 'transfer-operations') return apiOk(await transferMonitor(actor))
    if (req.method === 'GET' && resource === 'transfer-reviews') {
      const collection = req.nextUrl.searchParams.get('collection')
      if (collection) return apiOk(await transferCollectionReview(actor, collection))
      const id = req.nextUrl.searchParams.get('id'), number = req.nextUrl.searchParams.get('invoice')
      return apiOk(id ? number ? await transferReviewSearch(actor, id, number) : await transferReviewDetail(actor, id) : await transferReviewQueue(actor, req.nextUrl.searchParams))
    }
    const input = await readJsonObject(req, 16000)
    if (resource === 'terminal-keys' && (req.method === 'POST' || req.method === 'PATCH')) {
      const origin = req.headers.get('origin')
      if (!origin || !originIsThisSite(origin, req.nextUrl.host)) throw new PayError('مبدأ درخواست معتبر نیست', 403)
      return apiOk(await changeAdminTerminalKey(actor, req.method, input), req.method === 'POST' ? 201 : 200)
    }
    if (req.method === 'PATCH' && resource === 'gateway-access') {
      const origin = req.headers.get('origin')
      if (!origin || !originIsThisSite(origin, req.nextUrl.host)) throw new PayError('مبدأ درخواست معتبر نیست', 403)
      return apiOk(await saveGatewayAccess(actor, input))
    }
    const center = await payCenterWrite(actor, resource, req.method, input, true)
    if (center) return center
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
        if (!before.incomingEnabled && next.incomingEnabled && !(await listCheckoutGateways('IRR', tx, next.bale, 'pay')).length)
          throw new PayError('ابتدا یک درگاه فعال سازگار با پرداخت ریالی تنظیم کنید', 409)
        if (
          next.bankAccountIds.length &&
          (await tx.bankAccount.count({ where: { id: { in: next.bankAccountIds }, active: true } })) !==
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
