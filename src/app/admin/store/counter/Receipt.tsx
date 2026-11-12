'use client'

import CardFace from '@/components/store/card/CardFace'
import { formatMoney } from '@/shared/money'
import type { CounterReceipt } from '@/modules/store/domain/counter-sales'

const date = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })

export default function Receipt({ receipt }: { receipt: CounterReceipt }) {
  const money = (value: string) => formatMoney(BigInt(value), receipt.currency, 'fa-IR')
  return <article className="counter-receipt" dir="rtl" aria-label="رسید فروش حضوری">
    <header><div>{receipt.brand.logo && <img src={receipt.brand.logo} alt="" />}<h2>{receipt.brand.title || 'فروشگاه'}</h2><p>رسید فروش حضوری <bdi>{receipt.invoiceNumber}</bdi></p></div><time dateTime={receipt.createdAt}>{date.format(new Date(receipt.createdAt))}</time></header>
    <dl className="counter-receipt-meta">
      <div><dt>مشتری</dt><dd>{receipt.customer}{receipt.phone && <bdi> · {receipt.phone}</bdi>}</dd></div>
      <div><dt>دریافت وجه</dt><dd>{receipt.method === 'CARD' ? 'کارت‌خوان' : 'نقدی'}{receipt.reference && <bdi> · {receipt.reference}</bdi>}</dd></div>
      {receipt.cashier && <div><dt>صندوق‌دار</dt><dd>{receipt.cashier}</dd></div>}
    </dl>
    <div className="counter-table-scroll"><table><caption>کالاهای تحویل‌شده</caption><thead><tr><th scope="col">کالا</th><th scope="col">تعداد</th><th scope="col">قیمت واحد</th><th scope="col">مبلغ</th></tr></thead>
      <tbody>{receipt.lines.map((line, index) => <tr key={index}><th scope="row">{line.name}{line.variant && <small>{line.variant}</small>}</th><td>{line.quantity.toLocaleString('fa-IR')}</td><td>{money(line.unitMinor)}</td><td>{money(line.totalMinor)}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row" colSpan={3}>جمع پرداخت‌شده</th><td>{money(receipt.totalMinor)}</td></tr></tfoot>
    </table></div>
    {receipt.cards.map((card, index) => <section className="counter-receipt-card" key={card.id} aria-label={`کارت ${(index + 1).toLocaleString('fa-IR')} ${card.product}`}>
      <CardFace design={card.template.design} brand={receipt.brand} product={card.product} items={card.items} shown tilt={false} animateSecrets={false} />
      {card.template.notices.length > 0 && <ul>{card.template.notices.map((notice, index) => <li key={index}>{notice.text}</li>)}</ul>}
      {card.template.note && <p>{card.template.note}</p>}
    </section>)}
  </article>
}
