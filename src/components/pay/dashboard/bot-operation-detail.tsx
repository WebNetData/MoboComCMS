'use client'

import { useEffect, useRef, useState } from 'react'
import type { PayBotOperationDetail } from '@/modules/billing/domain/pay-operations'
import { api, date, json, labels, money } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'

const jobLabels: Record<string, string> = { QUEUED: 'در صف', RUNNING: 'در حال اجرا', DONE: 'پایان یافته', FAILED: 'ناموفق' }
const auditLabels: Record<string, string> = { sending: 'آغاز ارسال', result: 'نتیجهٔ ارسال', interrupted: 'ارسال قطع‌شده', blocked: 'ارسال متوقف', 'explicit-retry': 'ارسال مجدد آگاهانه', 'external-confirmation': 'تأیید فروشنده', inspected: 'بررسی ارسال معطل', 'queue-repair': 'بازبینی صف' }

export default function BotOperationDetail({ id, revision, busy, onBusy, onClose, onChanged }: {
  id: string; revision: number; busy: boolean; onBusy: (busy: boolean) => void; onClose: () => void; onChanged: () => void
}) {
  const [detail, setDetail] = useState<PayBotOperationDetail | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [actionError, setActionError] = useState('')
  const [confirmed, setConfirmed] = useState(false), [refresh, setRefresh] = useState(0), [saved, setSaved] = useState(false)
  const region = useRef<HTMLElement>(null)
  useEffect(() => { region.current?.focus() }, [id])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setDetail(null); setConfirmed(false)
    api<PayBotOperationDetail>(`/api/pay/bot-operations?id=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'دریافت جزئیات انجام نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, revision, refresh])
  async function act(action: 'confirm' | 'retry' | 'inspect' | 'queue') {
    if (!detail || !confirmed || busy) return
    onBusy(true); setActionError(''); setSaved(false)
    try {
      await api('/api/pay/bot-deliveries', json('POST', { id: detail.operation.id, version: detail.operation.version, action, confirmed: true }))
      setConfirmed(false); setSaved(true); setRefresh(value => value + 1); onChanged()
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'ثبت تصمیم انجام نشد') }
    finally { onBusy(false) }
  }
  const operation = detail?.operation
  const review = operation && ['UNKNOWN', 'BLOCKED'].includes(operation.status)
  const inspect = operation?.overdue && operation.status === 'SENDING'
  const queue = operation?.overdue && operation.status === 'QUEUED'
  return <section ref={region} tabIndex={-1} className={s.recoveryBox} aria-label="جزئیات عملیات ربات" aria-busy={loading || busy}>
    <div className={s.sectionHead}><h3>جزئیات عملیات ربات</h3><button type="button" className={s.secondary} onClick={onClose} disabled={busy}>بستن جزئیات</button></div>
    {loading && <p role="status">در حال دریافت جزئیات…</p>}
    <ErrorNotice error={error} />
    {error && <button type="button" className={s.secondary} onClick={() => setRefresh(value => value + 1)}>تلاش دوباره</button>}
    {saved && <p role="status">تصمیم ثبت شد و اطلاعات به‌روز می‌شود.</p>}
    {detail && operation && <>
      <p>سفارش <bdi>{operation.externalId}</bdi> · {operation.terminalName}</p>
      <p>پرداخت: {labels[operation.paymentStatus] || operation.paymentStatus} · مبلغ سفارش: {money(operation.amountRial)} · مبلغ نهایی: {money(operation.totalRial)}</p>
      {operation.paymentStatus === 'PAID' && <p className={s.notice}>{operation.creditMatches ? 'مبلغ خالص و ثبت درآمد کیف پول با این پرداخت مطابقت دارد.' : 'ثبت درآمد با این پرداخت مطابقت ندارد؛ پیش از تصمیم مالی، موضوع را با پشتیبانی بررسی کنید.'}</p>}
      <p>قانون مسیر: {detail.routing?.ruleName || 'بدون قانون ثبت‌شده'} · روش‌ها: {detail.routing?.gateways.map(item => item.name).join('، ') || 'ثبت نشده'}</p>
      <h4>کارهای ارسال</h4>
      {detail.jobs.length ? <ul>{detail.jobs.map(job => <li key={job.id}>{jobLabels[job.status] || job.status} · تلاش {job.attempts.toLocaleString('fa-IR')} · زمان اجرا {date(job.runAt)}{job.lockedAt ? ` · قفل از ${date(job.lockedAt)}` : ''}</li>)}</ul> : <p className={s.muted}>کاری ثبت نشده است.</p>}
      <h4>سابقهٔ بررسی</h4>
      {detail.audit.length ? <ol>{detail.audit.map(event => <li key={event.id}>{date(event.at)} · {auditLabels[event.action.split('.').at(-1) || ''] || 'رویداد ارسال'}{event.status ? ` · ${labels[event.status] || event.status}` : ''}{event.code ? ` · ${event.code}` : ''}</li>)}</ol> : <p className={s.muted}>سابقه‌ای ثبت نشده است.</p>}
      {(review || inspect || queue) && <div className={s.stack}>
        <p className={s.notice}>ابتدا وضعیت سفارش را در ربات بررسی کنید. ارسال مجدد ممکن است سرویس ربات را تکرار کند؛ کیف پول تغییر نمی‌کند.</p>
        <label className={s.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />وضعیت را بررسی کرده‌ام و مسئولیت تصمیم را می‌پذیرم.</label>
        <ErrorNotice error={actionError} />
        <div className={s.actions}>
          {review && <><button type="button" className={s.button} disabled={busy || !confirmed} onClick={() => void act('confirm')}>در ربات تأیید شده؛ ثبت نتیجه</button><button type="button" className={s.secondary} disabled={busy || !confirmed} onClick={() => void act('retry')}>ارسال مجدد</button></>}
          {inspect && <button type="button" className={s.button} disabled={busy || !confirmed} onClick={() => void act('inspect')}>ثبت برای بررسی نتیجه</button>}
          {queue && <button type="button" className={s.button} disabled={busy || !confirmed} onClick={() => void act('queue')}>قرار دادن دوباره در صف</button>}
        </div>
        {!confirmed && <p className={s.muted}>برای فعال‌شدن تصمیم، تأیید بررسی را انتخاب کنید.</p>}
      </div>}
    </>}
  </section>
}
