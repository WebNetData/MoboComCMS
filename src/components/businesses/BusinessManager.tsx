'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, send, useJson } from '@/app/admin/store/shared'

type Profile = { id?: number; name: string; slug: string; kind: string; website: string; category: string; description: string; status: string; sellerId: number | null; representativeId: number | null }
type Data = { profiles: (Profile & { id: number })[]; sellers: { id: number; shopName: string }[]; pending: { id: number; businessId: number; business: string; rating: number; body: string }[] }
const empty: Profile = { name: '', slug: '', kind: 'EXTERNAL', website: '', category: '', description: '', status: 'DRAFT', sellerId: null, representativeId: null }
export default function BusinessManager() {
  const { data, error, reload } = useJson<Data>('/api/admin/businesses')
  const [draft, setDraft] = useState<Profile | null>(null), [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null), [busy, setBusy] = useState(false), [acknowledged, setAcknowledged] = useState(false), lock = useRef(false)
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (!data || openedFromLink.current) return
    openedFromLink.current = true
    const id = Number(new URLSearchParams(window.location.search).get('edit'))
    const profile = data.profiles.find(profile => profile.id === id)
    if (profile) setDraft(profile)
  }, [data])
  function edit(profile: Profile) { setDraft(profile); setAcknowledged(false); setNotice(null) }
  async function command(body: Record<string, unknown>) {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { const result = await send('/api/admin/businesses', 'POST', body); if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return } setNotice({ tone: 'ok', text: 'تغییرات ذخیره شد.' }); setDraft(null); await reload() }
    catch { setNotice({ tone: 'error', text: 'ارتباط برقرار نشد؛ وضعیت را پیش از تکرار بررسی کنید.' }) }
    finally { lock.current = false; setBusy(false) }
  }
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous)
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" aria-busy="true" aria-label="بارگذاری کسب‌وکارها" />
  return <div className="sa" dir="rtl" data-testid="business-admin"><header className="sa-head"><div><h1>تجربهٔ خرید و کسب‌وکارها</h1><p className="sa-sub">سایت‌های بیرونی، فروشندگان داخلی و فروشگاه موبوکام؛ با تاریخچهٔ نقد مشترک</p></div><button className="btn btn-primary" type="button" onClick={() => edit({ ...empty })} disabled={busy}>کسب‌وکار تازه</button></header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card"><header className="sa-card-head"><h2>تجربه‌های منتظر بررسی</h2><span>{data.pending.length.toLocaleString('fa-IR')}</span></header>{!data.pending.length ? <p className="sa-empty">تجربه‌ای در انتظار بررسی نیست.</p> : data.pending.map(review => <article key={`${review.businessId}:${review.id}`} className="sa-card"><strong>{review.business} · امتیاز {review.rating.toLocaleString('fa-IR')} از ۵</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.body}</p><div className="sa-row-actions"><button className="btn btn-primary btn-sm" disabled={busy} type="button" onClick={() => void command({ action: 'approve', businessId: review.businessId, reviewId: review.id })}>انتشار تجربه</button><button className="btn btn-ghost btn-sm" disabled={busy} type="button" onClick={() => void command({ action: 'reject', businessId: review.businessId, reviewId: review.id })}>رد تجربه</button></div></article>)}</section>
    {draft && <form className="sa-card rp-form" onSubmit={event => { event.preventDefault(); void command({ action: 'profile.save', ...draft, acknowledgeRepresentative: acknowledged }) }} aria-busy={busy}>
      <header className="sa-card-head"><h2>{draft.id ? 'ویرایش کسب‌وکار' : 'ثبت کسب‌وکار'}</h2></header>
      <label className="sa-field">نام کسب‌وکار<input className="input" required minLength={2} maxLength={120} value={draft.name} onChange={event => set('name', event.target.value)} disabled={busy} /></label>
      <label className="sa-field">شناسهٔ ثابت لاتین<input className="input" dir="ltr" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={draft.slug} onChange={event => set('slug', event.target.value)} disabled={busy || !!draft.id} /></label>
      <label className="sa-field">نوع<select className="input" value={draft.kind} disabled={busy || !!draft.id} onChange={event => { set('kind', event.target.value); set('sellerId', null); set('representativeId', null) }}><option value="EXTERNAL">سایت یا کسب‌وکار بیرونی</option><option value="SELLER">فروشندهٔ داخلی</option><option value="SITE">خود فروشگاه موبوکام</option></select></label>
      {draft.kind === 'EXTERNAL' && <label className="sa-field">وب‌سایت عمومی<input className="input" dir="ltr" required value={draft.website} maxLength={2048} onChange={event => set('website', event.target.value)} disabled={busy} placeholder="https://example.com" /></label>}
      {draft.kind === 'SELLER' ? <label className="sa-field">فروشندهٔ فعال<select className="input" required value={draft.sellerId || ''} disabled={busy || !!draft.id} onChange={event => set('sellerId', Number(event.target.value) || null)}><option value="">انتخاب فروشنده</option>{data.sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.shopName}</option>)}</select></label> : <><label className="sa-field">شناسهٔ حساب نماینده <small>اختیاری؛ پس از بررسی ارتباط حساب با کسب‌وکار</small><input className="input" type="number" min={1} value={draft.representativeId || ''} onChange={event => { set('representativeId', Number(event.target.value) || null); setAcknowledged(false) }} disabled={busy} /></label>{draft.representativeId && <label className="sa-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} /> ارتباط این حساب با کسب‌وکار را بررسی کرده‌ام.</label>}</>}
      <label className="sa-field">زمینهٔ فعالیت<input className="input" maxLength={80} value={draft.category} onChange={event => set('category', event.target.value)} disabled={busy} /></label>
      <label className="sa-field">دربارهٔ کسب‌وکار<textarea className="input" rows={4} maxLength={2000} value={draft.description} onChange={event => set('description', event.target.value)} disabled={busy} /></label>
      <label className="sa-field">نمایش عمومی<select className="input" value={draft.status} onChange={event => set('status', event.target.value)} disabled={busy}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option></select></label>
      <div className="sa-row-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ کسب‌وکار'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setDraft(null)}>انصراف</button></div>
    </form>}
    <section className="sa-card"><header className="sa-card-head"><h2>کسب‌وکارهای ثبت‌شده</h2></header>{!data.profiles.length ? <p className="sa-empty">اولین کسب‌وکار را ثبت کنید؛ ماژول از تنظیمات افزونه‌ها قابل فعال‌سازی است.</p> : <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>نام</th><th>نوع</th><th>وضعیت</th><th>مدیریت</th></tr></thead><tbody>{data.profiles.map(profile => <tr key={profile.id}><td>{profile.name}<small className="sa-sub" dir="ltr">{profile.slug}</small></td><td>{profile.kind === 'SELLER' ? 'فروشنده' : profile.kind === 'SITE' ? 'فروشگاه سایت' : 'بیرونی'}</td><td>{profile.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</td><td><div className="sa-row-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => edit(profile)} disabled={busy}>ویرایش</button>{profile.status === 'PUBLISHED' && <Link href={`/businesses/${profile.slug}`} className="btn btn-ghost btn-sm">مشاهده</Link>}</div></td></tr>)}</tbody></table></div>}</section>
  </div>
}
