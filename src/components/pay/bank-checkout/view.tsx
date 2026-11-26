'use client'

import type { BaleCheckout } from '@/modules/billing/domain/pay-bale-collection'
import { money } from '../client'
import s from '../Pay.module.css'
import v from '../BankCheckout.module.css'
import DestinationCard, { TransferAmount } from '../checkout/destination-card'

function Equivalent({ data }: { data: BaleCheckout }) {
  const rate = data.usdt, available = rate?.status === 'AVAILABLE' && rate.amount
  const asOf = rate?.asOf ? new Date(rate.asOf).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  return <div className={v.equivalent} aria-label="معادل نمایشی تتر">
    <span className={v.coin} aria-hidden="true">₮</span>
    <div className={v.asset}><strong>معادل تتر</strong><span dir="ltr">USDT · BSC / BEP20</span></div>
    <div className={v.conversion}>{available ? <strong dir="ltr">{rate.lessThan ? '< ' : '≈ '}{rate.amount} <small>USDT</small></strong> : <span>{rate?.status === 'STALE' ? 'نرخ نیازمند به‌روزرسانی است' : 'نرخ تتر در دسترس نیست'}</span>}
      <details className={v.rateDetails}><summary>نرخ نمایشی</summary><div>{available && <p>هر تتر: <bdi>{rate.rateToman}</bdi> تومان</p>}{asOf && <p>{rate?.manual ? 'ثبت دستی' : 'آخرین نرخ ثبت‌شده'}: {asOf}</p>}<p>معادل نمایشی است؛ این درخواست با کارت به کارت پرداخت می‌شود.</p></div></details>
    </div>
  </div>
}

function Resolution({ data, expired, busy, back, onRenew }: { data: BaleCheckout; expired: boolean; busy: boolean; back: string | null; onRenew: () => void }) {
  if (data.status === 'UNDER_REVIEW') return <section className={v.resolution} role="status"><span className={v.stateIcon} aria-hidden="true">…</span><h2>در حال بررسی و تأیید</h2><p>رسید شما ثبت شد. نتیجه همین‌جا نمایش داده می‌شود؛ نیازی به واریز مجدد نیست.</p>{back && <a className={s.secondary} href={back}>بازگشت به سفارش</a>}</section>
  if (expired) return <section className={`${v.resolution} ${v.expired}`}><span className={v.stateIcon} aria-hidden="true">!</span><h2>مهلت پرداخت فاکتور به اتمام رسید</h2><strong>دیگر واریز نکنید</strong><p>برای ادامه، درخواست تازه با مبلغ و مهلت جدید صادر کنید.</p><button type="button" className={s.button} disabled={busy} onClick={onRenew}>{busy ? 'در حال دریافت…' : 'صدور مجدد فاکتور'}</button></section>
  if (data.status === 'PAID') return <section className={`${v.resolution} ${v.success}`}><span className={v.stateIcon} aria-hidden="true">✓</span><h2>پرداخت تأیید شد</h2><p>واریز شما ثبت شده است.</p>{back && <a className={s.button} href={back}>بازگشت به سفارش</a>}</section>
  return <section className={v.resolution}><h2>{data.reviewReason === 'RECEIPT_REJECTED' ? 'رسید تأیید نشد' : 'پرداخت نیازمند بررسی است'}</h2><p>{data.reviewReason === 'RECEIPT_REJECTED' ? 'برای ادامه، درخواست تازه صادر کنید.' : 'برای پیگیری این واریز با پشتیبانی تماس بگیرید.'}</p>{data.reviewReason === 'RECEIPT_REJECTED' && <button type="button" className={s.button} disabled={busy} onClick={onRenew}>صدور درخواست تازه</button>}</section>
}

export default function BankCheckoutView({ data, error, expired, countdown, remaining, accepted, busy, copied, uploading, back, onAcceptChoice, onAccept, onRenew, onCopy, onReceipt, onRefresh }: {
  data: BaleCheckout | null; error: string; expired: boolean; countdown: string; remaining: number | null
  accepted: boolean; busy: boolean; copied: string; uploading: boolean; back: string | null
  onAcceptChoice: (value: boolean) => void; onAccept: () => void; onRenew: () => void
  onCopy: (label: string, value: string) => void; onReceipt: () => void; onRefresh: () => void
}) {
  const pending = data?.status === 'PENDING' && !expired
  const status = error ? 'دریافت ناموفق' : uploading ? 'در حال ثبت رسید' : !data ? 'در حال دریافت' : expired ? 'مهلت پایان یافت' : data.status === 'UNDER_REVIEW' ? 'در حال بررسی' : data.status === 'PAID' ? 'تأیید شد' : data.status === 'REVIEW' ? 'نیازمند بررسی' : data.accepted ? 'در انتظار واریز' : 'بررسی مبلغ'
  return <main className={`${s.page} ${v.page}`} dir="rtl">
    <header className={v.header}><div className={v.brand}><span dir="ltr">MoboCom Pay</span><h1>پرداخت سفارش</h1></div><span className={v.badge} data-state={expired ? 'EXPIRED' : data?.status}><i aria-hidden="true" />{status}</span></header>
    {error && <div className={v.error} role="alert"><p>{error}</p><button type="button" className={s.secondary} onClick={onRefresh}>تلاش دوباره</button></div>}
    {!data ? !error && <div className={v.panel} role="status">در حال دریافت اطلاعات پرداخت…</div> : <section className={v.panel} aria-labelledby="bank-payment-title">
      <div className={v.invoice}><h2 id="bank-payment-title">{pending ? 'مبلغ نهایی سفارش' : 'خلاصهٔ درخواست'}</h2><bdi title={data.invoiceNumber}>{data.invoiceNumber}</bdi></div>
      {!data.receiptOnly && <><TransferAmount value={data.collectedRial} onCopy={pending && data.bank && !error ? onCopy : undefined} />
      <details className={v.breakdown}><summary>جزئیات مبلغ و معادل تتر</summary><dl>
        <div><dt>مبلغ سفارش</dt><dd>{money(data.orderRial ?? data.principalRial)}</dd></div>
        {data.customerFeeRial && data.customerFeeRial !== '0' && <div><dt>سهم مشتری از کارمزد</dt><dd>{money(data.customerFeeRial)}</dd></div>}
        {data.merchantFeeRial && data.merchantFeeRial !== '0' && <div><dt>سهم پذیرنده از کارمزد</dt><dd>{money(data.merchantFeeRial)}</dd></div>}
        <div><dt>مبلغ یکتای تشخیص واریز</dt><dd>{money(data.adjustmentRial)}</dd></div>
      </dl><Equivalent data={data} /></details></>}
      {error ? <p className={v.muted}>برای ادامه، وضعیت درخواست را تازه کنید.</p> : pending && data.receiptOnly ?
        <div className={v.consent}><p role="status">تأیید پیامکی این درخواست در دسترس نیست. با این درخواست واریز تازه انجام ندهید.</p>
          {data.accepted ? <button type="button" className={s.button} disabled={uploading} onClick={onReceipt}>ارسال رسید واریز قبلی</button>
            : <p className={v.muted}>برای دریافت لینک تازه با پذیرنده یا پشتیبانی تماس بگیرید.</p>}</div>
        : pending ? <>
        <div className={v.timer}><div><span>زمان باقی‌مانده برای واریز</span><strong dir="ltr">{countdown}</strong></div><progress aria-label="مهلت باقی‌مانده پرداخت" max={Math.max(1, (Date.parse(data.expiresAt) - Date.parse(data.validFrom)) / 1000)} value={remaining ?? 0} /></div>
        {!data.accepted ? <div className={v.consent}><label className={s.check}><input type="checkbox" checked={accepted} onChange={event => onAcceptChoice(event.target.checked)} />مبلغ نهایی و هزینهٔ خدمت را می‌پذیرم</label><button type="button" className={s.button} disabled={!accepted || busy} onClick={onAccept}>{busy ? 'در حال ثبت…' : 'پذیرش و ادامه'}</button></div>
          : data.bank ? <><DestinationCard bank={data.bank} onCopy={onCopy} /><p className={v.feedback} role="status">{copied || 'پس از واریز مبلغ دقیق، وضعیت تأیید پیامکی همین‌جا به‌روزرسانی می‌شود.'}</p><button type="button" className={s.button} disabled={uploading} onClick={onReceipt}>{uploading ? 'در حال ثبت رسید…' : 'پرداخت کرده‌ام، ارسال رسید'}</button></>
          : <p className={v.muted}>اطلاعات واریز هنوز آماده نیست؛ وضعیت را تازه کنید.</p>}
      </> : <Resolution data={data} expired={expired} busy={busy} back={back} onRenew={onRenew} />}
    </section>}
    <footer className={v.footer}><span>درگاه پرداخت موبوکام</span>{back && pending && <a href={back}>بازگشت به سفارش</a>}</footer>
  </main>
}
