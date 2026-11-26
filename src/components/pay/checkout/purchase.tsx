import type { PayCheckout } from '@/modules/billing/domain/pay'
import { date, money } from '../client'
import { Badge } from '../shared'
import s from '../Pay.module.css'
import p from './Purchase.module.css'

export default function Purchase({ data }: { data: PayCheckout }) {
  const purchase = data.purchase
  if (!purchase) return null
  return <section className={`${s.card} ${p.purchase}`} aria-label="جزئیات خرید اعتبار">
    <div className={s.sectionHead}><div><h2>{purchase.beneficiaryName}</h2><p className={p.caption}>اعتبار برای حساب این پذیرنده · سفارش <bdi>{data.externalId}</bdi></p></div><Badge value={data.status} /></div>
    <div className={p.amount}><span>مقدار خرید اعتبار داخلی</span><strong><bdi dir="ltr">{purchase.amount} <small>USDT</small></bdi></strong><p>این اعتبار به حساب پذیرنده افزوده می‌شود؛ انتقال به کیف پول شبکهٔ شما نیست.</p></div>
    <dl className={p.total}><dt>مبلغ قابل پرداخت شما</dt><dd>{money(data.totalRial)}</dd></dl>
    {data.status === 'PENDING' && <p className={p.caption}>مهلت خرید با این نرخ: {date(data.expiresAt)}</p>}
    <details className={p.details}><summary>نرخ، کارمزد و جزئیات خرید</summary><dl className={s.priceSummary}>
      <div><dt>نرخ هر USDT</dt><dd>{money(purchase.rateRial)}</dd></div><div><dt>زمان نرخ</dt><dd>{date(purchase.rateAt)}</dd></div>
      <div><dt>هزینهٔ اعتبار</dt><dd>{money(purchase.convertedRial)}</dd></div>
      {data.customerFeeRial && data.customerFeeRial !== '0' && <div><dt>سهم مشتری از کارمزد</dt><dd>{money(data.customerFeeRial)}</dd></div>}
      {data.merchantFeeRial && data.merchantFeeRial !== '0' && <div><dt>سهم پذیرنده از کارمزد</dt><dd>{money(data.merchantFeeRial)}</dd></div>}
      <div><dt>هزینهٔ گرد کردن</dt><dd>{money(purchase.roundingRial)}</dd></div>
    </dl><p className={p.caption}>اعتبار با دقت ۰٫۰۱ USDT ثبت می‌شود. باقیماندهٔ ریالیِ گرد کردن به‌عنوان هزینهٔ پلتفرم کسر می‌شود و به موجودی تتری پذیرنده افزوده نمی‌شود. پس از پایان مهلت، لینک خرید تازه را از پذیرنده بگیرید.</p></details>
  </section>
}
