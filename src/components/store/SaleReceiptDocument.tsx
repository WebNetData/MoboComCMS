import type { ReactNode } from 'react'
import Barcode from '@/components/store/Barcode'
import { formatMoney, minorToDecimal } from '@/shared/money'
import { iranianUnit } from '@/shared/money/format'
import { persianWords } from '@/modules/billing/domain/official-invoice'

/**
 * A printed sale document (app/sale-receipt.css, prefix sr-). One component for the counter receipt in Admin and the
 * customer's QR page, in two papers: an A4 invoice ("sheet") in the official invoice's ruled style, or an 80 mm thermal
 * roll ("roll"). Gift cards print inside the document, never on a page of their own. Callers decide what is private:
 * the public page passes no stamp, phone, payments or cards.
 */
export type SaleDocumentFormat = 'sheet' | 'roll'
export type SaleDocumentSeller = { name: string; logo: string; phone?: string; address?: string; postalCode?: string; economicCode?: string; nationalId?: string; registrationNo?: string; stamp?: string; note?: string; tagline?: string; website?: string }
export type SaleDocumentProps = {
  format: SaleDocumentFormat
  seller: SaleDocumentSeller
  title: string
  /** A short label beside the title, e.g. the sales channel. */
  badge?: string
  number: string
  createdAt: string
  status?: { label: string; tone: 'ok' | 'warn' | 'muted' }
  paid?: boolean
  parties: { label: string; value: string; ltr?: boolean; wide?: boolean }[]
  lines: { name: string; variant?: string; quantity: number; unitMinor?: string; totalMinor: string; deviceIdentifiers?: { serial: string; imei: string }[] }[]
  currency: string
  totalMinor: string
  discountMinor?: string
  shippingMinor?: string
  payments?: { label: string; amountMinor: string; reference?: string }[]
  qr?: string
  link?: string
  signatures?: boolean
  cards?: ReactNode
}

const DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
const LONG_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' })
const TIME = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })
const FA = '۰۱۲۳۴۵۶۷۸۹'
const fa = (value: number) => value.toLocaleString('fa-IR')
const faDigits = (value: string) => value.replace(/\d/g, (digit) => FA[Number(digit)])
const OTHER_UNITS: Record<string, string> = { USD: 'دلار', EUR: 'یورو', AED: 'درهم', TRY: 'لیر', GBP: 'پوند' }
const unitOf = (currency: string) => iranianUnit(currency, 'fa-IR') || OTHER_UNITS[currency.toUpperCase()] || currency.toUpperCase()

/** Amount in Persian words for Iranian currencies (whole units); other currencies print figures only. */
function amountInWords(minor: string, currency: string) {
  const code = currency.toUpperCase()
  try {
    if (code === 'IRT' || code === 'TMN') return `${persianWords(BigInt(minor))} تومان`
    if (code === 'IRR') return `${persianWords(BigInt(minor))} ریال`
  } catch { /* malformed amount: figures only */ }
  return ''
}

function Field({ label, value, ltr, wide }: { label: string; value?: string; ltr?: boolean; wide?: boolean }) {
  return <div className={`sr-field${wide ? ' is-wide' : ''}`}><span>{label}:</span><b dir={ltr ? 'ltr' : undefined}>{value || '—'}</b></div>
}

export default function SaleReceiptDocument(props: SaleDocumentProps) {
  const { format, seller, title, badge, number, createdAt, status, paid, parties, lines, currency, totalMinor, payments = [], qr, link, signatures = true, cards } = props
  const money = (minor: string) => formatMoney(BigInt(minor || '0'), currency, 'fa-IR')
  // Figures without the unit, the way the official invoice prints them; the unit is named once in the table heading.
  const plain = (minor: string) => { const [whole, fraction] = minorToDecimal(minor || '0', currency).split('.'); return `${BigInt(whole).toLocaleString('fa-IR')}${fraction ? `٫${faDigits(fraction)}` : ''}` }
  const words = amountInWords(totalMinor, currency)
  const adjustments = [{ label: 'تخفیف', amount: props.discountMinor || '0', subtract: true }, { label: 'ارسال', amount: props.shippingMinor || '0', subtract: false }].filter(row => /^\d+$/.test(row.amount) && BigInt(row.amount) > 0n)
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const when = new Date(createdAt)
  const ids = (value?: string) => value ? faDigits(value) : ''
  const contact = [seller.phone && <span key="phone">تلفن <bdi dir="ltr">{seller.phone}</bdi></span>, seller.postalCode && <span key="postal">کد پستی <bdi>{seller.postalCode}</bdi></span>].filter(Boolean)

  if (format === 'roll') return <div className="sr-stage is-roll"><article className="sr-doc is-roll" dir="rtl" aria-label={`${title} ${number}`}>
    <header className="sr-roll-head">
      {seller.logo ? <img src={seller.logo} alt="" /> : <span className="sr-mark" aria-hidden="true">{seller.name.trim().charAt(0)}</span>}
      <b>{seller.name}</b>
      {seller.tagline && <p className="sr-roll-tag">{seller.tagline}</p>}
      {seller.address && <p>{seller.address}</p>}
      {contact.length > 0 && <p className="sr-seller-contact">{contact}</p>}
      {seller.economicCode && <p>کد اقتصادی <bdi>{ids(seller.economicCode)}</bdi></p>}
    </header>
    <p className="sr-roll-title">{title}</p>
    <dl className="sr-roll-meta">
      <div><dt>شماره</dt><dd><bdi>{number}</bdi></dd></div>
      <div><dt>تاریخ</dt><dd>{DATE.format(when)} · {TIME.format(when)}</dd></div>
      {parties.filter((row) => row.value).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.ltr ? <bdi dir="ltr">{row.value}</bdi> : row.value}</dd></div>)}
      {status && <div><dt>وضعیت</dt><dd>{status.label}</dd></div>}
    </dl>
    <ol className="sr-roll-items">{lines.map((line, index) => <li key={`${index}:${line.name}`}>
      <span className="sr-roll-name">{line.name}{line.variant && <small>{line.variant}</small>}{line.deviceIdentifiers?.map((id, at) => <small dir="ltr" key={at}>{[id.serial && `Serial: ${id.serial}`, id.imei && `IMEI: ${id.imei}`].filter(Boolean).join(' · ')}</small>)}</span>
      <span className="sr-roll-calc"><span className="sr-num">{fa(line.quantity)}{line.unitMinor && <> × {money(line.unitMinor)}</>}</span><b className="sr-num">{money(line.totalMinor)}</b></span>
    </li>)}</ol>
    <dl className="sr-roll-total">
      {adjustments.map(row => <div key={row.label}><dt>{row.label}</dt><dd className="sr-num">{row.subtract ? '− ' : ''}{money(row.amount)}</dd></div>)}
      <div className="sr-roll-grand"><dt>{paid ? 'پرداخت‌شده' : 'مبلغ فاکتور'}</dt><dd className="sr-num">{money(totalMinor)}</dd></div>
      {payments.map((row) => <div key={row.label}><dt>{row.label}{row.reference && <> · <bdi dir="ltr">{row.reference}</bdi></>}</dt><dd className="sr-num">{money(row.amountMinor)}</dd></div>)}
    </dl>
    {words && <p className="sr-words">{words}</p>}
    {cards && <section className="sr-roll-cards" aria-label="کارت‌های تحویل‌شده">{cards}</section>}
    <div className="sr-roll-code"><Barcode value={number} /><bdi className="sr-num">{number}</bdi></div>
    {qr && <div className="sr-roll-qr"><img src={qr} width={116} height={116} alt="QR فاکتور و وضعیت سفارش" /><span>برای دیدن فاکتور و وضعیت سفارش اسکن کنید</span></div>}
    <p className="sr-thanks">از خرید شما سپاسگزاریم{seller.website && <bdi dir="ltr">{seller.website}</bdi>}</p>
    {seller.note && <p className="sr-note">{seller.note}</p>}
  </article></div>

  const hasUnit = lines.some((line) => line.unitMinor)
  const contactRows = ([['نشانی', seller.address, false], ['تلفن', seller.phone, true], ['وب‌سایت', seller.website, true], ['کد پستی', ids(seller.postalCode), false], ['کد اقتصادی', ids(seller.economicCode), false], ['شناسهٔ ملی', ids(seller.nationalId), false], ['شمارهٔ ثبت', ids(seller.registrationNo), false]] as [string, string | undefined, boolean][]).filter((row): row is [string, string, boolean] => !!row[1])
  return <div className="sr-stage is-sheet"><article className="sr-doc is-sheet" dir="rtl" aria-label={`${title} ${number}`}>
    {/* Letterhead: the shop on the right, the document on the left, contact details on a brand band underneath. */}
    <header className="sr-letterhead">
      <div className="sr-org">
        {seller.logo ? <img src={seller.logo} alt="" /> : <span className="sr-mark" aria-hidden="true">{seller.name.trim().charAt(0)}</span>}
        <div><b className="sr-org-name">{seller.name}</b>{seller.tagline && <p className="sr-org-tag">{seller.tagline}</p>}</div>
      </div>
      <div className="sr-docbox">
        <div className="sr-doctitle"><h2>{title}</h2>{badge && <span className="sr-badge">{badge}</span>}</div>
        <dl className="sr-ids">
          <div><dt>شماره</dt><dd dir="ltr">{number}</dd></div>
          <div><dt>تاریخ</dt><dd className="sr-num">{DATE.format(when)}</dd></div>
          <div><dt>ساعت</dt><dd className="sr-num">{TIME.format(when)}</dd></div>
        </dl>
        <div className="sr-barcode"><Barcode value={number} /></div>
        {status && <span className={`sr-status is-${status.tone}`}>{status.label}</span>}
      </div>
    </header>
    {contactRows.length > 0 ? <dl className="sr-contact">{contactRows.map(([label, value, ltr]) => <div key={label}><dt>{label}</dt><dd>{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd></div>)}</dl> : <div className="sr-contact is-empty" aria-hidden="true" />}

    <section className="sr-box">
      <h3>مشخصات خریدار و فروش</h3>
      <div className="sr-grid">{parties.map((row) => <Field key={row.label} label={row.label} value={row.value} ltr={row.ltr} wide={row.wide} />)}</div>
    </section>

    <section className="sr-box">
      <h3>شرح کالا و خدمات <small>(مبالغ به {unitOf(currency)})</small></h3>
      <table className="sr-items">
        <thead><tr><th className="sr-col-n">ردیف</th><th className="is-desc">شرح کالا یا خدمات</th><th className="sr-col-q">تعداد</th>{hasUnit && <th className="sr-col-m">مبلغ واحد</th>}<th className="sr-col-m">مبلغ کل</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={`${index}:${line.name}`}>
          <td className="sr-col-n">{fa(index + 1)}</td>
          <td className="is-desc"><b>{line.name}</b>{line.variant && <small>{line.variant}</small>}{line.deviceIdentifiers?.map((id, at) => <small dir="ltr" key={at}>{[id.serial && `Serial: ${id.serial}`, id.imei && `IMEI: ${id.imei}`].filter(Boolean).join(' · ')}</small>)}</td>
          <td className="sr-col-q">{fa(line.quantity)}</td>
          {hasUnit && <td className="sr-col-m">{line.unitMinor ? plain(line.unitMinor) : '—'}</td>}
          <td className="sr-col-m"><b>{plain(line.totalMinor)}</b></td>
        </tr>)}</tbody>
        <tfoot>{adjustments.map(row => <tr key={row.label}><td colSpan={hasUnit ? 4 : 3} className="is-label">{row.label}</td><td className="sr-col-m">{row.subtract ? '− ' : ''}{plain(row.amount)}</td></tr>)}<tr><td colSpan={2} className="is-label">جمع کل · {fa(lines.length)} ردیف</td><td className="sr-col-q">{fa(units)}</td>{hasUnit && <td />}<td className="sr-col-m">{plain(totalMinor)}</td></tr></tfoot>
      </table>
      <div className="sr-total-row">
        {words ? <p className="sr-words"><span>مبلغ به حروف:</span> <b>{words}</b></p> : <span />}
        <p className="sr-grand"><span>{paid ? 'مبلغ پرداخت‌شده' : 'مبلغ قابل پرداخت'}</span><b>{money(totalMinor)}</b></p>
      </div>
    </section>

    {cards && <section className="sr-box sr-cards-box">
      <h3>کارت‌ها و کدهای تحویل‌شده</h3>
      <div className="sr-cards">{cards}</div>
    </section>}

    <section className="sr-foot">
      <div className="sr-terms">
        {payments.length > 0 && <p><b>نحوهٔ پرداخت:</b> {payments.map((row, index) => <span key={row.label}>{index > 0 && '، '}{row.label} {money(row.amountMinor)}{row.reference && <> (پیگیری <bdi dir="ltr">{row.reference}</bdi>)</>}</span>)}</p>}
        {paid && <p><b>وضعیت:</b> پرداخت‌شده در {LONG_DATE.format(when)} ساعت {TIME.format(when)}</p>}
        {seller.note && <p className="sr-note">{seller.note}</p>}
        {qr && <div className="sr-qr"><img src={qr} width={92} height={92} alt="QR فاکتور و وضعیت سفارش" /><p><b>فاکتور در گوشی شما</b>کد را با دوربین گوشی اسکن کنید تا فاکتور و وضعیت سفارش را ببینید.{link && <a href={link}>مشاهدهٔ آنلاین</a>}</p></div>}
      </div>
      {signatures ? <div className="sr-sign">
        <div><span>مهر و امضای فروشنده</span>{seller.stamp && <img src={seller.stamp} alt="مهر فروشنده" />}{paid && <i className="sr-paid" aria-hidden="true">پرداخت شد<small>{DATE.format(when)}</small></i>}</div>
        <div><span>امضای خریدار</span></div>
      </div> : <div className="sr-sign is-single"><div>{paid && <i className="sr-paid" aria-hidden="true">پرداخت شد<small>{DATE.format(when)}</small></i>}</div></div>}
    </section>
    <footer className="sr-docfoot"><span>از خرید شما سپاسگزاریم</span>{seller.website && <bdi dir="ltr">{seller.website}</bdi>}{seller.phone && <bdi dir="ltr">{seller.phone}</bdi>}</footer>
  </article></div>
}
