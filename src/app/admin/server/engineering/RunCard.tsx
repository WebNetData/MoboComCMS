'use client'
import { useState } from 'react'
import type { EngineeringRunView } from './types'
import RepairApproval from './RepairApproval'

const states: Record<string, string> = { REPAIR_READY: 'بازیابی پیشنهادی؛ منتظر تأیید', REPAIR_QUEUED: 'در حال اجرای بازیابی تأییدشده', REPAIRED: 'نتیجهٔ بازیابی ثبت شد', QUEUED: 'در صف محیط جدا', DEVELOPING: 'بررسی و توسعه', VALIDATING: 'بررسی و بیلد جدا', PUBLISHING: 'ثبت تغییرات و PR', PR_OPEN: 'آمادهٔ بررسی و انتشار', DEPLOY_QUEUED: 'در حال انتشار نسخهٔ تأییدشده', DEPLOYED: 'نسخه فعال است', RETAINED: 'نسخهٔ قبلی نگه داشته شده', ROLLBACK_QUEUED: 'در حال بازگشت کد', ROLLED_BACK: 'کد قبلی برگشت', DIAGNOSED: 'گزارش عیب‌یابی آماده است', FAILED: 'متوقف؛ گزارش را بررسی کنید', CANCELLED: 'متوقف‌شده با درخواست شما' }
export default function RunCard({ run, busy, decide }: { run: EngineeringRunView; busy: boolean; decide: (body: Record<string, unknown>) => void }) {
  const [consent, setConsent] = useState(false)
  const promote = run.status === 'PR_OPEN', rollback = run.status === 'DEPLOYED', canCancel = ['QUEUED', 'DEVELOPING', 'VALIDATING', 'PUBLISHING', 'PR_OPEN', 'REPAIR_READY', 'FAILED'].includes(run.status)
  const pr = run.result.prUrl && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/.test(run.result.prUrl) ? run.result.prUrl : ''
  return <article className="sa-card ae-run">
    <header className="ae-row"><h3>{run.instruction}</h3><span className="badge">{states[run.status] || 'وضعیت نامشخص'}</span></header>
    <p className="ae-report">{run.report || 'درخواست ثبت شده و منتظر اجرای مرحلهٔ بعد است.'}</p>
    {run.status === 'REPAIR_READY' && <RepairApproval run={run} busy={busy} decide={decide} />}
    <p className="sa-hint">تلاش مدل: {run.steps.toLocaleString('fa-IR')} · متن ورودی: {run.inputChars.toLocaleString('fa-IR')} نویسه · سقف خروجی رزروشده: {run.outputBudget.toLocaleString('fa-IR')} توکن</p>
    <p className="sa-hint">سقف خروجی، مصرف واقعی یا هزینهٔ صورتحساب ارائه‌دهنده نیست. دریافت وضعیت، مدل را دوباره اجرا نمی‌کند.</p>
    {!!run.result.checks?.length && <details><summary>بررسی‌های اجراشده</summary><ul>{run.result.checks.map(check => <li key={check.name}><code dir="ltr">{check.name}</code> — {check.passed ? 'پاس شد' : 'ناموفق'}</li>)}</ul></details>}
    {run.result.diffSummary && <details><summary>خلاصهٔ فایل‌های تغییرکرده</summary><pre className="sp-pre" dir="ltr" tabIndex={0} aria-label="خلاصهٔ تغییرات">{run.result.diffSummary}</pre></details>}
    {run.result.diagnostics && <details><summary>رسید میزبان</summary><p className="ae-report">{run.result.diagnostics}</p></details>}
    <div className="ae-row">{pr && <a className="btn btn-ghost" href={pr} target="_blank" rel="noreferrer">مشاهده و بررسی PR در گیت‌هاب</a>}{canCancel && <button className="btn btn-ghost" disabled={busy} onClick={() => decide({ action: 'cancel', id: run.id, revision: run.revision })}>توقف این درخواست</button>}</div>
    {(promote || rollback) && <form className="ae-approval" onSubmit={event => { event.preventDefault(); if (!consent) return; decide({ action: promote ? 'promote' : 'rollback', id: run.id, revision: run.revision, artifact: run.result.artifact, headSha: run.result.headSha, approved: true }); setConsent(false) }}>
      <h4>{promote ? 'انتشار همین نسخه' : 'بازگشت به کد قبلی'}</h4>
      <p>{promote ? 'ابتدا گزارش، تغییرات نمایشی و PR را بررسی و مرج کنید. سرور نسخه، پشتیبان و آمادگی را دوباره بررسی می‌کند؛ در بازهٔ پایش تنظیم‌شده، خرابی نسخهٔ تازه می‌تواند مسیر کد قبلی سالم را خودکار برگرداند.' : 'نسخهٔ قبلی باید سالم و سازگار باشد. بازگشت فقط کد و مسیر سرویس‌دهی را تغییر می‌دهد؛ اطلاعات تازهٔ کاربران بازنویسی نمی‌شوند.'}</p>
      <p className="sa-hint">نسخهٔ کد: <code dir="ltr">{run.result.headSha?.slice(0, 12)}</code> · بستهٔ بررسی‌شده: <code dir="ltr">{run.result.artifact?.slice(0, 12)}</code></p>
      <label className="ae-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{promote ? 'بررسی و مرج انجام شده و انتشار همین نسخه روی سایت اصلی را تأیید می‌کنم.' : 'بازگشت کد همین انتشار به نسخهٔ قبلی را تأیید می‌کنم.'}</label>
      <button className="btn btn-primary" type="submit" disabled={busy || !consent || !run.result.artifact}>{busy ? 'در حال ثبت…' : promote ? 'انتشار نسخهٔ تأییدشده' : 'بازگشت کد با حفظ اطلاعات'}</button>
    </form>}
  </article>
}
