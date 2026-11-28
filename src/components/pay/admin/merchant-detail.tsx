'use client'
import MerchantTerminals from './merchant-terminals'
import { useEffect, useState } from 'react'
import type { MerchantDetail } from '@/modules/billing/domain/pay-merchant-admin'
import { api, json, money, date } from '../client'
import { Badge, ErrorNotice, Field } from '../shared'
import MerchantProfile from './merchant-profile'
import MerchantCredit from './merchant-credit'
import MerchantGatewayAccess from './merchant-gateway-access'
import MerchantTerminalKeys from './merchant-terminal-keys'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

export type MerchantAdminAction = (patch: Record<string, unknown>) => Promise<void>
const titles: Record<string,string> = { provision: 'ایجاد پذیرندگی', 'admin-credit-mode': 'تغییر ارز اعتبار پرداخت‌های تازه', 'admin-profile': 'ویرایش مشخصات', 'admin-status': 'تغییر وضعیت پذیرندگی', 'admin-terms': 'تغییر قرارداد کارمزد', 'admin-auto-access': 'تغییر مجوز تأیید خودکار', 'admin-terminal': 'تغییر وضعیت پایانه', 'admin-terminal-account': 'تغییر کارت مقصد پایانه', 'admin-revoke-bot': 'توقف اتصال ربات', status: 'تغییر وضعیت', terms: 'تغییر قرارداد', 'bale-access': 'تغییر مجوز درگاه' }
export default function MerchantDetailPanel({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [data, setData] = useState<MerchantDetail | null>(null), [reload, setReload] = useState(0), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [note, setNote] = useState(''), [ack, setAck] = useState(false)
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); api<MerchantDetail>(`/api/admin/mobocom-pay/merchant-directory?id=${encodeURIComponent(id)}`, { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'جزئیات دریافت نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [id, reload])
  const action: MerchantAdminAction = async patch => {
    if (!data) return
    setBusy(true); setError(''); setFeedback('')
    try { await api('/api/admin/mobocom-pay/merchant-directory', json('PATCH', { ...patch, id, version: data.merchant.version, note })); setFeedback('تغییر ثبت شد؛ اطلاعات و دسترسی جاری بازخوانی می‌شود.'); setNote(''); setAck(false); setReload(n => n + 1); onSaved() } catch (e) { setError(e instanceof Error ? e.message : 'تغییر ثبت نشد') } finally { setBusy(false) }
  }
  const disabled = busy || loading || note.trim().length < 3 || !ack
  return <section className={`${s.card} ${o.detail}`} aria-busy={loading || busy} aria-labelledby="merchant-detail-title">
    <div className={`${s.row} ${o.detailBar}`}><h2 id="merchant-detail-title" tabIndex={-1}>پروندهٔ پذیرندگی</h2><button type="button" className={s.secondary} disabled={busy || loading} onClick={() => setReload(n => n + 1)}>بازخوانی پروندهٔ پذیرنده</button></div>
    <ErrorNotice error={error} />{feedback && <p className={s.notice} role="status">{feedback}</p>}{loading && <p role="status">در حال دریافت پرونده…</p>}
    {data && !loading && <>
      <div className={o.identity}><h3>{data.merchant.name}</h3><p><bdi>{data.merchant.phone || 'شمارهٔ موبایل ثبت نشده'}</bdi> · شناسهٔ کاربر {data.merchant.userId.toLocaleString('fa-IR')} · <Badge value={data.merchant.status} /></p><p className={s.muted}>وضعیت حساب اصلی: {data.merchant.userStatus === 'ACTIVE' ? 'فعال' : 'غیرفعال'} · ثبت {date(data.merchant.createdAt)}</p></div>
      <dl className={o.facts}><div><dt>پرداخت‌های تأییدشده</dt><dd>{data.stats.payments.toLocaleString('fa-IR')}</dd></div><div><dt>مجموع دریافت تأییدشده</dt><dd>{money(data.stats.paidRial)}</dd></div><div><dt>تسویه‌های باز</dt><dd>{data.stats.pendingSettlements.toLocaleString('fa-IR')}</dd></div></dl>
      <section className={s.stack} aria-label="موجودی‌های پذیرنده"><h3>اعتبار قابل تسویه</h3><dl className={o.facts}>{data.assetBalances?.map(a => <div key={a.currency}><dt>{a.currency === 'IRR' ? 'ریال' : 'USDT داخلی'}</dt><dd><bdi dir="ltr">{a.availableAmount} {a.currency}</bdi></dd><dd className={s.muted}>رزروشده: <bdi>{a.reservedAmount}</bdi></dd></div>)}</dl></section><div className={o.panel}><h3>ثبت تصمیم مدیر</h3><Field label="دلیل تغییر پذیرندگی"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} minLength={3} maxLength={300} required /></Field><label className={s.check}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />پذیرنده و اثر تغییر بر دسترسی و قرارداد را بررسی کردم.</label><p className={s.muted}>برای هر تغییر، دلیل و تأیید لازم است. تعلیق، دسترسی پنل و عملیات تازه را متوقف می‌کند و سوابق مالی را نگه می‌دارد.</p><div className={s.actions}>{data.merchant.status !== 'ACTIVE' && <button type="button" className={s.button} disabled={disabled} onClick={() => void action({ action: 'status', status: 'ACTIVE' })}>فعال‌سازی پذیرنده</button>}{data.merchant.status !== 'SUSPENDED' && <button type="button" className={s.secondary} disabled={disabled} onClick={() => void action({ action: 'status', status: 'SUSPENDED' })}>تعلیق پذیرنده</button>}<button type="button" className={s.secondary} disabled={disabled} onClick={() => void action({ action: 'auto-access', allowed: !data.merchant.baleAllowed })}>{data.merchant.baleAllowed ? 'لغو مجوز درگاه خودکار' : 'صدور مجوز درگاه خودکار'}</button></div></div>
      <details className={o.disclosure}><summary>مشخصات کسب‌وکار و قرارداد کارمزد</summary><div className={s.stack}><MerchantProfile key={`${id}:${data.merchant.version}`} merchant={data.merchant} disabled={disabled} action={action} /></div></details>
      <details className={o.disclosure}><summary>ارز اعتبار پرداخت‌های تازه</summary><MerchantCredit key={`${id}:${data.merchant.version}`} merchant={data.merchant} disabled={disabled} action={action} /></details>
      <MerchantTerminals terminals={data.terminals} bankAccounts={data.bankAccounts} autoAllowed={data.merchant.baleAllowed} disabled={disabled} action={action} />
      <MerchantGatewayAccess merchantId={id} disabled={busy || loading} />
      <MerchantTerminalKeys key={id} merchantId={id} disabled={busy || loading} />
      <section className={`${s.stack} ${o.historyGroup}`}><h3>سابقهٔ مدیریت · ۵۰ رویداد اخیر</h3>{!data.history.length && <p className={s.muted}>رویدادی ثبت نشده است.</p>}<ol className={o.history}>{data.history.map(h => <li key={h.id}><strong>{titles[h.action.replace('mobocom-pay.merchant.', '')] || 'تغییر پذیرندگی'}</strong><p className={s.muted}>{date(h.at)} · مدیر {h.actorId.toLocaleString('fa-IR')}</p>{h.note && <p>{h.note}</p>}</li>)}</ol></section>
    </>}
  </section>
}
