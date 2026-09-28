'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Sale = { id: number; telegramUserId: string; status: string; retailPrice: number; currency: string; createdAt: string; reviewedAt: string | null; deliveredAt: string | null; lastError: string; offer: { nameFa: string; nameEn: string } }
type Report = { days: number; since: string; total: number; counts: Record<string, number>; fulfilled: { currency: string; count: number; amount: number }[]; oldestNeedsReview: { id: number; createdAt: string } | null; recent: Sale[] }
const statuses = ['AWAITING_RECEIPT', 'REVIEW', 'PROCESSING', 'PROVISIONING', 'DELIVERING', 'FULFILLED', 'REJECTED', 'CANCELLED', 'NEEDS_REVIEW']

export default function ResellerReportsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const l = (en: string, faText: string) => fa ? faText : en
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/reseller/reports?days=${days}`, { cache: 'no-store', signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not load'); setData(result); setError('') }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [days])
  const date = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US')
  const pending = (data?.counts.REVIEW || 0) + (data?.counts.NEEDS_REVIEW || 0)
  return <div className="space-y-6" dir={fa ? 'rtl' : 'ltr'}>
    <header className="card p-6 flex items-end justify-between gap-4 flex-wrap"><div><span className="text-xs uppercase tracking-wide muted">{l('AGENCY / REPORTS', 'نمایندگی / گزارش‌ها')}</span><h1 className="text-3xl font-bold mt-2">{l('Sales and order reports', 'گزارش فروش و سفارش‌ها')}</h1><p className="muted mt-2">{l('Track delivery, receipt review and confirmed retail sales in each currency.', 'تحویل سرویس، بررسی رسید و فروش نهایی را برای هر ارز جداگانه دنبال کنید.')}</p></div><label>{l('Period', 'بازه')}<select className="input mt-2" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>{l('Last 7 days', '۷ روز اخیر')}</option><option value={30}>{l('Last 30 days', '۳۰ روز اخیر')}</option><option value={90}>{l('Last 90 days', '۹۰ روز اخیر')}</option><option value={365}>{l('Last year', 'یک سال اخیر')}</option></select></label></header>
    {error && <p className="card p-4 text-red-400" role="alert">{error}</p>}
    {loading ? <p className="muted">{l('Loading…', 'در حال بارگذاری…')}</p> : data && <>
      <div className="grid md:grid-cols-3 gap-4"><div className="card p-5"><div className="muted text-sm">{l('All orders', 'همه سفارش‌ها')}</div><div className="text-3xl font-bold mt-2">{data.total}</div></div><div className="card p-5"><div className="muted text-sm">{l('Needs attention', 'نیازمند رسیدگی')}</div><div className="text-3xl font-bold mt-2">{pending}</div>{data.oldestNeedsReview && <p className="text-sm text-amber-400 mt-2">#{data.oldestNeedsReview.id} · {date(data.oldestNeedsReview.createdAt)}</p>}</div><div className="card p-5"><div className="muted text-sm">{l('Delivered', 'تحویل‌شده')}</div><div className="text-3xl font-bold mt-2">{data.counts.FULFILLED || 0}</div></div></div>
      <div className="grid md:grid-cols-2 gap-4"><section className="card p-6"><h2 className="h3 mb-4">{l('Confirmed retail sales', 'فروش نهایی تأییدشده')}</h2><p className="muted text-sm mb-4">{l('Only delivered orders are counted. Currencies are kept separate.', 'فقط سفارش‌های تحویل‌شده محاسبه شده‌اند. ارزها جدا نمایش داده می‌شوند.')}</p>{data.fulfilled.length ? <div className="space-y-3">{data.fulfilled.map(item => <div key={item.currency} className="rounded-xl border border-slate-700/70 p-4 flex justify-between gap-3"><span>{item.count} {l('orders', 'سفارش')}</span><strong dir="ltr">{item.amount.toLocaleString(fa ? 'fa-IR' : 'en-US')} {item.currency}</strong></div>)}</div> : <p className="muted">{l('No delivered orders in this period.', 'در این بازه سفارشی تحویل نشده است.')}</p>}</section><section className="card p-6"><h2 className="h3 mb-4">{l('Order pipeline', 'مراحل سفارش')}</h2><div className="space-y-2">{statuses.map(status => <div key={status} className="flex justify-between gap-4 border-b border-slate-700/50 py-2"><span className="text-sm">{status.replaceAll('_', ' ')}</span><strong>{data.counts[status] || 0}</strong></div>)}</div></section></div>
      <section className="card p-6"><div className="flex justify-between items-center gap-3 flex-wrap mb-4"><h2 className="h3">{l('Latest orders', 'آخرین سفارش‌ها')}</h2><Link href="/reseller/bot" className="text-sky-400">{l('Review receipts', 'بررسی رسیدها')}</Link></div>{data.recent.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>#</th><th>{l('Plan', 'پلن')}</th><th>{l('Customer', 'مشتری')}</th><th>{l('Card amount', 'مبلغ کارت')}</th><th>{l('Status', 'وضعیت')}</th><th>{l('Created', 'ثبت شده')}</th></tr></thead><tbody>{data.recent.map(sale => <tr key={sale.id}><td>#{sale.id}</td><td>{fa ? sale.offer.nameFa : sale.offer.nameEn}</td><td dir="ltr">{sale.telegramUserId}</td><td dir="ltr">{sale.retailPrice.toLocaleString(fa ? 'fa-IR' : 'en-US')} {sale.currency}</td><td><span className={`badge ${sale.status === 'FULFILLED' ? 'badge-green' : sale.status === 'NEEDS_REVIEW' ? 'badge-red' : 'badge-purple'}`}>{sale.status}</span>{sale.lastError && <p className="text-red-400 text-xs mt-1">{sale.lastError}</p>}</td><td className="text-sm">{date(sale.createdAt)}</td></tr>)}</tbody></table></div> : <p className="muted">{l('No orders in this period.', 'در این بازه سفارشی ثبت نشده است.')}</p>}</section>
    </>}
  </div>
}
