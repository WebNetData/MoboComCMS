'use client'
import { useEffect, useRef, useState } from 'react'
import type { MerchantDirectory } from '@/modules/billing/domain/pay-merchant-admin'
import { api, json } from '../client'
import { Badge, ErrorNotice, Field } from '../shared'
import MerchantDetailPanel from './merchant-detail'
import Icon from '@/components/site/Icon'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

export default function Merchants() {
  const createPanel = useRef<HTMLDetailsElement>(null)
  const [data, setData] = useState<MerchantDirectory | null>(null), [page, setPage] = useState(1), [q, setQ] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState(''), [revision, setRevision] = useState(0), [selected, setSelected] = useState('')
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [phone, setPhone] = useState(''), [self, setSelf] = useState(false), [name, setName] = useState(''), [website, setWebsite] = useState(''), [note, setNote] = useState('')
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    api<MerchantDirectory>(`/api/admin/mobocom-pay/merchant-directory?${new URLSearchParams({ page: String(page), q: query, status })}`, { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'فهرست دریافت نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, query, status, revision])
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFeedback('')
    try { const result = await api<{ id: string }>('/api/admin/mobocom-pay/merchant-directory', json('POST', { ...(self && data?.canProvisionSelf ? { self: true } : { phone }), name, website, note })); if (createPanel.current) createPanel.current.open = false; setSelected(result.id); setRevision(n => n + 1); setFeedback('پذیرنده ایجاد شد و برای فعال‌سازی به تأیید شما نیاز دارد.'); setPhone(''); setSelf(false); setName(''); setWebsite(''); setNote('') } catch (e) { setError(e instanceof Error ? e.message : 'ایجاد پذیرنده انجام نشد') } finally { setBusy(false) }
  }
  return <section className={o.merchantWorkspace} aria-labelledby="pay-merchant-workspace-title">
    <div className={o.toolbar}>
      <h2 id="pay-merchant-workspace-title">مدیریت پذیرندگان</h2>
      <button className={s.secondary} type="button" disabled={loading} onClick={() => setRevision(n => n + 1)}>تازه‌سازی پذیرندگان</button>
    </div>
    <ErrorNotice error={error} />
    {feedback && <p role="status" className={s.notice}>{feedback}</p>}
    <details ref={createPanel} className={`${s.card} ${o.create}`}>
      <summary><span className={o.icon}><Icon name="plus" size={18} /></span>افزودن پذیرنده به حساب موجود</summary>
      <form className={s.stack} onSubmit={create}>
        <p className={s.muted}>پذیرندگی برای یک حساب موجود با وضعیت «در انتظار» ایجاد می‌شود.</p>
        {data?.canProvisionSelf && <label className={s.check}><input type="checkbox" checked={self} onChange={e => setSelf(e.target.checked)} />پذیرندگی برای حساب خودم (مدیر کل)</label>}
        <div className={o.fields}>
          {!(self && data?.canProvisionSelf) && <Field label="شمارهٔ موبایل حساب موبوکام"><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" required maxLength={40} /></Field>}
          <Field label="نام کسب‌وکار جدید"><input value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></Field>
          <Field label="وب‌سایت کسب‌وکار جدید (اختیاری)"><input type="url" dir="ltr" value={website} onChange={e => setWebsite(e.target.value)} maxLength={1000} /></Field>
          <Field label="دلیل ایجاد پذیرنده"><input value={note} onChange={e => setNote(e.target.value)} required minLength={3} maxLength={300} /></Field>
        </div>
        <div><button className={s.button} type="submit" disabled={busy || note.trim().length < 3}>{busy ? 'در حال ثبت…' : 'ایجاد پذیرنده در انتظار تأیید'}</button></div>
      </form>
    </details>
    <div className={o.workspace}>
      <section className={`${s.card} ${o.directoryCard}`} aria-labelledby="pay-merchant-list-title" aria-busy={loading}>
        <div className={o.listHead}>
          <h3 id="pay-merchant-list-title">پذیرندگان ثبت‌شده</h3>
          {data && !loading && !error && <span className={o.count}>{data.total.toLocaleString('fa-IR')} پذیرنده</span>}
        </div>
        <form className={o.filters} onSubmit={e => { e.preventDefault(); setQuery(q); setPage(1) }}>
          <Field label="جست‌وجو با موبایل، نام یا شناسهٔ کاربر"><input value={q} onChange={e => setQ(e.target.value)} maxLength={100} /></Field>
          <Field label="وضعیت پذیرندگی"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">همهٔ وضعیت‌ها</option><option value="PENDING">در انتظار</option><option value="ACTIVE">فعال</option><option value="SUSPENDED">تعلیق‌شده</option></select></Field>
          <button className={s.secondary} type="submit"><Icon name="search" size={16} /> جست‌وجو</button>
        </form>
        {loading && <p className={o.listState} role="status">در حال دریافت پذیرندگان…</p>}
        {data && !loading && !error && <>
          {!data.items.length && <p className={s.emptyState}>پذیرنده‌ای مطابق فیلتر پیدا نشد.</p>}
          <div className={o.directory}>
            {data.items.map(m => <button key={m.id} className={`${s.secondary} ${o.merchant}`} type="button" aria-pressed={selected === m.id} onClick={() => setSelected(m.id)}>
              <span className={o.merchantName}><span className={o.icon}><Icon name="store" size={16} /></span><span><strong>{m.name}</strong><span className={o.sub}><bdi>{m.phone || 'شمارهٔ موبایل ثبت نشده'}</bdi></span></span></span>
              <span><Badge value={m.status} /><span className={o.sub}>{m.terminalCount.toLocaleString('fa-IR')} پایانه · کاربر {m.userId.toLocaleString('fa-IR')}</span></span>
            </button>)}
          </div>
          <nav className={`${s.row} ${o.pagination}`} aria-label="صفحه‌های پذیرندگان">
            <button className={s.secondary} type="button" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>جدیدتر</button>
            <span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>
            <button className={s.secondary} type="button" disabled={page >= data.pages} onClick={() => setPage(n => n + 1)}>قدیمی‌تر</button>
          </nav>
          {selected && <a className={o.selectionLink} href="#merchant-detail-title">رفتن به پروندهٔ انتخاب‌شده</a>}
        </>}
      </section>
      {selected ? <MerchantDetailPanel key={selected} id={selected} onSaved={() => setRevision(n => n + 1)} /> : <div className={`${s.card} ${o.placeholder}`}>
        <span className={o.icon}><Icon name="users" size={22} /></span>
        <strong>پروندهٔ پذیرندگی</strong>
        <p className={s.muted}>برای مشاهدهٔ کارمزد، پایانه‌ها و سطح دسترسی، یک پذیرنده را از فهرست انتخاب کنید.</p>
      </div>}
    </div>
  </section>
}
