'use client'
import { useEffect, useState } from 'react'
import type { MerchantDirectory } from '@/modules/billing/domain/pay-merchant-admin'
import { api, json } from '../client'
import { Badge, ErrorNotice, Field } from '../shared'
import MerchantDetailPanel from './merchant-detail'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

export default function Merchants() {
  const [data, setData] = useState<MerchantDirectory | null>(null), [page, setPage] = useState(1), [q, setQ] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState(''), [revision, setRevision] = useState(0), [selected, setSelected] = useState('')
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [email, setEmail] = useState(''), [name, setName] = useState(''), [website, setWebsite] = useState(''), [note, setNote] = useState('')
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    api<MerchantDirectory>(`/api/admin/mobocom-pay/merchant-directory?${new URLSearchParams({ page: String(page), q: query, status })}`, { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'فهرست دریافت نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, query, status, revision])
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFeedback('')
    try { const result = await api<{ id: string }>('/api/admin/mobocom-pay/merchant-directory', json('POST', { email, name, website, note })); setSelected(result.id); setRevision(n => n + 1); setFeedback('پذیرنده ایجاد شد و برای فعال‌سازی به تأیید شما نیاز دارد.'); setEmail(''); setName(''); setWebsite(''); setNote('') } catch (e) { setError(e instanceof Error ? e.message : 'ایجاد پذیرنده انجام نشد') } finally { setBusy(false) }
  }
  return <section className={s.stack}>
    <div className={`${s.sectionHead} ${o.heading}`}><div><h2>مدیریت پذیرندگان</h2><p className={s.muted}>صدور دسترسی، قرارداد کارمزد، پایانه‌ها و کنترل اتصال کسب‌وکارها</p></div><button className={s.secondary} type="button" disabled={loading} onClick={() => setRevision(n => n + 1)}>تازه‌سازی پذیرندگان</button></div>
    <ErrorNotice error={error} />{feedback && <p role="status" className={s.notice}>{feedback}</p>}
    <details className={`${s.card} ${o.create}`}><summary>افزودن پذیرنده به حساب موجود</summary><form className={s.stack} onSubmit={create}><p className={s.muted}>حساب باید از قبل در موبوکام وجود داشته باشد. پذیرنده با وضعیت «در انتظار» ایجاد می‌شود؛ حساب کاربری یا موجودی تازه‌ای ساخته نمی‌شود.</p><div className={o.fields}><Field label="ایمیل دقیق حساب موبوکام"><input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" required maxLength={254} /></Field><Field label="نام کسب‌وکار جدید"><input value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></Field><Field label="وب‌سایت کسب‌وکار جدید"><input type="url" dir="ltr" value={website} onChange={e => setWebsite(e.target.value)} required maxLength={1000} /></Field><Field label="دلیل ایجاد پذیرنده"><input value={note} onChange={e => setNote(e.target.value)} required minLength={3} maxLength={300} /></Field></div><div><button className={s.button} type="submit" disabled={busy || note.trim().length < 3}>{busy ? 'در حال ثبت…' : 'ایجاد پذیرنده در انتظار تأیید'}</button></div></form></details>
    <form className={`${s.card} ${o.filters}`} onSubmit={e => { e.preventDefault(); setQuery(q); setPage(1) }}><Field label="جست‌وجو با نام، ایمیل دقیق یا شناسهٔ کاربر"><input value={q} onChange={e => setQ(e.target.value)} maxLength={100} /></Field><Field label="وضعیت پذیرندگی"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">همهٔ وضعیت‌ها</option><option value="PENDING">در انتظار</option><option value="ACTIVE">فعال</option><option value="SUSPENDED">تعلیق‌شده</option></select></Field><button className={s.secondary} type="submit">جست‌وجو</button></form>
    {loading && <p role="status">در حال دریافت پذیرندگان…</p>}
    {data && !loading && !error && <section className={`${s.card} ${s.stack}`}><h3>پذیرندگان ثبت‌شده · {data.total.toLocaleString('fa-IR')}</h3>{!data.items.length && <p className={s.emptyState}>پذیرنده‌ای مطابق فیلتر پیدا نشد.</p>}<div className={o.directory}>{data.items.map(m => <button key={m.id} className={`${s.secondary} ${o.merchant}`} type="button" aria-pressed={selected === m.id} onClick={() => setSelected(m.id)}><span><strong>{m.name}</strong><span className={o.sub}><bdi>{m.email}</bdi></span></span><span><Badge value={m.status} /><span className={o.sub}>{m.terminalCount.toLocaleString('fa-IR')} پایانه · کاربر {m.userId.toLocaleString('fa-IR')}</span></span></button>)}</div><nav className={s.row} aria-label="صفحه‌های پذیرندگان"><button className={s.secondary} type="button" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>جدیدتر</button><span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span><button className={s.secondary} type="button" disabled={page >= data.pages} onClick={() => setPage(n => n + 1)}>قدیمی‌تر</button></nav></section>}
    {selected && <MerchantDetailPanel key={selected} id={selected} onSaved={() => setRevision(n => n + 1)} />}
  </section>
}
