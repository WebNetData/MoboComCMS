'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import type { TransferMonitor, TransferSourceHealth } from '@/modules/billing/domain/pay-transfer-operations'
import { api, money, date } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'
import o from './TransferOperations.module.css'
import DeskHeader from './desk-header'

const n = (value: number) => value.toLocaleString('fa-IR')
const latency = (value: number | null) => value === null ? 'داده کافی نیست' : `${(value / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ثانیه`
const healthLabels: Record<TransferSourceHealth['health'], string> = {
  NOT_READY: 'منبع آماده نیست',
  RECENT_VALID: 'پیام معتبر اخیر',
  REJECTIONS: 'رد پیام در دریافت اخیر',
  SILENT_BACKLOG: 'احتمال اختلال در دریافت',
  UNKNOWN: 'اتصال زنده نامشخص',
}
const rejectionLabels: Record<string, string> = {
  INVALID_CONFIG: 'الگوی نامعتبر',
  INVALID_MESSAGE: 'پیام نامعتبر',
  NO_UNIQUE_MATCH: 'عدم تطابق با الگوی پیامک',
  INVALID_AMOUNT: 'مبلغ نامعتبر',
  ACCOUNT_MISMATCH: 'شمارهٔ حساب نامعتبر یا مشترک',
}

function SmsSourceCard({ source }: { source: TransferSourceHealth }) {
  return <article className={o.source}>
    <div className={s.row}><h4>{source.label}</h4><span className={s.badge}>{healthLabels[source.health]}</span></div>
    <dl className={o.facts}>
      <div><dt>آخرین پیام معتبر</dt><dd>{source.lastValidAt ? date(source.lastValidAt) : 'هنوز ثبت نشده'}</dd></div>
      <div><dt>آخرین دریافت ثبت‌شده</dt><dd>{source.lastReceivedAt ? date(source.lastReceivedAt) : 'هنوز پیامی ثبت نشده'}</dd></div>
      <div><dt>دریافت / رد در ۲۴ ساعت</dt><dd>{n(source.notices)} / {n(source.rejected)}</dd></div>
      <div><dt>تأخیر تحویل · صدک ۹۵</dt><dd>{latency(source.p95DeliveryMs)}</dd></div>
    </dl>
    {source.reasons.length > 0 && <ul aria-label="علت‌های رد پیام در ۲۴ ساعت">
      {source.reasons.map(({ code, count }) => <li key={code}>{rejectionLabels[code.replace(/^SMS_FORWARDER_/, '')] ?? 'خطای ثبت‌شده'} · {n(count)}</li>)}
    </ul>}
    {source.affected > 0 && <Link href={`/admin/mobocom-pay/reconciliation?smsSource=${encodeURIComponent(source.id)}`} className={s.secondary}>
      بررسی دستی رسیدهای وابسته ({n(source.affected)})
    </Link>}
  </article>
}

export default function TransferMonitor() {
  const [data, setData] = useState<TransferMonitor | null>(null), [reload, setReload] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<TransferMonitor>('/api/admin/mobocom-pay/transfer-operations', { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت وضعیت انجام نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])
  return <section className={s.stack} aria-busy={loading}>
    <DeskHeader icon="activity" title="وضعیت دریافت‌های بانکی" description={<>۲۴ ساعت اخیر · {data ? `آخرین بازخوانی ${date(data.asOf)}` : 'در انتظار اطلاعات'}</>}>
      <button type="button" className={s.secondary} disabled={loading} onClick={() => setReload(v => v + 1)}>تازه‌سازی پایش</button>
    </DeskHeader>
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
        <section className={`${s.card} ${s.stack}`}><h3>صف رسیدگی</h3><p>{data.totals.oldestReviewAt ? `قدیمی‌ترین مغایرت: ${date(data.totals.oldestReviewAt)}` : 'مغایرت بازی برای بررسی وجود ندارد.'}</p>
          {data.receiptBacklog.count > 0 && <div className={s.notice}>
            <strong>{n(data.receiptBacklog.count)} رسید دست‌کم {n(data.receiptBacklog.olderThanMinutes)} دقیقه در انتظار بررسی است.</strong>
            {data.receiptBacklog.oldestAt && <p className={s.muted}>قدیمی‌ترین رسید {date(data.receiptBacklog.oldestAt)}</p>}
          </div>}
          <div className={s.actions}><Link href="/admin/mobocom-pay/receipts" className={s.button}>بررسی رسیدها</Link><Link href="/admin/mobocom-pay/reconciliation" className={s.secondary}>میز مغایرت‌ها</Link></div>
        </section>
      </div>
      <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-sms-health-title">
        <h3 id="pay-sms-health-title">منابع پیامک بانکی</h3>
        <p className={s.muted}>احتمال اختلال زمانی نمایش داده می‌شود که ۱۵ دقیقه پیام معتبری ثبت نشده و رسید وابسته در انتظار مانده باشد. آمار مربوط به تنظیمات فعلی هر منبع است.</p>
        {!data.sources.length && <p className={s.emptyState}>منبع پیامکی ثبت نشده است.</p>}
        <div className={o.sources}>{data.sources.map(source => <SmsSourceCard key={source.id} source={source} />)}</div>
        <Link href="/admin/mobocom-pay/settings" className={s.secondary}>تنظیم منابع تأیید خودکار</Link>
      </section>
      <section className={`${s.card} ${s.stack}`}><h3>ظرفیت مبلغ‌های یکتا</h3><p className={s.muted}>۱۲ مبلغ پایهٔ اخیر؛ رزروها در تمام حساب‌ها دائمی‌اند. انقضا ظرفیت را آزاد نمی‌کند. هشدار از ۱۰٪ ظرفیت باقی‌مانده نمایش داده می‌شود.</p>
        {!data.pools.length && <p className={s.emptyState}>هنوز مبلغی رزرو نشده است.</p>}
        <div className={o.pools}>{data.pools.map(pool => <article className={o.source} key={pool.principalRial}><div className={s.row}><strong>{money(pool.principalRial)}</strong><span className={s.badge} data-state={pool.state}>{pool.state === 'EXHAUSTED' ? 'ظرفیت تمام شده' : pool.state === 'LOW' ? 'ظرفیت رو به اتمام' : 'ظرفیت در دسترس'}</span></div><meter className={o.meter} min={0} max={pool.capacity} low={Math.ceil(pool.capacity * .1)} optimum={pool.capacity} value={pool.remaining} aria-label={`ظرفیت باقی‌مانده برای ${money(pool.principalRial)}`} /><p>{n(pool.remaining)} مبلغ قابل صدور از {n(pool.capacity)} · {n(pool.occupied)} رزرو دائمی</p></article>)}</div>
      </section>
    </>}
  </section>
}
