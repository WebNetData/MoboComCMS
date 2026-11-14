'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { formatMoney } from '@/shared/money'

export type ExchangeContext = { returnId: number; orderId: number; customerId: number | null; customerName: string; customerPhone: string; currency: string; refundMinor: string; replacementOrderId: number | null }
export default function ExchangePanel({ returnId, total, currency, onLoaded }: { returnId: number; total: bigint; currency: string; onLoaded: (value: ExchangeContext) => void }) {
  const [data, setData] = useState<ExchangeContext | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const response = await fetch(`/api/admin/store/returns/${returnId}`, { cache: 'no-store', signal: controller.signal }), body = await response.json()
        if (!response.ok || !body.exchange) throw Error(body?.error || 'مرجوعی بازپرداخت‌شده برای تعویض پیدا نشد')
        if (!controller.signal.aborted) { setData(body.exchange); onLoaded(body.exchange) }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'دریافت مرجوعی ممکن نشد') }
    })()
    return () => controller.abort()
  }, [returnId, onLoaded])
  const refund = data ? BigInt(data.refundMinor) : 0n, difference = total - refund
  return <section className="sa-card" aria-label="تعویض کالا">
    <header className="sa-card-head"><h2>فروش کالای جایگزین</h2><Link className="sa-link" href={`/admin/store/returns/${returnId}`}>سند مرجوعی</Link></header>
    {error && <p role="alert" className="cd-error">{error}</p>}
    {!data && !error && <p role="status">در حال دریافت مرجوعی…</p>}
    {data && <>
      <p>مرجوعی سفارش {data.orderId.toLocaleString('fa-IR')} · مشتری: {data.customerName || 'مهمان'}</p>
      <dl className="sa-kv"><div><dt>بازپرداخت ثبت‌شده</dt><dd>{formatMoney(refund, data.currency, 'fa-IR')}</dd></div><div><dt>فاکتور جدید</dt><dd>{currency ? formatMoney(total, currency, 'fa-IR') : 'پس از انتخاب کالا'}</dd></div>{currency === data.currency && <div><dt>{difference >= 0n ? 'دریافت خالص در مجموع دو سند' : 'بازپرداخت خالص در مجموع دو سند'}</dt><dd>{formatMoney(difference < 0n ? -difference : difference, currency, 'fa-IR')}</dd></div>}</dl>
      <p className="sa-hint">بازپرداخت در سند قبلی ثبت شده است. در این فروش، کل مبلغ فاکتور جدید را دریافت کنید؛ هر دو سند و ارتباط آن‌ها باقی می‌مانند.</p>
      {data.replacementOrderId && <p role="alert">قبلاً به <Link className="sa-link" href={`/admin/store/orders/${data.replacementOrderId}`}>فروش جایگزین ثبت‌شده</Link> متصل شده است.</p>}
      {currency && currency !== data.currency && <p className="cd-error" role="alert">واحد پول کالای جایگزین باید با مرجوعی یکسان باشد</p>}
    </>}
    <Link className="sa-link" href="/admin/store/counter">رفتن به فروش عادی</Link>
  </section>
}
