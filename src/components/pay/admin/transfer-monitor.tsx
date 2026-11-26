'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import type { TransferMonitor } from '@/modules/billing/domain/pay-transfer-operations'
import { api, money, date } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'
import o from './TransferOperations.module.css'

const n = (value: number) => value.toLocaleString('fa-IR')
const latency = (value: number | null) => value === null ? 'داده کافی نیست' : `${(value / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ثانیه`
export default function TransferMonitor() {
  const [data, setData] = useState<TransferMonitor | null>(null), [reload, setReload] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<TransferMonitor>('/api/admin/mobocom-pay/transfer-operations', { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت وضعیت انجام نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])
  return <section className={s.stack} aria-busy={loading}>
    <div className={`${s.sectionHead} ${o.heading}`}><div><h2>نبض دریافت‌های بانکی</h2><p className={s.muted}>بازهٔ آمار: ۲۴ ساعت اخیر · {data ? `ثبت نما: ${date(data.asOf)}` : 'در انتظار اطلاعات'}</p></div><button type="button" className={s.secondary} disabled={loading} onClick={() => setReload(v => v + 1)}>تازه‌سازی پایش</button></div>
    <ErrorNotice error={error} />
    {loading && <p role="status">در حال دریافت شاخص‌ها…</p>}
    {data && !error && !loading && <>
      <dl className={o.metrics}>
        <div><dt>پیام‌های دریافت‌شده</dt><dd>{n(data.totals.received)}</dd></div>
        <div><dt>پرداخت‌های تأییدشده</dt><dd>{n(data.totals.paid)}</dd></div>
        <div data-attention={data.totals.awaitingReview > 0}><dt>نیازمند بررسی</dt><dd>{n(data.totals.awaitingReview)}</dd></div>
        <div><dt>درخواست‌های با مهلت گذشته</dt><dd>{n(data.totals.overdue)}</dd></div>
      </dl>
      <div className={o.columns}>
        <section className={`${s.card} ${s.stack}`}><h3>زمان تأیید از دریافت پیام در منبع</h3><dl className={o.facts}><div><dt>میانه</dt><dd>{latency(data.totals.p50ConfirmationMs)}</dd></div><div><dt>صدک ۹۵</dt><dd>{latency(data.totals.p95ConfirmationMs)}</dd></div></dl><p className={s.muted}>فقط پیام‌های دارای زمان دریافت در منبع در محاسبه‌اند؛ پیامک سه‌فیلدی و تأیید دستی بدون پیام، زمان تحویل قابل اندازه‌گیری ندارند.</p></section>
        <section className={`${s.card} ${s.stack}`}><h3>صف رسیدگی</h3><p>{data.totals.oldestReviewAt ? `قدیمی‌ترین درخواست: ${date(data.totals.oldestReviewAt)}` : 'درخواستی در انتظار بررسی نیست.'}</p><Link href="/admin/mobocom-pay/reconciliation" className={s.button}>ورود به میز مغایرت‌ها</Link></section>
      </div>
<section className={`${s.card} ${s.stack}`}><h3>منابع پیامک بانکی</h3><p className={s.muted}>آمادگی از تنظیمات و دسترسی فعلی محاسبه می‌شود. «آخرین پیام» زمان آخرین دریافت ثبت‌شده را نشان می‌دهد.</p>
        <div className={o.sources}>{data.sources.map(source => <article key={source.id} className={o.source}><div className={s.row}><h4>{source.label}</h4><span className={s.badge}>{source.ready ? 'آمادهٔ دریافت' : 'نیازمند تنظیم'}</span></div><p className={s.muted}>{source.observed ? 'پیام در ۱۵ دقیقهٔ اخیر دریافت شده' : 'اتصال زنده نامشخص؛ ترافیک اخیر مشاهده نشده'}</p><dl className={o.facts}><div><dt>آخرین دریافت</dt><dd>{source.lastReceivedAt ? date(source.lastReceivedAt) : 'هنوز پیامی ثبت نشده'}</dd></div><div><dt>پیام / نامعتبر در ۲۴ ساعت</dt><dd>{n(source.notices)} / {n(source.rejected)}</dd></div><div><dt>تأخیر تحویل · صدک ۹۵</dt><dd>{latency(source.p95DeliveryMs)}</dd></div></dl></article>)}</div>
        <Link href="/admin/mobocom-pay/settings" className={s.secondary}>تنظیم منابع تأیید خودکار</Link>
      </section>
      <section className={`${s.card} ${s.stack}`}><h3>ظرفیت مبلغ‌های یکتا</h3><p className={s.muted}>۱۲ مبلغ پایهٔ اخیر؛ رزروها در تمام حساب‌ها دائمی‌اند. انقضا ظرفیت را آزاد نمی‌کند. هشدار از ۱۰٪ ظرفیت باقی‌مانده نمایش داده می‌شود.</p>
        {!data.pools.length && <p className={s.emptyState}>هنوز مبلغی رزرو نشده است.</p>}
        <div className={o.pools}>{data.pools.map(pool => <article className={o.source} key={pool.principalRial}><div className={s.row}><strong>{money(pool.principalRial)}</strong><span className={s.badge} data-state={pool.state}>{pool.state === 'EXHAUSTED' ? 'ظرفیت تمام شده' : pool.state === 'LOW' ? 'ظرفیت رو به اتمام' : 'ظرفیت در دسترس'}</span></div><meter className={o.meter} min={0} max={pool.capacity} low={Math.ceil(pool.capacity * .1)} optimum={pool.capacity} value={pool.remaining} aria-label={`ظرفیت باقی‌مانده برای ${money(pool.principalRial)}`} /><p>{n(pool.remaining)} مبلغ قابل صدور از {n(pool.capacity)} · {n(pool.occupied)} رزرو دائمی</p></article>)}</div>
      </section>
    </>}
  </section>
}
