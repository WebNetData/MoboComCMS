'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { AI_PURPOSES } from '@/modules/ai/domain/routing'
import type { AiMonitoring } from '@/modules/ai/server/monitoring'
import styles from './page.module.css'
import UsagePanel from './UsagePanel'

type Report = Omit<AiMonitoring, 'recent'> & { recent: (Omit<AiMonitoring['recent'][number], 'startedAt'> & { startedAt: string })[] }
const number = (n: number | null | undefined) => n == null ? 'نامشخص' : Math.round(n).toLocaleString('fa-IR')
const status: Record<string, string> = { SUCCEEDED: 'پاسخ دریافت شد', FAILED: 'ناموفق', RUNNING: 'تکمیل ثبت نشده' }
const errors: Record<string, string> = { limit: 'سقف روزانهٔ کاربرد پر بود؛ درخواستی فرستاده نشد', auth: 'اعتبار کلید', quota: 'سهمیه', rate: 'محدودیت درخواست', unavailable: 'سرویس در دسترس نیست', request_failed: 'درخواست انجام نشد' }
const outcomes: Record<string, string> = { grounded: 'پاسخ با ارجاع', clarify: 'نیاز به توضیح یا همکار', source_changed: 'اطلاعات تغییر کرد', format_invalid: 'قالب پاسخ نامعتبر', superseded: 'پاسخ منتشر نشد' }

export default function AiMonitoringPage() {
  const [days, setDays] = useState('7'), [purpose, setPurpose] = useState(''), [revision, setRevision] = useState(0)
  const [data, setData] = useState<Report | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const response = await fetch(`/api/admin/ai/monitoring?${new URLSearchParams({ days, purpose })}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw Error(body?.error || 'گزارش دریافت نشد')
        if (!controller.signal.aborted) setData(body)
      } catch (e) { if (!controller.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : 'گزارش دریافت نشد') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); return () => controller.abort()
  }, [days, purpose, revision])
  return <div className={`sa sa-form ${styles.report}`} dir="rtl">
    <header><h1>پایش هوش مصنوعی</h1><p className="sa-sub">وضعیت درخواست‌ها، مصرف گزارش‌شده و کیفیت پاسخ‌های پشتیبانی</p><Link href="/admin/ai" className="btn btn-ghost">تنظیم سرویس‌ها</Link> <Link href="/admin/chat" className="btn btn-ghost">پشتیبانی آنلاین</Link></header>
    <div className={`sa-card ${styles.filters}`}>
      <label className="sa-field"><span>بازهٔ گزارش</span><select className="input" value={days} onChange={e => setDays(e.target.value)}>{[1, 7, 30].map(n => <option key={n} value={n}>{n.toLocaleString('fa-IR')} روز گذشته</option>)}</select></label>
      <label className="sa-field"><span>کاربرد</span><select className="input" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="">همهٔ کاربردها</option>{AI_PURPOSES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="general">عمومی</option></select></label>
      <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => setRevision(n => n + 1)}>تازه‌سازی گزارش</button>
    </div>
    <p className="sa-sub">فقط فراخوانی‌های سرور از زمان نصب این نسخه ثبت می‌شوند؛ متن گفتگو، کلید و اطلاعات حساب ذخیره نمی‌شوند. Chat وب در این آمار نیست. توکنِ گزارش‌نشده نامشخص است و هزینه یا سهمیهٔ حساب از آن حدس زده نمی‌شود. وضعیت تکمیل‌نشده می‌تواند مربوط به اجرای جاری یا قطع‌شدن پردازش باشد.</p>
    <UsagePanel key={`${days}:${revision}`} days={days} />
    {loading && <p role="status">در حال دریافت گزارش…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && data && <>
      <dl className={styles.metrics}>
        <div className="sa-card"><dt>درخواست‌ها</dt><dd>{number(data.total)}</dd></div>
        <div className="sa-card"><dt>ناموفق</dt><dd>{number(data.counts.FAILED || 0)}</dd></div>
        <div className="sa-card"><dt>توکن گزارش‌شده</dt><dd>{number(data.totals.totalTokens)}<small>{number(data.knownUsage)} از {number(data.total)} درخواست دارای آمار مصرف</small></dd></div>
        <div className="sa-card"><dt>میانگین زمان تکمیل</dt><dd>{data.totals.averageDurationMs == null ? 'نامشخص' : `${number(data.totals.averageDurationMs / 1000)} ثانیه`}</dd></div>
      </dl>
      {Object.keys(data.outcomes).length > 0 && <section className="sa-card"><h2>نتیجهٔ پاسخ‌های پشتیبانی</h2><dl className={styles.outcomes}>{Object.entries(data.outcomes).map(([key, n]) => <div key={key}><dt>{outcomes[key] || 'سایر'}</dt><dd>{number(n)}</dd></div>)}</dl></section>}
      <section aria-labelledby="ai-recent-title"><h2 id="ai-recent-title">آخرین درخواست‌ها</h2>{!data.recent.length ? <p className="sa-card">در این بازه درخواستی ثبت نشده است.</p> : <ol className={styles.requests}>{data.recent.map(row => <li key={row.id} className="sa-card">
        <div className={styles.row}><strong>{AI_PURPOSES.find(p => p.id === row.purpose)?.label || 'عمومی'}</strong><span>{status[row.status] || 'نامشخص'}</span></div>
        <p><bdi>{row.provider} · {row.model}</bdi> — {row.kind === 'image' ? 'تصویر' : 'متن'} / {row.transport === 'personal' ? 'حساب شخصی' : row.transport === 'cache' ? 'پاسخ از حافظه، بدون هزینه' : 'API'}</p>
        <dl className={styles.details}><div><dt>زمان</dt><dd><time dateTime={row.startedAt}>{new Date(row.startedAt).toLocaleString('fa-IR')}</time></dd></div><div><dt>مدت</dt><dd>{row.durationMs == null ? 'نامشخص' : `${number(row.durationMs / 1000)} ثانیه`}</dd></div><div><dt>تلاش‌ها</dt><dd>{number(row.attempts)}</dd></div><div><dt>توکن ورودی / خروجی / کل</dt><dd>{number(row.inputTokens)} / {number(row.outputTokens)} / {number(row.totalTokens)}</dd></div></dl>
        {row.errorKind && <p>{errors[row.errorKind] || 'درخواست انجام نشد'}{row.errorStatus ? ` (HTTP ${row.errorStatus})` : ''}</p>}{row.outcome && <p>{outcomes[row.outcome] || 'ثبت نتیجه'}</p>}
      </li>)}</ol>}</section>
    </>}
  </div>
}
