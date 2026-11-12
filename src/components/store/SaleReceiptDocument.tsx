import type { ReactNode } from 'react'
import Barcode from '@/components/store/Barcode'
import { formatMoney } from '@/shared/money'
import { persianWords } from '@/modules/billing/domain/official-invoice'

/**
 * A printed sale document (app/sale-receipt.css, prefix sr-). One component for the counter receipt in Admin and the
 * customer's QR page, in two papers: an A4 invoice ("sheet") or an 80 mm thermal roll ("roll"). Callers decide what is
 * private: the public page passes no stamp, phone, payments or codes.
 */
export type SaleDocumentFormat = 'sheet' | 'roll'
export type SaleDocumentSeller = { name: string; logo: string; phone?: string; address?: string; postalCode?: string; economicCode?: string; nationalId?: string; registrationNo?: string; stamp?: string; note?: string }
export type SaleDocumentProps = {
  format: SaleDocumentFormat
  seller: SaleDocumentSeller
  title: string
  number: string
  createdAt: string
  status?: { label: string; tone: 'ok' | 'warn' | 'muted' }
  paid?: boolean
  parties: { label: string; value: string; ltr?: boolean }[]
  lines: { name: string; variant?: string; quantity: number; unitMinor?: string; totalMinor: string }[]
  currency: string
  totalMinor: string
  payments?: { label: string; amountMinor: string; reference?: string }[]
  qr?: string
  link?: string
  signatures?: boolean
  children?: ReactNode
}

const DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' })
const TIME = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })
const fa = (value: number) => value.toLocaleString('fa-IR')

/** Amount in Persian words for Iranian currencies (whole units); other currencies print figures only. */
export function amountInWords(minor: string, currency: string) {
  const code = currency.toUpperCase()
  try {
    if (code === 'IRT' || code === 'TMN') return `${persianWords(BigInt(minor))} تومان`
    if (code === 'IRR') return `${persianWords(BigInt(minor))} ریال`
  } catch { /* malformed amount: figures only */ }
  return ''
}

function Ids({ seller }: { seller: SaleDocumentSeller }) {
  const ids = [[seller.nationalId, 'شناسهٔ ملی'], [seller.economicCode, 'کد اقتصادی'], [seller.registrationNo, 'شمارهٔ ثبت']].filter(([value]) => value)
  if (!ids.length) return null
  return <p className="sr-seller-ids">{ids.map(([value, label]) => <span key={label}>{label} <bdi>{value}</bdi></span>)}</p>
}

export default function SaleReceiptDocument(props: SaleDocumentProps) {
  const { format, seller, title, number, createdAt, status, paid, parties, lines, currency, totalMinor, payments = [], qr, link, signatures = true, children } = props
  const money = (minor: string) => formatMoney(BigInt(minor || '0'), currency, 'fa-IR')
  const words = amountInWords(totalMinor, currency)
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const when = new Date(createdAt)
  const contact = [seller.phone && <span key="phone">تلفن <bdi dir="ltr">{seller.phone}</bdi></span>, seller.postalCode && <span key="postal">کد پستی <bdi>{seller.postalCode}</bdi></span>].filter(Boolean)

  if (format === 'roll') return <div className="sr-stage is-roll"><article className="sr-doc is-roll" dir="rtl" aria-label={`${title} ${number}`}>
    <header className="sr-roll-head">
      {seller.logo && <img src={seller.logo} alt="" />}
      <b>{seller.name}</b>
      {seller.address && <p>{seller.address}</p>}
      {contact.length > 0 && <p className="sr-seller-contact">{contact}</p>}
      <Ids seller={seller} />
    </header>
    <p className="sr-roll-title">{title}</p>
    <dl className="sr-roll-meta">
      <div><dt>شماره</dt><dd><bdi>{number}</bdi></dd></div>
      <div><dt>تاریخ</dt><dd>{DATE.format(when)} · {TIME.format(when)}</dd></div>
      {parties.filter((row) => row.value).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.ltr ? <bdi dir="ltr">{row.value}</bdi> : row.value}</dd></div>)}
      {status && <div><dt>وضعیت</dt><dd>{status.label}</dd></div>}
    </dl>
    <ol className="sr-roll-items">{lines.map((line, index) => <li key={`${index}:${line.name}`}>
      <span className="sr-roll-name">{line.name}{line.variant && <small>{line.variant}</small>}</span>
      <span className="sr-roll-calc"><span className="sr-num">{fa(line.quantity)}{line.unitMinor && <> × {money(line.unitMinor)}</>}</span><b className="sr-num">{money(line.totalMinor)}</b></span>
    </li>)}</ol>
    <dl className="sr-roll-total">
      <div className="sr-roll-grand"><dt>{paid ? 'پرداخت‌شده' : 'مبلغ فاکتور'}</dt><dd className="sr-num">{money(totalMinor)}</dd></div>
      {payments.map((row) => <div key={row.label}><dt>{row.label}{row.reference && <> · <bdi dir="ltr">{row.reference}</bdi></>}</dt><dd className="sr-num">{money(row.amountMinor)}</dd></div>)}
    </dl>
    {words && <p className="sr-words">{words}</p>}
    <div className="sr-roll-code"><Barcode value={number} /><bdi className="sr-num">{number}</bdi></div>
    {qr && <div className="sr-roll-qr"><img src={qr} width={120} height={120} alt="QR فاکتور و وضعیت سفارش" /><span>برای دیدن فاکتور و وضعیت سفارش اسکن کنید</span></div>}
    <p className="sr-thanks">از خرید شما سپاسگزاریم</p>
    {seller.note && <p className="sr-note">{seller.note}</p>}
    {children}
  </article></div>

  return <div className="sr-stage is-sheet"><article className="sr-doc is-sheet" dir="rtl" aria-label={`${title} ${number}`}>
    <header className="sr-head">
      <div className="sr-seller">
        {seller.logo && <img src={seller.logo} alt="" />}
        <div>
          <b className="sr-seller-name">{seller.name}</b>
          {seller.address && <p>{seller.address}</p>}
          {contact.length > 0 && <p className="sr-seller-contact">{contact}</p>}
          <Ids seller={seller} />
        </div>
      </div>
      <div className="sr-title">
        <h2>{title}</h2>
        <dl className="sr-id">
          <div><dt>شمارهٔ فاکتور</dt><dd><bdi className="sr-num">{number}</bdi></dd></div>
          <div><dt>تاریخ</dt><dd>{DATE.format(when)}</dd></div>
          <div><dt>ساعت</dt><dd className="sr-num">{TIME.format(when)}</dd></div>
        </dl>
        <div className="sr-barcode"><Barcode value={number} /></div>
      </div>
    </header>

    <dl className="sr-parties">
      {parties.filter((row) => row.value).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.ltr ? <bdi dir="ltr">{row.value}</bdi> : row.value}</dd></div>)}
      {status && <div><dt>وضعیت</dt><dd><span className={`sr-status is-${status.tone}`}>{status.label}</span></dd></div>}
    </dl>

    <table className="sr-items">
      <caption className="sr-sr">اقلام فاکتور</caption>
      <thead><tr><th scope="col" className="sr-col-n">ردیف</th><th scope="col">شرح کالا</th><th scope="col" className="sr-col-q">تعداد</th>{lines.some((line) => line.unitMinor) && <th scope="col" className="sr-col-m">مبلغ واحد</th>}<th scope="col" className="sr-col-m">مبلغ کل</th></tr></thead>
      <tbody>{lines.map((line, index) => <tr key={`${index}:${line.name}`}>
        <td className="sr-col-n sr-num">{fa(index + 1)}</td>
        <th scope="row">{line.name}{line.variant && <small>{line.variant}</small>}</th>
        <td className="sr-col-q sr-num">{fa(line.quantity)}</td>
        {lines.some((row) => row.unitMinor) && <td className="sr-col-m sr-num">{line.unitMinor ? money(line.unitMinor) : ''}</td>}
        <td className="sr-col-m sr-num">{money(line.totalMinor)}</td>
      </tr>)}</tbody>
    </table>

    <section className="sr-sum">
      <div className="sr-sum-side">
        {qr && <div className="sr-qr"><img src={qr} width={104} height={104} alt="QR فاکتور و وضعیت سفارش" /><p><b>فاکتور در گوشی شما</b><span>برای دیدن فاکتور و وضعیت سفارش، کد را با دوربین گوشی اسکن کنید.</span>{link && <a href={link}>مشاهدهٔ آنلاین</a>}</p></div>}
        {paid && <span className="sr-paid" aria-hidden="true">پرداخت شد<small>{DATE.format(when)}</small></span>}
        {seller.note && <p className="sr-note">{seller.note}</p>}
      </div>
      <div className="sr-totals">
        <dl>
          <div><dt>تعداد اقلام</dt><dd className="sr-num">{fa(lines.length)} ردیف · {fa(units)} عدد</dd></div>
          {payments.map((row) => <div key={row.label}><dt>{row.label}{row.reference && <small>پیگیری <bdi dir="ltr">{row.reference}</bdi></small>}</dt><dd className="sr-num">{money(row.amountMinor)}</dd></div>)}
        </dl>
        <div className="sr-grand"><span>{paid ? 'مبلغ پرداخت‌شده' : 'مبلغ فاکتور'}</span><b className="sr-num">{money(totalMinor)}</b></div>
        {words && <p className="sr-words">به حروف: {words}</p>}
      </div>
    </section>

    {signatures && <footer className="sr-sign">
      <div><span>مهر و امضای فروشنده</span>{seller.stamp && <img src={seller.stamp} alt="" />}</div>
      <div><span>امضای خریدار</span></div>
    </footer>}
    <p className="sr-thanks">از خرید شما سپاسگزاریم{seller.name ? ` — ${seller.name}` : ''}</p>
    {children}
  </article></div>
}
