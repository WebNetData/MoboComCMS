'use client'

import { useRef, useState, type FormEvent } from 'react'
import { minorToDecimal } from '@/shared/money'
import { iranianUnit } from '@/shared/money/format'
import { Notice, fa, faDate, send } from '../shared'

type Preview = {
  payment: { id: number; amountMinor: string; currency: string; paidAt: string }
  buyer: { email: string } | null
  product: { name: string; siteLimit: number; supportDays: number } | null
  state: string; canRestore: boolean; canRefund: boolean; evidence: string
}
type View = { phase: 'idle' | 'loading' | 'ready' | 'submitting' | 'success' | 'error'; preview?: Preview; message?: string }
const integerFormat = new Intl.NumberFormat('fa-IR')
const LABELS: Record<string, string> = {
  unfulfilled: 'پرداخت انجام شده؛ مجوز صادر نشده است', fulfilled: 'مجوز این پرداخت قبلاً ثبت شده است', refunded: 'این پرداخت قبلاً بازپرداخت شده است',
  'invalid-payment': 'این رکورد برای بازیابی خرید معتبر نیست', 'duplicate-receipts': 'چند مجوز برای این پرداخت وجود دارد؛ بررسی دستی لازم است',
  'receipt-mismatch': 'مجوز و مبلغ پرداخت همخوان نیستند؛ بررسی دستی لازم است', 'refund-conflict': 'بازپرداخت و مجوز نیاز به بررسی دستی دارند',
}

function paymentAmount(preview: Preview) {
  try {
    const amount = BigInt(preview.payment.amountMinor)
    const absolute = amount < 0n ? -amount : amount, unit = iranianUnit(preview.payment.currency)
    return unit ? `${integerFormat.format(absolute)} ${unit}` : `${minorToDecimal(absolute, preview.payment.currency)} ${preview.payment.currency}`
  } catch { return `${preview.payment.amountMinor} ${preview.payment.currency}` }
}

function PaymentDetails({ preview }: { preview: Preview }) {
  return <dl className="ad-fields">
    <div><dt>دریافت‌کننده</dt><dd><bdi dir="ltr">{preview.buyer?.email || 'نامشخص'}</bdi></dd></div>
    <div><dt>مبلغ پرداخت</dt><dd className="num"><bdi>{paymentAmount(preview)}</bdi></dd></div>
    <div><dt>تاریخ پرداخت</dt><dd>{faDate(preview.payment.paidAt)}</dd></div>
    <div><dt>محصول</dt><dd>{preview.product?.name || 'محصول موجود نیست'}</dd></div>
  </dl>
}

export default function PurchaseRecovery({ onRecovered }: { onRecovered: () => void }) {
  const [paymentId, setPaymentId] = useState(''), [reviewed, setReviewed] = useState(false), [terms, setTerms] = useState(false)
  const [view, setView] = useState<View>({ phase: 'idle' }), locked = useRef(false)
  const busy = view.phase === 'loading' || view.phase === 'submitting', preview = view.preview

  async function inspect(event: FormEvent) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true; setReviewed(false); setTerms(false); setView({ phase: 'loading' })
    try {
      const response = await fetch(`/api/admin/repository?view=purchase-recovery&paymentId=${encodeURIComponent(paymentId)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw Error(response.status === 403 ? 'دسترسی مدیریت مخزن و مالی برای بررسی پرداخت لازم است.' : data.error || 'بررسی پرداخت انجام نشد.')
      setView({ phase: 'ready', preview: data })
    } catch (error) { setView({ phase: 'error', message: error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد.' }) }
    finally { locked.current = false }
  }

  async function recover(mode: 'restore' | 'refund') {
    if (!preview || !reviewed || locked.current || (mode === 'restore' && !terms)) return
    locked.current = true; setView({ phase: 'submitting', preview })
    try {
      const result = await send<{ repeated: boolean }>('/api/admin/repository', 'POST', { op: 'purchase.recover', paymentId: preview.payment.id, mode, evidence: preview.evidence, acknowledgeCurrentTerms: terms })
      if (!result.ok) { setView({ phase: 'error', message: result.error === 'forbidden' ? 'دسترسی این حساب تغییر کرده است؛ دوباره بررسی کنید.' : result.error }); return }
      setView({ phase: 'success', message: result.data.repeated ? 'این بازیابی قبلاً انجام شده بود؛ تغییر تکراری ثبت نشد.' : mode === 'restore' ? 'مجوز ثبت شد؛ خریدار آن را در حساب خود می‌بیند.' : 'مبلغ به کیف پول همان خریدار بازگردانده شد.' })
      setReviewed(false); setTerms(false); onRecovered()
    } catch { setView({ phase: 'error', message: 'ارتباط قطع شد؛ پیش از تلاش دوباره، پرداخت را مجدداً بررسی کنید.' }) }
    finally { locked.current = false }
  }

  return <section className="sa-card rp-form rp-recovery" data-testid="purchase-recovery" aria-labelledby="purchase-recovery-title" aria-busy={busy}>
    <header className="sa-card-head"><h2 id="purchase-recovery-title">بازیابی خرید ناقص</h2></header>
    <p className="sa-sub">شناسهٔ تراکنش را از دفتر کیف پول وارد کنید. ابتدا پرداخت را بررسی کنید؛ مبلغ دوباره کسر نمی‌شود.</p>
    <form onSubmit={inspect} className="sa-row-actions">
      <label className="sa-field"><span>شناسهٔ تراکنش پرداخت</span><input className="input" name="paymentId" autoComplete="off" spellCheck={false} type="text" inputMode="numeric" pattern="[0-9]+" dir="ltr" required maxLength={10} value={paymentId} disabled={busy} onChange={event => { setPaymentId(event.target.value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 1776 : 1632)))); setView({ phase: 'idle' }); setReviewed(false); setTerms(false) }} /></label>
      <button type="submit" className="btn btn-ghost" disabled={busy}>{view.phase === 'loading' ? 'در حال بررسی…' : 'بررسی پرداخت'}</button>
    </form>
    {view.message && <Notice tone={view.phase === 'error' ? 'error' : 'ok'}>{view.message}</Notice>}
    {preview && <div>
      <h3>{LABELS[preview.state] || 'این وضعیت به بررسی دستی نیاز دارد'}</h3>
      <PaymentDetails preview={preview} />
      {preview.canRestore && preview.product && <p className="sa-notice is-ok">شرایط فعلی محصول: {preview.product.siteLimit ? `${fa(preview.product.siteLimit)} سایت` : 'سایت نامحدود'}؛ به‌روزرسانی {preview.product.supportDays ? `${fa(preview.product.supportDays)} روز از تاریخ پرداخت` : 'همیشگی'}. شرایط تاریخی ذخیره نشده‌اند؛ دورهٔ به‌روزرسانی از امروز شروع نمی‌شود.</p>}
      {(preview.canRestore || preview.canRefund) && <fieldset disabled={busy}>
        <legend>تأیید تصمیم بازیابی</legend>
        <label><input name="reviewedPayment" type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> پرداخت، دریافت‌کننده و مبلغ را بررسی کردم.</label>
        {preview.canRestore && <label><input name="acknowledgeCurrentTerms" type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} /> شرایط فعلی محصول و محاسبهٔ دوره از تاریخ پرداخت را تأیید می‌کنم.</label>}
        <div className="sa-row-actions">
          {preview.canRestore && <button type="button" className="btn btn-primary" disabled={!reviewed || !terms || busy} onClick={() => void recover('restore')}>صدور مجوز از پرداخت ثبت‌شده</button>}
          {preview.canRefund && <button type="button" className="btn btn-ghost" disabled={!reviewed || busy} onClick={() => void recover('refund')}>بازگرداندن مبلغ به کیف پول</button>}
        </div>
      </fieldset>}
    </div>}
    {view.phase === 'submitting' && <p role="status">در حال ثبت تصمیم بازیابی…</p>}
  </section>
}
