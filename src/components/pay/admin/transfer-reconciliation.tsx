'use client'
import { useEffect, useState } from 'react'
import type { TransferReviewQueue, TransferQueueStage } from '@/modules/billing/domain/pay-transfer-operations'
import Link from '@/components/AppLink'
import { useSearchParams } from '@/platform/routing/navigation'
import { api, money, date } from '../client'
import { ErrorNotice, Field } from '../shared'
import TransferReviewCase from './transfer-review-case'
import s from '../Pay.module.css'
import o from './TransferOperations.module.css'

const stageLabels: Record<TransferQueueStage, string> = {
  WAITING_RECEIPT: 'منتظر رسید مشتری', WAITING_SMS: 'رسید ثبت شده · منتظر پیامک', REVIEW: 'نیازمند بررسی دستی',
}

export default function TransferReconciliation() {
  const smsSource = useSearchParams().get('smsSource') ?? ''
  return <ReviewQueue key={smsSource} smsSource={smsSource} />
}

function ReviewQueue({ smsSource }: { smsSource: string }) {
  const [data, setData] = useState<TransferReviewQueue | null>(null), [page, setPage] = useState(1), [closed, setClosed] = useState(false), [reload, setReload] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ id: string; kind: 'id' | 'collection' } | null>(null)
  const [receiptsPage, setReceiptsPage] = useState(1)
  const [stage, setStage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const query = new URLSearchParams({ page: String(page), closed: String(closed), receiptsPage: String(receiptsPage), stage })
    if (smsSource) query.set('smsSource', smsSource)
    api<TransferReviewQueue>(`/api/admin/mobocom-pay/transfer-reviews?${query}`, { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت صف انجام نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, closed, receiptsPage, stage, reload, smsSource])
  return <section className={s.stack}>
    <div className={`${s.sectionHead} ${o.heading}`}><div><h2>میز بررسی واریزها</h2><p className={s.muted}>واریز دیرهنگام، مبلغ نابرابر و رسیدهای در انتظار را با سابقهٔ تصمیم‌ها بررسی کنید.</p></div><button type="button" className={s.secondary} disabled={loading} onClick={() => setReload(n => n + 1)}>تازه‌سازی صف بررسی</button></div>
    <p className={s.notice}>برابری یا نزدیکی مبلغ، هویت پرداخت‌کننده را ثابت نمی‌کند. برای مبلغ کمتر یا بیشتر، نتیجهٔ رسیدگی را ثبت کنید؛ تأیید مالی فقط برای مدرک مجاز با مبلغ دقیق انجام می‌شود.</p>
    <ErrorNotice error={error} />
    {smsSource && <div className={s.notice}>
      {data?.smsSource && <p>رسیدهای در انتظار که به منبع «{data.smsSource.label}» وابسته‌اند. وضعیت سایر منابع و مدرک وصول را پیش از تأیید دستی بررسی کنید.</p>}
      <Link href="/admin/mobocom-pay/reconciliation" className={s.secondary}>نمایش همهٔ منابع</Link>
    </div>}
    <div className={o.columns}>
      <label className={s.check}><input type="checkbox" checked={closed} onChange={e => { setClosed(e.target.checked); setPage(1) }} />نمایش شواهد بانکی بسته‌شده</label>
      <Field label="مرحلهٔ پیگیری پرداخت"><select value={stage} onChange={e => { setStage(e.target.value); setReceiptsPage(1); setSelected(null) }}><option value="">همهٔ مراحل</option>{Object.entries(stageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    </div>
    {loading && <p role="status">در حال دریافت صف بررسی…</p>}
    {data && !loading && !error && <div className={o.columns}>
      <section className={`${s.card} ${s.stack}`} aria-label="شواهد واریز"><h3>{closed ? 'بررسی‌های بسته‌شده' : 'پیام‌های نیازمند رسیدگی'} · {data.total.toLocaleString('fa-IR')}</h3>
        {!data.items.length && <p className={s.emptyState}>موردی در این فهرست نیست.</p>}
        {data.items.map(item => <button key={item.id} className={`${s.secondary} ${o.selection}`} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelected({ id: item.id, kind: 'id' })}><strong>{money(item.amountRial)}</strong><span className={s.tableSub}>{item.source === 'SMS' ? 'پیامک' : 'بله'} · {date(item.receivedAt)}</span><span className={s.tableSub}>{item.invoiceNumber || 'فاکتور مشخص نشده'} · {item.status === 'CONFIRMED' ? 'تأییدشده' : item.status === 'DISMISSED' ? 'بررسی بسته‌شده' : item.reason === 'LATE_TRANSFER' ? 'واریز پس از مهلت' : 'نیازمند بررسی'}</span></button>)}
        <nav className={s.row} aria-label="صفحه‌های شواهد واریز"><button type="button" className={s.secondary} disabled={page <= 1} onClick={() => setPage(n => n - 1)}>جدیدتر</button><span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span><button type="button" className={s.secondary} disabled={page >= data.pages} onClick={() => setPage(n => n + 1)}>قدیمی‌تر</button></nav>
      </section>
      <section className={`${s.card} ${s.stack}`} aria-label="صف پیگیری پرداخت‌ها"><h3>صف پیگیری پرداخت‌ها</h3><p className={s.muted}>{data.receiptsTotal.toLocaleString('fa-IR')} درخواست، از قدیمی‌تر به جدیدتر. برای بررسی دستی می‌توانید پروندهٔ دارای رسید را همین‌جا باز کنید.</p>
        {!data.receipts.length && <p className={s.emptyState}>درخواست متوقفی ثبت نشده است.</p>}
        {data.receipts.map(item => <button key={item.id} type="button" className={`${s.secondary} ${o.selection}`} aria-pressed={selected?.id === item.id} onClick={() => setSelected({ id: item.id, kind: 'collection' })}>
          <strong><bdi>{item.invoiceNumber}</bdi> · {money(item.totalRial)}</strong>
          <span className={s.tableSub}>{stageLabels[item.stage]} · {date(item.createdAt)}</span>
        </button>)}
        <Link href="/admin/mobocom-pay/receipts" className={s.secondary}>بررسی رسیدهای بدون پروندهٔ واریز</Link>
        <nav className={s.row} aria-label="صفحه‌های درخواست‌های بررسی"><button type="button" className={s.secondary} disabled={receiptsPage <= 1} onClick={() => setReceiptsPage(n => n - 1)}>قدیمی‌تر</button><span>{data.receiptsPage.toLocaleString('fa-IR')} از {data.receiptsPages.toLocaleString('fa-IR')}</span><button type="button" className={s.secondary} disabled={receiptsPage >= data.receiptsPages} onClick={() => setReceiptsPage(n => n + 1)}>جدیدتر</button></nav>
      </section>
    </div>}
    {selected && <TransferReviewCase key={`${selected.kind}:${selected.id}`} selected={selected} onDecided={() => setReload(n => n + 1)} />}
  </section>
}
