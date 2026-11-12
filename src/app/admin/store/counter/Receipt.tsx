'use client'

import CardFace from '@/components/store/card/CardFace'
import SaleReceiptDocument, { type SaleDocumentFormat } from '@/components/store/SaleReceiptDocument'
import type { CounterReceipt } from '@/modules/store/domain/counter-sales'
import { displayMobile } from '@/modules/sms/domain/sms'
import '@/app/sale-receipt.css'

const METHOD: Record<string, string> = { SPLIT: 'ترکیبی', WALLET: 'کیف پول', CARD: 'کارت‌خوان', CASH: 'نقدی' }
const TENDER: Record<string, string> = { CASH: 'نقد', CARD: 'کارت‌خوان', WALLET: 'کیف پول' }

/** The persisted counter sale as a printable document; assigned gift-card codes print inside it, one card each. */
export default function Receipt({ receipt, format }: { receipt: CounterReceipt; format: SaleDocumentFormat }) {
  const seller = receipt.seller ? { ...receipt.seller, name: receipt.seller.name || receipt.brand.title || 'فروشگاه', logo: receipt.seller.logo || receipt.brand.logo } : { name: receipt.brand.title || 'فروشگاه', logo: receipt.brand.logo }
  const payments = receipt.payments?.length ? receipt.payments.map((row) => ({ label: TENDER[row.method] || row.method, amountMinor: row.amountMinor, reference: row.reference })) : [{ label: METHOD[receipt.method] || 'نقدی', amountMinor: receipt.totalMinor, reference: receipt.reference }]
  const cards = receipt.cards.length ? receipt.cards.map((card, index) => <section className="counter-receipt-card" key={card.id} aria-label={`کارت ${(index + 1).toLocaleString('fa-IR')} ${card.product}`}>
    <CardFace design={card.template.design} brand={receipt.brand} product={card.product} items={card.items} shown tilt={false} animateSecrets={false} />
    {card.template.notices.length > 0 && <ul>{card.template.notices.map((notice, at) => <li key={at}>{notice.text}</li>)}</ul>}
    {card.template.note && <p>{card.template.note}</p>}
  </section>) : null
  return <SaleReceiptDocument
    format={format}
    seller={seller}
    title="فاکتور فروش حضوری"
    number={receipt.invoiceNumber}
    createdAt={receipt.createdAt}
    paid
    parties={[
      { label: 'نام خریدار', value: receipt.customer },
      { label: 'موبایل', value: receipt.phone ? displayMobile(receipt.phone) || receipt.phone : '', ltr: true },
      { label: 'شمارهٔ سفارش', value: receipt.orderId.toLocaleString('fa-IR', { useGrouping: false }) },
      { label: 'روش پرداخت', value: METHOD[receipt.method] || 'نقدی' },
      { label: 'صندوق', value: receipt.register || '' },
      { label: 'صندوق‌دار', value: receipt.cashier },
    ]}
    lines={receipt.lines.map((line) => ({ name: line.name, variant: line.variant, quantity: line.quantity, unitMinor: line.unitMinor, totalMinor: line.totalMinor }))}
    currency={receipt.currency}
    totalMinor={receipt.totalMinor}
    payments={payments}
    qr={receipt.qr}
    link={receipt.link}
    signatures={format === 'sheet'}
    cards={cards}
  />
}
