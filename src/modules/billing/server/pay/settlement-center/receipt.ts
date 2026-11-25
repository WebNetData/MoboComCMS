import { randomBytes } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { payContext, payTransaction, type PayActor } from '../context'
import { settlementView } from '../views'

const escape = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const when = (value: Date | null) => value ? value.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'ثبت نشده'
const rial = (value: bigint) => value.toLocaleString('fa-IR') + ' ریال'
const states: Record<string,string> = { REQUESTED: 'در انتظار بررسی', APPROVED: 'تأییدشده؛ انتقال وجه ثبت نشده', PAID: 'انتقال وجه ثبت شده', REJECTED: 'رد شده' }

/** Read-only document, never a payment acknowledgement or an authority to transfer funds. */
export async function settlementReceipt(actor: PayActor, id: string, admin = false) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new PayError('شناسهٔ تسویه معتبر نیست')
  return payTransaction(async tx => {
    await payContext(actor, tx, admin ? 'mobocom-pay.settle' : undefined)
    const row = await tx.paySettlement.findFirst({ where: { id, ...(admin ? {} : { merchant: { userId: actor.id, status: 'ACTIVE' } }) }, include: { merchant: { select: { name: true } } } })
    if (!row) throw new PayError('گزارش تسویه پیدا نشد', 404)
    const nonce = randomBytes(18).toString('base64'), paid = row.status === 'PAID'
    const title = paid ? 'رسید ثبت انتقال وجه' : 'گزارش درخواست تسویه'
    const result = settlementView(row)
    const facts: [string, unknown][] = [
      ['پذیرنده',row.merchant.name],['شناسهٔ تسویه',row.id],['وضعیت',states[row.status] || row.status],['زمان ثبت درخواست',when(row.createdAt)],['موعد بررسی',row.scheduledFor ? when(row.scheduledFor) : 'بدون زمان‌بندی'],
      ['مبلغ معادل ریالی درخواست',rial(row.amountMinor)],['برداشت از کیف پول',result.sourceAmount + ' ' + result.sourceCurrency],['کارمزد تسویه',row.feeAmount + ' ' + row.feeCurrency],['معادل ریالی کارمزد',rial(row.feeMinor)],['دریافتی نهایی',result.payoutAmount + ' ' + row.asset],['شبکه',row.network],['نام مقصد',row.destinationLabel || 'مقصد واردشده'],['نشانی مقصد',row.destination],
      ['تأیید نخست',row.approvedById ? `شناسهٔ مدیر ${row.approvedById} · ${when(row.firstApprovedAt)}` : 'ثبت نشده'],['تأیید دوم',row.requiresSecondApproval ? row.secondApprovedById ? `شناسهٔ مدیر ${row.secondApprovedById} · ${when(row.secondApprovedAt)}` : 'لازم است؛ ثبت نشده' : 'طبق سیاست درخواست لازم نبوده'],['مرجع انتقال',row.reference || 'انتقال ثبت نشده'],['آخرین ثبت',when(row.updatedAt)],['دلیل یا توضیح',row.reason || '—'],
    ]
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | MoboCom Pay</title><style nonce="${nonce}">body{font:15px/2 Tahoma,sans-serif;color:#202020;background:#f4f5f7;margin:0;padding:32px}main{max-width:850px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:16px;padding:32px}header{border-bottom:2px solid #333;padding-bottom:20px}h1{font-size:24px;margin:8px 0}p{margin:8px 0}dl{margin:24px 0}dl>div{display:grid;grid-template-columns:210px minmax(0,1fr);gap:20px;padding:12px 0;border-bottom:1px solid #eee}dt{color:#555}dd{margin:0;overflow-wrap:anywhere;unicode-bidi:plaintext}.notice{padding:12px;border:1px solid #999;border-radius:8px}footer{font-size:12px;color:#555}@media(max-width:600px){body{padding:12px}main{padding:20px}dl>div{grid-template-columns:1fr;gap:4px}}@media print{body{background:#fff;padding:0}main{border:0;padding:0;max-width:none}dl>div{break-inside:avoid}}@page{margin:18mm}</style></head><body><main><header><bdi>MoboCom Pay</bdi><h1>${title}</h1><p>${escape(row.merchant.name)}</p></header><p class="notice">${paid ? 'این سند ثبت انتقال مدیریت را نشان می‌دهد؛ برای پیگیری از مرجع انتقال استفاده کنید.' : 'این درخواست به معنی واریز یا انتقال وجه نیست؛ انتقالی ثبت نشده است.'}</p><dl>${facts.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><footer>سوابق دفتر مالی موبوکام‌پی · مبلغ، کارمزد و واحد دارایی جدا نمایش داده شده‌اند</footer></main></body></html>`
    return { settlement: result, html, nonce, filename: 'MoboComPay-Settlement-' + row.id + '.html' }
  })
}
