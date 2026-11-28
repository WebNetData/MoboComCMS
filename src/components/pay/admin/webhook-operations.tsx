'use client'
import { useCallback, useEffect, useState } from 'react'
import type { PayWebhookOverview } from '@/modules/billing/domain/pay-webhooks'
import { api, date, json } from '../client'
import { webhookLabels } from '../webhook-labels'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import w from './WebhookOperations.module.css'
import DeskHeader from './desk-header'

export default function WebhookOperations({ allowed }: { allowed: boolean }) {
  const [data, setData] = useState<PayWebhookOverview | null>(null)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [endpointPage, setEndpointPage] = useState(1)
  const [page, setPage] = useState(1), [status, setStatus] = useState(''), [ack, setAck] = useState<Record<string, boolean>>({})
  const load = useCallback(async () => {
    if (!allowed) return
    try { setData(await api<PayWebhookOverview>(`/api/admin/mobocom-pay/webhooks?${new URLSearchParams({ page: String(page), endpointPage: String(endpointPage), status })}`)); setAck({}); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت وبهوک‌ها ناموفق بود') }
  }, [allowed, page, endpointPage, status])
  useEffect(() => { void load() }, [load])
  async function pause(id: string, version: number) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await api('/api/admin/mobocom-pay/webhooks', json('PATCH', { id, version, active: false })); setMessage('مقصد متوقف شد'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'توقف مقصد ناموفق بود') }
    finally { setBusy(false) }
  }
  async function retry(id: string, version: number, configVersion: number) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await api('/api/admin/mobocom-pay/webhook-deliveries', json('POST', { id, version, configVersion, action: 'redeliver', ackReplay: true })); setMessage('درخواست ارسال دوباره ثبت شد'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'درخواست ارسال دوباره ناموفق بود') }
    finally { setBusy(false) }
  }
  if (!allowed) return <p>دسترسی به عملیات وبهوک برای حساب شما فعال نیست</p>
  return <section className={`${s.stack} ${w.workspace}`}>
    <DeskHeader icon="terminal" title="تحویل رویدادها" description="وضعیت ارسال‌های وبهوک و مقصدهای پایانه‌ها را بررسی کنید.">
      <button type="button" className={s.secondary} disabled={busy} onClick={() => void load()}>بازخوانی وضعیت ارسال</button>
    </DeskHeader><ErrorNotice error={error} />{message && <p role="status">{message}</p>}{!data && !error && <p role="status">در حال دریافت عملیات وبهوک…</p>}
    {data && <>
      <div className={w.metrics}><div><span>در انتظار</span><strong>{data.counts.pending.toLocaleString('fa-IR')}</strong></div><div><span>تحویل‌شده</span><strong>{data.counts.delivered.toLocaleString('fa-IR')}</strong></div><div><span>نیازمند توجه</span><strong>{data.counts.attention.toLocaleString('fa-IR')}</strong></div></div>
      <div className={w.panels}>
      <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-webhook-endpoints"><h3 id="pay-webhook-endpoints">مقصدهای پایانه</h3>{!data.endpoints.length && <p className={w.empty}>مقصدی ثبت نشده است.</p>}{data.endpoints.map(endpoint => <div className={w.row} key={endpoint.id}><div><strong>{endpoint.terminalName}</strong><p><bdi>{endpoint.url}</bdi></p><small>نسخه {endpoint.version} · {endpoint.active ? 'فعال' : 'متوقف'}</small></div>{endpoint.active && <button type="button" className={s.secondary} disabled={busy} onClick={() => void pause(endpoint.id, endpoint.version)}>توقف مقصد</button>}</div>)}<div className={s.actions}><button type="button" className={s.secondary} disabled={busy || endpointPage <= 1} onClick={() => setEndpointPage(endpointPage - 1)}>مقصدهای قبلی</button><span>صفحه مقصدها {data.endpointPage} از {data.endpointPages}</span><button type="button" className={s.secondary} disabled={busy || endpointPage >= data.endpointPages} onClick={() => setEndpointPage(endpointPage + 1)}>مقصدهای بعدی</button></div></section>
      <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-webhook-deliveries"><h3 id="pay-webhook-deliveries">ارسال‌ها</h3><Field label="وضعیت"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">همه</option>{['PENDING','SENDING','RETRY','DELIVERED','FAILED','PAUSED'].map(value => <option key={value} value={value}>{webhookLabels[value] || value}</option>)}</select></Field>
        {!data.deliveries.length && <p className={w.empty}>ارسالی یافت نشد.</p>}{data.deliveries.map(delivery => { const endpoint = data.deliveryEndpoints.find(x => x.terminalId === delivery.terminalId); const key = `${delivery.id}:${delivery.version}:${endpoint?.version ?? 'missing'}`; return <article className={w.delivery} key={delivery.id}><div className={w.row}><strong>{delivery.terminalName} · <bdi>{delivery.externalId}</bdi></strong><span className={w.status} data-status={delivery.status}>{webhookLabels[delivery.status] || delivery.status}</span></div><p>ثبت: {date(delivery.createdAt)} · تلاش‌ها: {delivery.attempts.toLocaleString('fa-IR')}</p><details><summary>جزئیات و تاریخچه</summary><p>شناسه رویداد: <bdi>{delivery.id}</bdi> · آخرین نتیجه: {delivery.lastCode || '—'} · HTTP: {delivery.httpStatus ?? '—'}</p><p>مقصد ثبت‌شده ارسال: <bdi>{delivery.url}</bdi> · نسخه {delivery.configVersion}</p>{(delivery.status === 'PENDING' || delivery.status === 'RETRY') && delivery.nextAttemptAt && <p>تلاش بعدی: {date(delivery.nextAttemptAt)}</p>}{delivery.history.map(attempt => <p key={attempt.id}>{date(attempt.startedAt)} · {webhookLabels[attempt.status] || attempt.status} · {attempt.code} · HTTP {attempt.httpStatus ?? '—'} · نسخه {attempt.configVersion} · <bdi>{attempt.url}</bdi></p>)}{endpoint?.active ? <><p>مقصد فعلی ارسال دوباره: <bdi>{endpoint.url}</bdi> · نسخه {endpoint.version}</p><p>ارسال دوباره ممکن است رویداد تکراری ایجاد کند؛ گیرنده باید با شناسه رویداد از پردازش تکراری جلوگیری کند</p><label className={s.check}><input type="checkbox" checked={!!ack[key]} onChange={e => setAck({ ...ack, [key]: e.target.checked })} /> مقصد فعلی و احتمال ارسال تکراری را می‌پذیرم</label><button type="button" className={s.secondary} disabled={busy || !ack[key] || !['DELIVERED','FAILED','PAUSED'].includes(delivery.status)} onClick={() => void retry(delivery.id, delivery.version, endpoint.version)}>درخواست ارسال دوباره</button></> : <p>مقصد فعلی فعال یا در دسترس نیست؛ ارسال دوباره ممکن نیست</p>}</details></article> })}
        <div className={s.actions}><button type="button" className={s.secondary} disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span>صفحه {data.page} از {data.pages}</span><button type="button" className={s.secondary} disabled={busy || page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></div>
      </section>
      </div>
    </>}
  </section>
}
