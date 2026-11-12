import type { Receipt } from '@/modules/forms/domain/forms'

const DAY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })
const fa = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false })

/** A lock pattern as the 3×3 grid it was drawn on, with its start marked. */
function Pattern({ dots }: { dots: number[] }) {
  const at = (dot: number) => ({ x: ((dot - 1) % 3) * 30 + 15, y: Math.floor((dot - 1) / 3) * 30 + 15 })
  return <svg className="rc-pattern" viewBox="0 0 90 90" role="img" aria-label={`الگو: ${dots.join('-')}`}>
    {dots.slice(1).map((dot, index) => { const a = at(dots[index]), b = at(dot); return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => { const p = at(dot), order = dots.indexOf(dot); return <g key={dot}><circle cx={p.x} cy={p.y} r={order === 0 ? 6 : 4} className={order >= 0 ? 'is-on' : ''} />{order >= 0 && <text x={p.x + 7} y={p.y - 6}>{order + 1}</text>}</g> })}
  </svg>
}

/**
 * A printed receipt of work taken in at the counter (forms/server/counter). The customer's copy: what they handed over,
 * the terms, the pickup code without which the device is not returned, and room for the shop's stamp and signature.
 * The shop's copy: every answer and the device lock, and room for the customer's signature under the terms.
 */
export default function ReceiptSheet({ receipt }: { receipt: Receipt }) {
  const customer = receipt.copy === 'customer'
  return <article className={`rc-sheet is-${receipt.copy}`} dir="rtl">
    <header className="rc-head">
      <div className="rc-brand">{receipt.brand.logo && <img src={receipt.brand.logo} alt="" />}<b>{receipt.brand.title}</b></div>
      <div className="rc-title"><h1>{receipt.title}</h1><span className="rc-copy">{customer ? 'نسخهٔ مشتری' : 'نسخهٔ مغازه — محرمانه'}</span></div>
      <div className="rc-number"><small>شمارهٔ پذیرش</small><b>{fa(receipt.number)}</b></div>
    </header>
    <dl className="rc-meta">
      <div><dt>تاریخ پذیرش</dt><dd>{DAY.format(new Date(receipt.receivedAt || receipt.createdAt))}</dd></div>
      {receipt.stage && <div><dt>وضعیت</dt><dd>{receipt.stage}</dd></div>}
      {receipt.staff && <div><dt>پذیرش‌کننده</dt><dd>{receipt.staff}</dd></div>}
      <div><dt>نوع ثبت</dt><dd>{receipt.source === 'STAFF' ? 'حضوری' : 'آنلاین'}</dd></div>
    </dl>
    <dl className="rc-lines">{receipt.lines.map((line, index) => <div key={index}><dt>{line.label}</dt><dd dir="auto">{line.value}</dd></div>)}</dl>
    {!customer && receipt.secrets.length > 0 && <section className="rc-secret" aria-label="اطلاعات محرمانه">
      <b>اطلاعات محرمانه (فقط برای تعمیرکار)</b>
      {receipt.secrets.map((line, index) => <div key={index} className="rc-secret-row"><span>{line.label}</span><code dir="auto">{line.value}</code>{line.pattern && line.pattern.length > 0 && <Pattern dots={line.pattern} />}</div>)}
    </section>}
    {customer && receipt.pickupCode && <section className="rc-code">
      <div><small>کد تحویل دستگاه</small><b dir="ltr">{receipt.pickupCode}</b></div>
      <p>دستگاه فقط با ارائهٔ همین رسید و کد تحویل بازگردانده می‌شود. این کد را به کسی جز تحویل‌گیرندهٔ دستگاه ندهید.</p>
    </section>}
    {customer&&receipt.qr&&<section className="rc-code"><img src={receipt.qr} width={110} height={110} alt="QR پیگیری وضعیت تعمیر"/><p>برای دیدن وضعیت تعمیر با گوشی اسکن کنید. {receipt.link&&<a href={receipt.link}>پیگیری وضعیت</a>}</p></section>}
    {receipt.terms.length > 0 && <section className="rc-terms"><b>قوانین و شرایط</b><ol>{receipt.terms.map((term, index) => <li key={index}>{term.replace(/^[۰-۹\d]+[.)-]\s*/, '')}</li>)}</ol></section>}
    <footer className="rc-sign">
      {customer ? <>
        <div><span>مهر و امضای {receipt.brand.title || 'فروشگاه'}</span></div>
        <div><span>امضای مشتری</span></div>
      </> : <>
        <div><span>امضای مشتری: اطلاعات بالا و قوانین را خواندم و می‌پذیرم</span></div>
        <div><span>امضای پذیرش‌کننده</span></div>
      </>}
    </footer>
  </article>
}
