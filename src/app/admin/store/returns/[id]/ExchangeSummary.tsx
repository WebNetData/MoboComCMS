import Link from '@/components/AppLink'
import { formatMoney } from '@/shared/money'
export default function ExchangeSummary({ data, currency }: { currency: string; data: { refundMinor: string; replacementTotalMinor: string | null; replacementInvoice: string; replacementLines: { name: string; variantName: string; quantity: number }[] } }) {
  if (!data.replacementTotalMinor) return null
  const refund = BigInt(data.refundMinor), total = BigInt(data.replacementTotalMinor), difference = total - refund
  return <div><ul>{data.replacementLines.map((line, index) => <li key={index}>{line.name}{line.variantName ? ` · ${line.variantName}` : ''} · {line.quantity.toLocaleString('fa-IR')} عدد</li>)}</ul><dl className="sa-kv"><div><dt>بازپرداخت سند مرجوعی</dt><dd>{formatMoney(refund, currency, 'fa-IR')}</dd></div><div><dt>مبلغ فاکتور جایگزین</dt><dd>{formatMoney(total, currency, 'fa-IR')}</dd></div><div><dt>{difference >= 0n ? 'دریافت خالص مجموع دو سند' : 'بازپرداخت خالص مجموع دو سند'}</dt><dd>{formatMoney(difference < 0n ? -difference : difference, currency, 'fa-IR')}</dd></div></dl>{data.replacementInvoice && <Link className="sa-link" href={`/invoice/${encodeURIComponent(data.replacementInvoice)}`}>فاکتور فروش جایگزین</Link>}</div>
}
