'use client'
import { useState } from 'react'
import type { EngineeringRunView } from './types'
const labels: Record<string, string> = { 'reload-proxy': 'بارگذاری مجدد Nginx پس از بررسی پیکربندی', 'start-proxy': 'راه‌اندازی Nginx متوقف‌شده', 'start-current-runtime': 'راه‌اندازی سرویس فعلیِ متوقف‌شده' }
export default function RepairApproval({ run, busy, decide }: { run: EngineeringRunView; busy: boolean; decide: (body: Record<string, unknown>) => void }) {
  const [consent, setConsent] = useState(false), label = labels[run.result.repairId || '']
  if (!label) return null
  return <form className="ae-approval" onSubmit={e => { e.preventDefault(); if (!consent) return; decide({ action: 'repair', id: run.id, revision: run.revision, approved: true, repairId: run.result.repairId, diagnosticHash: run.result.diagnosticHash, runtimeId: run.result.runtimeId }); setConsent(false) }}>
    <h4>تأیید اقدام مشخص روی سرور</h4><p>{label}</p><p className="sa-hint">این اقدام کد، فایل پیکربندی یا پایگاه داده را ویرایش نمی‌کند. اگر وضعیت سرور از زمان گزارش تغییر کرده باشد، تأیید قبلی کافی نیست.</p>
    <label className="ae-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />گزارش را بررسی کردم و اجرای همین اقدام روی سرویس فعلی را تأیید می‌کنم.</label><button className="btn btn-primary" type="submit" disabled={!consent || busy}>اجرای بازیابی تأییدشده</button>
  </form>
}
