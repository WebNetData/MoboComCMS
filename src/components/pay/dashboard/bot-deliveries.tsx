'use client'
import { useEffect, useRef, useState } from 'react'
import type { PayBotDeliveryView } from '@/modules/billing/domain/pay-bot'
import { api, json, date } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'

const labels = { WAITING: 'در انتظار پرداخت', QUEUED: 'در صف تأیید ربات', SENDING: 'در حال ارسال', SENT: 'تأیید ثبت شده', UNKNOWN: 'نتیجه نامشخص؛ بررسی لازم', BLOCKED: 'ارسال متوقف؛ بررسی اتصال' }
export default function BotDeliveryList({ rows, refresh }: { rows: PayBotDeliveryView[]; refresh: () => void }) {
  const [selected, setSelected] = useState<PayBotDeliveryView | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const recovery = useRef<HTMLElement>(null), refreshButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (selected) recovery.current?.focus() }, [selected])
  async function recover(action: 'retry' | 'confirm') {
    if (!selected || !confirmed) return
    setBusy(true); setError('')
    try { await api('/api/pay/bot-deliveries', json('POST', { id: selected.id, version: selected.version, action, confirmed })); setSelected(null); setConfirmed(false); refreshButton.current?.focus(); refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت بررسی انجام نشد') }
    finally { setBusy(false) }
  }
  return <section className={s.card} aria-label="پیگیری تأیید ربات">
    <div className={s.sectionHead}><div><h3>پیگیری تأیید سفارش در ربات</h3><p className={s.muted}>وضعیت ارسال به ربات مستقل از تأیید وجه است؛ آخرین ۱۰۰ سفارش.</p></div><button ref={refreshButton} className={s.secondary} type="button" onClick={refresh} disabled={busy}>تازه‌کردن نتایج</button></div>
    <ErrorNotice error={error} />
    {!rows.length ? <p className={s.emptyState}>هنوز سفارشی از اتصال ربات ثبت نشده است.</p> : <div className={s.tableWrap} role="region" aria-label="نتیجهٔ سفارش‌های ربات" tabIndex={0}><table className={s.table}><thead><tr><th>سفارش / پایانه</th><th>نتیجهٔ تأیید ربات</th><th>تلاش</th><th>آخرین تغییر</th><th>پیگیری</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><bdi>{row.externalId}</bdi><small className={s.tableSub}>{row.terminalName}</small></td><td><span className={s.badge} data-state={row.status}>{row.status === 'WAITING' && row.paymentStatus === 'EXPIRED' ? 'مهلت پرداخت پایان یافته' : labels[row.status]}</span>{row.httpStatus !== null && <small className={s.tableSub}>HTTP <bdi>{row.httpStatus}</bdi></small>}</td><td>{row.attempts.toLocaleString('fa-IR')}</td><td>{date(row.updatedAt)}</td><td>{['UNKNOWN','BLOCKED'].includes(row.status) ? <button type="button" className={s.secondary} disabled={busy} onClick={() => { setSelected(row); setConfirmed(false); setError('') }}>بررسی سفارش <bdi>{row.externalId}</bdi></button> : '—'}</td></tr>)}</tbody></table></div>}
    {selected && <section ref={recovery} tabIndex={-1} className={s.recoveryBox} aria-label="تصمیم دربارهٔ نتیجه نامشخص">
      <h4>بررسی سفارش <bdi>{selected.externalId}</bdi></h4><p>ابتدا سفارش را در ربات بررسی کنید. قطع ارتباط ممکن است پس از فعال‌شدن سرویس رخ داده باشد. ارسال مجدد می‌تواند عمل ربات را تکرار کند؛ وضعیت وجه و کیف پول تغییر نمی‌کند.</p>
      <label className={s.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />وضعیت را در ربات بررسی کرده‌ام و مسئولیت تصمیم را می‌پذیرم.</label>
      <div className={s.actions}><button type="button" className={s.button} disabled={busy || !confirmed} onClick={() => void recover('confirm')}>در ربات تأیید شده؛ ثبت نتیجه</button><button type="button" className={s.secondary} disabled={busy || !confirmed} onClick={() => void recover('retry')}>ارسال مجدد با تنظیمات فعلی</button><button type="button" className={s.secondary} disabled={busy} onClick={() => setSelected(null)}>بستن بررسی</button></div>
    </section>}
  </section>
}
