// Bank Mellat (Behpardakht) internet payment gateway — SOAP client.
// Flow: bpPayRequest → customer POSTs RefId to the bank → bank POSTs the
// result to our callback → bpVerifyRequest → bpSettleRequest (money moves
// to the merchant). If anything fails after a successful payment, the
// payment is reversed (bpReversalRequest) so the customer is refunded.

// Overridable for the bank's test environment.
export const MELLAT_WSDL_URL = process.env.MELLAT_API_URL || 'https://bpm.shaparak.ir/pgwchannel/services/pgw'
export const MELLAT_START_URL = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat'

export type MellatCredentials = { terminalId: string; userName: string; password: string }

const MESSAGES: Record<string, string> = {
  '0': 'تراکنش با موفقیت انجام شد',
  '11': 'شماره کارت نامعتبر است', '12': 'موجودی کافی نیست', '13': 'رمز نادرست است', '14': 'تعداد دفعات وارد کردن رمز بیش از حد مجاز است',
  '15': 'کارت نامعتبر است', '16': 'دفعات برداشت وجه بیش از حد مجاز است', '17': 'کاربر از انجام تراکنش منصرف شد', '18': 'تاریخ انقضای کارت گذشته است',
  '19': 'مبلغ برداشت وجه بیش از حد مجاز است', '111': 'صادرکنندهٔ کارت نامعتبر است', '112': 'خطای سوییچ صادرکنندهٔ کارت', '113': 'پاسخی از صادرکنندهٔ کارت دریافت نشد',
  '114': 'دارندهٔ کارت مجاز به انجام این تراکنش نیست', '21': 'پذیرنده (ترمینال) نامعتبر است', '23': 'خطای امنیتی رخ داده است', '24': 'اطلاعات کاربری پذیرنده نامعتبر است',
  '25': 'مبلغ نامعتبر است', '31': 'پاسخ نامعتبر است', '32': 'فرمت اطلاعات وارد شده صحیح نیست', '33': 'حساب نامعتبر است', '34': 'خطای سیستمی',
  '35': 'تاریخ نامعتبر است', '41': 'شمارهٔ درخواست تکراری است', '42': 'تراکنش Sale یافت نشد', '43': 'قبلاً درخواست Verify داده شده است',
  '44': 'درخواست Verify یافت نشد', '45': 'تراکنش Settle شده است', '46': 'تراکنش Settle نشده است', '47': 'تراکنش Settle یافت نشد',
  '48': 'تراکنش Reverse شده است', '49': 'تراکنش Refund یافت نشد', '412': 'شناسهٔ قبض نادرست است', '413': 'شناسهٔ پرداخت نادرست است',
  '414': 'سازمان صادرکنندهٔ قبض نامعتبر است', '415': 'زمان جلسهٔ کاری به پایان رسیده است', '416': 'خطا در ثبت اطلاعات', '417': 'شناسهٔ پرداخت‌کننده نامعتبر است',
  '418': 'اشکال در تعریف اطلاعات مشتری', '419': 'تعداد دفعات ورود اطلاعات از حد مجاز گذشته است', '421': 'IP سرور در بانک ثبت نشده است',
  '51': 'تراکنش تکراری است', '54': 'تراکنش مرجع موجود نیست', '55': 'تراکنش نامعتبر است', '61': 'خطا در واریز',
}

/**
 * Bank order id: numeric and unique per request — the invoice number's digits
 * plus a 6-digit time suffix, so a retry of the same invoice gets a fresh id
 * and the callback can be tied back to its invoice.
 */
export function mellatOrderId(invoiceNumber: string, now = Date.now()) {
  const digits = String(Number(invoiceNumber.replace(/\D/g, '').slice(-9) || '0'))
  return Number(`${digits}${String(now % 1_000_000).padStart(6, '0')}`)
}

/** Whether a bank SaleOrderId belongs to this invoice (see mellatOrderId). */
export function mellatOrderMatches(invoiceNumber: string, saleOrderId: string) {
  const digits = String(Number(invoiceNumber.replace(/\D/g, '').slice(-9) || '0'))
  return /^\d+$/.test(saleOrderId) && saleOrderId.startsWith(digits) && saleOrderId.length === digits.length + 6
}

export const mellatMessage = (code: string) => MESSAGES[code] || `خطای درگاه بانک ملت (کد ${code || 'نامشخص'})`

const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function envelope(method: string, fields: Record<string, string | number>) {
  const body = Object.entries(fields).map(([key, value]) => `<${key}>${xmlEscape(String(value))}</${key}>`).join('')
  return `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:int="http://interfaces.core.sw.bps.com/"><soapenv:Header/><soapenv:Body><int:${method}>${body}</int:${method}></soapenv:Body></soapenv:Envelope>`
}

/** The `<return>` value of a SOAP response, or null when the reply is not a SOAP result. */
export function parseReturn(xml: string): string | null {
  const match = xml.match(/<return>([\s\S]*?)<\/return>/i)
  return match ? match[1].trim() : null
}

async function call(method: string, fields: Record<string, string | number>): Promise<{ ok: true; value: string } | { ok: false; message: string; network: boolean }> {
  try {
    const response = await fetch(MELLAT_WSDL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: envelope(method, fields),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    const value = parseReturn(text)
    if (value === null) return { ok: false, message: `پاسخ نامعتبر از بانک (HTTP ${response.status})`, network: true }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.name === 'TimeoutError' ? 'بانک پاسخ نداد' : 'ارتباط با بانک ملت برقرار نشد', network: true }
  }
}

const tehran = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date).map((part) => [part.type, part.value]))
  return { date: `${parts.year}${parts.month}${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}${parts.minute}${parts.second}` }
}

const auth = (c: MellatCredentials) => ({ terminalId: c.terminalId, userName: c.userName, userPassword: c.password })

/** Starts a payment. Amount is in Rial. Returns the bank RefId on success ("0,RefId"). */
export async function mellatPayRequest(c: MellatCredentials, input: { orderId: number; amountRial: bigint; callbackUrl: string; description?: string; mobile?: string }) {
  const now = tehran(new Date())
  const result = await call('bpPayRequest', {
    ...auth(c), orderId: input.orderId, amount: input.amountRial.toString(), localDate: now.date, localTime: now.time,
    additionalData: (input.description || '').slice(0, 100), callBackUrl: input.callbackUrl, payerId: 0,
    ...(input.mobile ? { mobileNo: input.mobile.replace(/^0/, '98') } : {}),
  })
  if (!result.ok) return { ok: false as const, code: '', message: result.message, ambiguous: result.network }
  const [code, refId] = result.value.split(',').map((part) => part.trim())
  if (code === '0' && refId) return { ok: true as const, refId }
  return { ok: false as const, code, message: mellatMessage(code), ambiguous: false }
}

type Ref = { orderId: string | number; saleOrderId: string | number; saleReferenceId: string | number }
const refFields = (r: Ref) => ({ orderId: r.orderId, saleOrderId: r.saleOrderId, saleReferenceId: r.saleReferenceId })

/** Result code of verify / settle / inquiry / reversal ("0" = success). */
async function refCall(method: string, c: MellatCredentials, r: Ref) {
  const result = await call(method, { ...auth(c), ...refFields(r) })
  return result.ok ? { code: result.value.split(',')[0].trim(), message: mellatMessage(result.value.split(',')[0].trim()), network: false } : { code: '', message: result.message, network: true }
}

export const mellatVerify = (c: MellatCredentials, r: Ref) => refCall('bpVerifyRequest', c, r)
export const mellatInquiry = (c: MellatCredentials, r: Ref) => refCall('bpInquiryRequest', c, r)
export const mellatSettle = (c: MellatCredentials, r: Ref) => refCall('bpSettleRequest', c, r)
export const mellatReversal = (c: MellatCredentials, r: Ref) => refCall('bpReversalRequest', c, r)

/** Auto-submitting page that posts the RefId to the bank (the bank requires a POST). */
export function mellatStartPage(refId: string, mobile?: string) {
  const safe = xmlEscape(refId)
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>انتقال به درگاه بانک ملت</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Tahoma,Vazirmatn,sans-serif;background:#f4f5f7;color:#1f2937}.box{text-align:center;padding:32px;border-radius:16px;background:#fff;box-shadow:0 10px 40px #0001;max-width:360px}.spin{width:36px;height:36px;margin:0 auto 16px;border:4px solid #e5e7eb;border-top-color:#c2185b;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}button{margin-top:16px;padding:10px 22px;border:0;border-radius:10px;background:#c2185b;color:#fff;font:inherit;cursor:pointer}</style></head>
<body><form class="box" id="f" method="post" action="${MELLAT_START_URL}"><div class="spin"></div><p>در حال انتقال به درگاه امن بانک ملت…</p><input type="hidden" name="RefId" value="${safe}">${mobile ? `<input type="hidden" name="MobileNo" value="${xmlEscape(mobile.replace(/^0/, '98'))}">` : ''}<button type="submit">اگر منتقل نشدید، اینجا بزنید</button></form>
<script>document.getElementById('f').submit()</script></body></html>`
}
