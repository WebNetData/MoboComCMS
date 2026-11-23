'use client'
import { useState } from 'react'
import type { SolutionPlan } from '@/modules/packages/domain/solution-plan'
import type { SolutionApplyReceipt } from '@/modules/packages/domain/solution-receipt'

type Props = { id: string; receipt?: SolutionApplyReceipt; onApplied: () => void }

export default function SolutionPackPanel({ id, receipt, onApplied }: Props) {
  const [plan, setPlan] = useState<SolutionPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function preview() {
    setBusy(true); setError(''); setConfirmed(false); setStale(false); setPlan(null); setSaved(false)
    try {
      const response = await fetch(`/api/admin/packages/${id}/solution`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'پیش‌نمایش دریافت نشد.')
      setPlan(data.plan)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'پیش‌نمایش دریافت نشد.') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!plan || !confirmed || stale || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/packages/${id}/solution`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: plan.token }) })
      const data = await response.json()
      if (!response.ok) { setStale(true); throw new Error(data.error || 'اعمال پیکربندی ناموفق بود؛ پیش‌نمایش را تازه کنید.') }
      setPlan({ ...plan, applied: true, receipt: data.receipt }); setSaved(true); setConfirmed(false); onApplied()
    } catch (cause) { setStale(true); setError(cause instanceof Error ? cause.message : 'ارتباط قطع شد؛ پیش‌نمایش را تازه کنید تا نتیجه مشخص شود.') }
    finally { setBusy(false) }
  }
  const applied = saved || plan?.applied
  return <section className="pm-solution" aria-label="پیکربندی بستهٔ راه‌اندازی" aria-busy={busy}>
    <div className="pm-solution-heading"><strong>بستهٔ راه‌اندازی · Solution Pack</strong><span>{receipt ? 'دارای سابقهٔ اعمال' : 'نیازمند بررسی و تأیید'}</span></div>
    <p>ماژول‌های مشخص‌شده فعال می‌شوند؛ پیش‌فرض‌ها فقط جای تنظیمات ذخیره‌نشده را می‌گیرند. نصب بسته به‌تنهایی پیکربندی را تغییر نمی‌دهد.</p>
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void preview()} aria-controls={`solution-plan-${id}`} aria-expanded={!!plan}>{busy ? 'در حال بررسی…' : plan ? 'تازه‌کردن پیش‌نمایش' : 'بررسی پیکربندی'}</button>
    {error && <p role="alert" className="pm-solution-error">{error}</p>}
    <div id={`solution-plan-${id}`} hidden={!plan}>{plan && <>
      <ul className="pm-solution-targets">{plan.modules.map(target => <li key={target.id}>
        <div><strong>{target.name}</strong><span>{target.enabled ? 'از قبل فعال' : 'فعال خواهد شد'}</span></div>
        {!!target.preserved.length && <small>{target.preserved.length.toLocaleString('fa-IR')} تنظیم ذخیره‌شده حفظ می‌شود.</small>}
        {!!Object.keys(target.defaults).length && <details><summary>پیش‌فرض‌های جدید ({Object.keys(target.defaults).length.toLocaleString('fa-IR')})</summary><dl>{Object.entries(target.defaults).map(([key, value]) => <div key={key}><dt dir="ltr">{key}</dt><dd>{typeof value === 'boolean' ? value ? 'بله' : 'خیر' : String(value)}</dd></div>)}</dl></details>}
      </li>)}</ul>
      {!!plan.recommendations.length && <p>افزونه‌های پیشنهادی: <bdi dir="ltr">{plan.recommendations.join('، ')}</bdi>. دریافت و مجوز هرکدام جداست؛ خودکار نصب نمی‌شوند.</p>}
      <p>حذف بسته یا لغو لایسنس، پیکربندی و داده‌های ایجادشده را برنمی‌گرداند.</p>
      {plan.receipt && <details className="pm-solution-receipt"><summary>رسید آخرین پیکربندی</summary><dl><div><dt>زمان ثبت</dt><dd>{new Date(plan.receipt.appliedAt).toLocaleString('fa-IR')}</dd></div><div><dt>ماژول‌ها</dt><dd><bdi dir="ltr">{plan.receipt.modules.join('، ')}</bdi></dd></div><div><dt>پیش‌فرض‌های ثبت‌شده</dt><dd>{plan.receipt.defaultKeys.length.toLocaleString('fa-IR')}</dd></div></dl></details>}
      {applied ? <p role="status" className="pm-solution-success">{saved ? 'پیکربندی با موفقیت ثبت شد.' : 'این نسخه قبلاً اعمال شده است؛ تنظیمات فعلی دوباره تغییر نمی‌کنند.'}</p> : <>
        <label className="pm-solution-confirm"><input type="checkbox" checked={confirmed} disabled={busy || stale} onChange={event => setConfirmed(event.target.checked)}/><span>فعال‌سازی ماژول‌ها و پیش‌فرض‌های این فهرست را تأیید می‌کنم.</span></label>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !confirmed || stale} onClick={() => void apply()}>{busy ? 'در حال ثبت…' : 'اعمال پیکربندی بررسی‌شده'}</button>
      </>}
    </>}</div>
  </section>
}
