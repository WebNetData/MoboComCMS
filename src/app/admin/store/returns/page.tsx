'use client'

import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { Money, Notice, Pager, RETURN_TONE, StoreShell, fa, faDate, useJson } from '../shared'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Row = {
  id: number; number: string; kind: 'CANCEL' | 'RETURN'; kindLabel: string; status: string; statusLabel: string; reasonLabel: string
  requested: number; refund: number; currency: string; createdAt: string; orderId: number; photos: string[]
  lines: { name: string; quantity: number; image: string }[]; customerName?: string; customerPhone?: string; customer: { name: string; email: string; phone: string } | null
}
type Settings = { enabled: boolean; windowDays: number; cancelBefore: 'PROCESSING' | 'PACKED' | 'SHIPPED'; autoRefundCancel: boolean; requirePhotos: boolean; codeReturnDays: number; policy: string }
type List = { tab: string; page: number; pages: number; counts: Record<string, number>; tabs: { key: string; label: string }[]; rows: Row[]; settings: Settings; settingsRevision?: string }

function SettingsCard({ initial, initialRevision }: { initial: Settings; initialRevision: string }) {
  const [settings, setSettings] = useState(initial)
  const [revision, setRevision] = useState(initialRevision)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/store/returns', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(revision ? { 'If-Match': revision } : {}) }, body: JSON.stringify({ settings }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    setSettings(data.settings); setRevision(data.settingsRevision || ''); setNotice({ tone: 'ok', text: 'قوانین مرجوعی ذخیره شد.' })
  }
  return <form className="sa-card sa-form" onSubmit={save}>
    <header className="sa-card-head"><h2>قوانین لغو و مرجوعی</h2><SectionSettingsHistoryLink section="returns" /></header>
    <label className="sa-check"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />مشتری بتواند از صفحهٔ سفارش درخواست لغو یا مرجوعی ثبت کند</label>
    <div className="sa-grid">
      <label className="sa-field"><span>مهلت مرجوعی پس از تحویل (روز)</span><input className="input num" type="number" min={0} max={365} value={settings.windowDays} onChange={(e) => setSettings({ ...settings, windowDays: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>مهلت برگشت کدِ تحویل‌شده (روز؛ صفر یعنی کد برگشت ندارد)</span><input className="input num" type="number" min={0} max={60} value={settings.codeReturnDays ?? 0} onChange={(e) => setSettings({ ...settings, codeReturnDays: Number(e.target.value) })} /><small className="sa-sub">کدی که برگشت می‌خورد باطل می‌شود و دوباره فروخته نمی‌شود؛ هر درخواست را خودتان بررسی و تأیید می‌کنید.</small></label>
      <label className="sa-field"><span>لغو توسط مشتری تا پیش از</span><select className="select" value={settings.cancelBefore} onChange={(e) => setSettings({ ...settings, cancelBefore: e.target.value as Settings['cancelBefore'] })}>
        <option value="PROCESSING">شروع پردازش</option><option value="PACKED">بسته‌بندی</option><option value="SHIPPED">تحویل به مرسوله‌رسان</option>
      </select></label>
    </div>
    <label className="sa-check"><input type="checkbox" checked={settings.autoRefundCancel} onChange={(e) => setSettings({ ...settings, autoRefundCancel: e.target.checked })} />لغو پیش از ارسال بدون بررسی، فوراً به کیف پول برگردد و موجودی به انبار برگردد</label>
    <label className="sa-check"><input type="checkbox" checked={settings.requirePhotos} onChange={(e) => setSettings({ ...settings, requirePhotos: e.target.checked })} />برای کالای معیوب، اشتباه یا ناقص، عکس الزامی باشد</label>
    <label className="sa-field"><span>متن قوانین (روی فرم درخواست نمایش داده می‌شود)</span><textarea className="input" rows={4} maxLength={1200} value={settings.policy} onChange={(e) => setSettings({ ...settings, policy: e.target.value })} /></label>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
  </form>
}

function Returns() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get('tab') || 'open'
  const page = Number(params.get('page')) || 1
  const q = params.get('q') || ''
  const [search, setSearch] = useState(q)
  useEffect(() => setSearch(q), [q])
  const { data, error, loading } = useJson<List>(`/api/admin/store/returns?${new URLSearchParams({ tab, page: String(page), ...(q ? { q } : {}) })}`)
  const go = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams({ tab, ...(q ? { q } : {}) })
    for (const [key, value] of Object.entries(patch)) if (value) next.set(key, String(value)); else next.delete(key)
    if (!('page' in patch)) next.delete('page')
    router.push(`/admin/store/returns?${next}`)
  }
  return <StoreShell title="لغو و مرجوعی">
    <nav className="sa-subtabs" aria-label="وضعیت درخواست">{(data?.tabs || []).map((item) => <button key={item.key} type="button" className={item.key === tab ? 'is-active' : ''} aria-pressed={item.key === tab} onClick={() => go({ tab: item.key })}>{item.label}{data?.counts[item.key] && item.key !== 'all' ? <span className="num">{fa(data.counts[item.key])}</span> : null}</button>)}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim() }) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="شمارهٔ درخواست (RMA-…) یا شمارهٔ سفارش" aria-label="جست‌وجوی درخواست" />
      <button className="btn btn-primary" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="sa-cols rt-cols">
      <div>
        <div className="sa-card sa-table-wrap" aria-busy={loading}>
          <table className="data sa-table">
            <thead><tr><th>درخواست</th><th>مشتری</th><th>کالاها</th><th>دلیل</th><th>وضعیت</th><th>مبلغ</th></tr></thead>
            <tbody>
              {data?.rows.map((row) => <tr key={row.id} className="is-link" onClick={() => router.push(`/admin/store/returns/${row.id}`)}>
                <td><Link href={`/admin/store/returns/${row.id}`} className="sa-link num" dir="ltr" onClick={(event) => event.stopPropagation()}>{row.number}</Link><small className="sa-sub">{row.kindLabel} · سفارش {fa(row.orderId)}</small><small className="sa-sub">{faDate(row.createdAt, true)}</small></td>
                <td><b>{row.customer?.name || row.customerName || 'خریدار مهمان'}</b><small className="sa-sub" dir="ltr">{row.customer?.phone || row.customerPhone || row.customer?.email || ''}</small></td>
                <td><span className="sa-thumbs">{row.lines.slice(0, 4).map((line, index) => line.image ? <img key={index} src={line.image} alt={line.name} title={`${line.name} × ${line.quantity}`} /> : <span key={index} className="sa-ph" title={line.name} />)}</span><small className="sa-sub num">{fa(row.lines.reduce((sum, line) => sum + line.quantity, 0))} عدد{row.photos.length ? ` · ${fa(row.photos.length)} عکس` : ''}</small></td>
                <td><small>{row.reasonLabel}</small></td>
                <td><span className={`sa-state ${RETURN_TONE[row.status] || ''}`}>{row.statusLabel}</span></td>
                <td><Money value={row.status === 'REFUNDED' ? row.refund : row.requested} currency={row.currency} /></td>
              </tr>)}
              {data && !data.rows.length && <tr><td colSpan={6} className="sa-empty">درخواستی در این بخش نیست.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager page={data.page} pages={data.pages} onPage={(next) => go({ page: next })} />}
      </div>
      {data && <SettingsCard initial={data.settings} initialRevision={data.settingsRevision || ''} />}
    </div>
  </StoreShell>
}

export default function StoreReturnsPage() {
  return <Suspense fallback={null}><Returns /></Suspense>
}
