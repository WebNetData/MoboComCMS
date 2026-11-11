'use client'

import { useState } from 'react'
import { AdsShell, Notice, fa, send, useJson } from '../shared'

type Placement = { id: number; key: string; name: string; description: string; width: number; height: number; device: string; kind: string; active: boolean; builtin: boolean; fallbackHtml: string; sortOrder: number; impressions: number; clicks: number; requests: number; fillRate: number | null; activeCampaigns: number }
type Draft = Omit<Placement, 'impressions' | 'clicks' | 'requests' | 'fillRate' | 'activeCampaigns' | 'builtin' | 'id'> & { id?: number; builtin?: boolean }

const EMPTY: Draft = { key: '', name: '', description: '', width: 728, height: 90, device: 'ALL', kind: 'BANNER', active: true, fallbackHtml: '', sortOrder: 0 }
const DEVICE: Record<string, string> = { ALL: 'همهٔ دستگاه‌ها', DESKTOP: 'دسکتاپ', MOBILE: 'موبایل' }

export default function PlacementsPage() {
  const { data, error, reload } = useJson<{ placements: Placement[] }>('/api/admin/ads?view=placements')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!draft) return
    setBusy(true)
    const result = await send('/api/admin/ads', 'POST', { op: 'placement.save', ...draft })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: 'جایگاه ذخیره شد.' }); setDraft(null); void reload()
  }
  async function remove(row: Placement) {
    if (!window.confirm(`جایگاه «${row.name}» حذف شود؟`)) return
    const result = await send('/api/admin/ads', 'POST', { op: 'placement.delete', id: row.id })
    setNotice(result.ok ? { tone: 'ok', text: 'حذف شد.' } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  return <AdsShell title="جایگاه‌های تبلیغاتی" actions={<button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ جایگاه تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {draft && <section className="sa-card ad-form" aria-label="ویرایش جایگاه">
      <header className="sa-card-head"><h2>{draft.id ? 'ویرایش جایگاه' : 'جایگاه تازه'}</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>نام</span><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={80} /></label>
        <label className="sa-field"><span>کلید (انگلیسی)</span><input className="input" dir="ltr" value={draft.key} disabled={!!draft.id} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="blog-sidebar" /><small className="sa-hint">در قالب‌ها و کمپین‌ها به‌کار می‌رود و بعد از ساخت تغییر نمی‌کند.</small></label>
        <label className="sa-field"><span>عرض (px)</span><input className="input" type="number" min={0} max={2000} value={draft.width} onChange={(e) => set('width', Number(e.target.value))} /></label>
        <label className="sa-field"><span>ارتفاع (px)</span><input className="input" type="number" min={0} max={2000} value={draft.height} onChange={(e) => set('height', Number(e.target.value))} /></label>
        <label className="sa-field"><span>دستگاه</span><select className="input" value={draft.device} onChange={(e) => set('device', e.target.value)}>{Object.entries(DEVICE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="sa-field"><span>نوع</span><select className="input" value={draft.kind} onChange={(e) => set('kind', e.target.value)}><option value="BANNER">بنر داخل صفحه</option><option value="STICKY">چسبیده به پایین صفحه</option><option value="PLAYER">پخش‌کنندهٔ فیلم (قبل یا میانه)</option><option value="OVERLAY">روی ویدیو هنگام پخش</option></select></label>
        <label className="sa-field"><span>ترتیب</span><input className="input" type="number" min={0} max={1000} value={draft.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} /></label>
        <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> فعال</label>
      </div>
      <label className="sa-field"><span>توضیح برای تبلیغ‌دهنده‌ها</span><input className="input" value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={240} /></label>
      <label className="sa-field"><span>محتوای جایگزین (HTML، وقتی کمپینی برای این جایگاه نیست)</span><textarea className="input" dir="ltr" rows={4} value={draft.fallbackHtml} onChange={(e) => set('fallbackHtml', e.target.value)} placeholder="<a href='/advertise'>اینجا تبلیغ کنید</a>" /><small className="sa-hint">در قاب ایزوله نمایش داده می‌شود؛ خالی بگذارید تا جایگاه در این حالت دیده نشود.</small></label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </section>}

    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>جایگاه</th><th>اندازه</th><th>دستگاه</th><th>کمپین فعال</th><th>نمایش ۳۰ روز</th><th>نرخ کلیک</th><th>پر شدن</th><th /></tr></thead><tbody>
        {data?.placements.map((row) => <tr key={row.id}>
          <td><b>{row.name}</b> {!row.active && <span className="sa-state">غیرفعال</span>}<small className="sa-sub" dir="ltr">{row.key}</small></td>
          <td className="num" dir="ltr">{row.width && row.height ? `${row.width}×${row.height}` : 'آزاد'}</td>
          <td>{DEVICE[row.device] || row.device}</td>
          <td className="num">{fa(row.activeCampaigns)}</td>
          <td className="num">{fa(row.impressions)}</td>
          <td className="num">{(row.impressions ? (row.clicks / row.impressions) * 100 : 0).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪</td>
          <td className="num" title="درصد درخواست‌هایی که تبلیغی برایشان پیدا شد">{row.fillRate === null ? '—' : `${fa(row.fillRate)}٪`}</td>
          <td><div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...row })}>ویرایش</button>{!row.builtin && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(row)}>حذف</button>}</div></td>
        </tr>)}
        {data && !data.placements.length && <tr><td colSpan={8} className="sa-empty">جایگاهی نیست.</td></tr>}
      </tbody></table>
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>گذاشتن جایگاه در قالب</h2></header>
      <p className="sa-hint">جایگاه‌های پیش‌فرض خودکار در سربرگ، صفحهٔ اصلی، مقاله‌ها، محصول‌ها و پایین سایت نمایش داده می‌شوند. برای جایگاه دلخواه در قالب یا افزونهٔ خودتان:</p>
      <pre className="ad-code" dir="ltr">{`import PromoSlot from '@/components/promo/PromoSlot'\n\n<PromoSlot placement="blog-sidebar" />`}</pre>
    </section>
  </AdsShell>
}
