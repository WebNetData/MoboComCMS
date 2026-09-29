'use client'

import { useState } from 'react'
import { AdsShell, Notice, fa, send, useJson } from '../shared'

type Advertiser = { id: number; userId: number | null; name: string; company: string; email: string; phone: string; website: string; notes: string; status: string; campaigns: number; active: number; impressions: number; clicks: number; spent: string }
type Draft = { id?: number; userId?: number | null; name: string; company: string; email: string; phone: string; website: string; notes: string; status: string }
const EMPTY: Draft = { name: '', company: '', email: '', phone: '', website: '', notes: '', status: 'ACTIVE' }

export default function AdvertisersPage() {
  const [q, setQ] = useState('')
  const { data, error, reload } = useJson<{ advertisers: Advertiser[] }>(`/api/admin/ads?view=advertisers&q=${encodeURIComponent(q)}`)
  const [draft, setDraft] = useState<(Draft & { userId?: number | null }) | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  async function save() {
    if (!draft) return
    const result = await send('/api/admin/ads', 'POST', { op: 'advertiser.save', ...draft })
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: 'ذخیره شد.' }); setDraft(null); void reload()
  }

  return <AdsShell title="تبلیغ‌دهنده‌ها" actions={<button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ تبلیغ‌دهندهٔ تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {draft && <section className="sa-card ad-form" aria-label="ویرایش تبلیغ‌دهنده">
      <header className="sa-card-head"><h2>{draft.id ? 'ویرایش' : 'تبلیغ‌دهندهٔ تازه'}</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>نام</span><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={100} /></label>
        <label className="sa-field"><span>شرکت / برند</span><input className="input" value={draft.company} onChange={(e) => set('company', e.target.value)} maxLength={100} /></label>
        <label className="sa-field"><span>ایمیل</span><input className="input" dir="ltr" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="sa-field"><span>تلفن</span><input className="input" dir="ltr" value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="sa-field"><span>وب‌سایت</span><input className="input" dir="ltr" value={draft.website} onChange={(e) => set('website', e.target.value)} /></label>
        {!draft.id && <label className="sa-field"><span>شناسهٔ کاربر (اختیاری)</span><input className="input" dir="ltr" type="number" min={1} value={draft.userId ?? ''} onChange={(e) => set('userId', e.target.value ? Number(e.target.value) : null)} /><small className="sa-hint">با اتصال به حساب کاربری، خودش از پنل کاربری کمپین‌هایش را می‌بیند.</small></label>}
        <label className="sa-field"><span>وضعیت</span><select className="input" value={draft.status} onChange={(e) => set('status', e.target.value)}><option value="ACTIVE">فعال</option><option value="BLOCKED">مسدود</option></select></label>
      </div>
      <label className="sa-field"><span>یادداشت داخلی</span><textarea className="input" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} /></label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </section>}
    <div className="sa-filters"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی نام، شرکت یا ایمیل…" aria-label="جست‌وجو" /></div>
    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>تبلیغ‌دهنده</th><th>تماس</th><th>کمپین</th><th>نمایش</th><th>کلیک</th><th>هزینه‌کرد</th><th /></tr></thead><tbody>
        {data?.advertisers.map((row) => <tr key={row.id}>
          <td><b>{row.company || row.name}</b> {row.status === 'BLOCKED' && <span className="sa-state is-bad">مسدود</span>}<small className="sa-sub">{row.company ? row.name : ''}{row.userId ? ` · کاربر ${fa(row.userId)}` : ''}</small></td>
          <td className="sa-sub" dir="ltr">{row.email || row.phone || '—'}</td>
          <td className="num">{fa(row.campaigns)}{row.active ? <small> ({fa(row.active)} فعال)</small> : null}</td>
          <td className="num">{fa(row.impressions)}</td><td className="num">{fa(row.clicks)}</td><td>{row.spent}</td>
          <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...row })}>ویرایش</button></td>
        </tr>)}
        {data && !data.advertisers.length && <tr><td colSpan={7} className="sa-empty">تبلیغ‌دهنده‌ای نیست. با خرید بسته از صفحهٔ «تبلیغات» خودکار ساخته می‌شود.</td></tr>}
      </tbody></table>
    </section>
  </AdsShell>
}
