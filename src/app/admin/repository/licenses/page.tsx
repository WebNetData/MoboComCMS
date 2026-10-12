'use client'

import { useState } from 'react'
import { Notice, RepoShell, fa, faDate, send, useJson } from '../shared'
import PurchaseRecovery from './PurchaseRecovery'

type License = { id: number; key: string; product: string; slug: string; email: string; source: string; status: string; siteLimit: number; paid: string; note: string; createdAt: string; updatesUntil: string; sites: { site: string; active: boolean; lastSeenAt: string; coreVersion: string }[] }
type List = { rows: License[]; total: number; page: number; pages: number; canRecoverPurchases?: boolean }

export default function LicensesPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<List>(`/api/admin/repository?view=licenses&q=${encodeURIComponent(q)}&status=${status}&page=${page}`)
  const products = useJson<{ products: { id: number; name: string }[] }>('/api/admin/repository?view=products')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [grant, setGrant] = useState<{ productId: number; email: string; note: string } | null>(null)
  const [given, setGiven] = useState('')

  async function op(body: Record<string, unknown>, ok: string) { const r = await send('/api/admin/repository', 'POST', body); setNotice(r.ok ? { tone: 'ok', text: ok } : { tone: 'error', text: r.error }); if (r.ok) void reload(); return r }
  async function doGrant() {
    if (!grant?.productId) return
    const r = await send<{ key: string }>('/api/admin/repository', 'POST', { op: 'license.grant', ...grant })
    if (!r.ok) { setNotice({ tone: 'error', text: r.error }); return }
    setGiven(r.data.key); setGrant(null); void reload()
  }

  return <RepoShell title="لایسنس‌ها" actions={<button type="button" className="btn btn-primary" onClick={() => { setGiven(''); setGrant({ productId: products.data?.products[0]?.id || 0, email: '', note: '' }) }}>+ صدور لایسنس رایگان</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {given && <Notice tone="ok">کلید ساخته شد (فقط همین‌جا کامل دیده می‌شود؛ خریداران در پنل خود می‌بینند): <code dir="ltr">{given}</code></Notice>}
    {data?.canRecoverPurchases && <PurchaseRecovery onRecovered={() => void reload()} />}
    {grant && <section className="sa-card rp-form" aria-label="صدور لایسنس">
      <header className="sa-card-head"><h2>صدور لایسنس</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>محصول</span><select className="input" value={grant.productId} onChange={(e) => setGrant({ ...grant, productId: Number(e.target.value) })}>{products.data?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="sa-field"><span>ایمیل دریافت‌کننده</span><input className="input" dir="ltr" type="email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} /></label>
      </div>
      <label className="sa-field"><span>یادداشت</span><input className="input" value={grant.note} maxLength={300} onChange={(e) => setGrant({ ...grant, note: e.target.value })} /></label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void doGrant()}>صدور</button><button type="button" className="btn btn-ghost" onClick={() => setGrant(null)}>انصراف</button></div>
    </section>}
    <div className="sa-filters">
      <div className="ad-range" role="group" aria-label="وضعیت">{[['', 'همه'], ['ACTIVE', 'فعال'], ['REVOKED', 'باطل']].map(([k, label]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1) }}>{label}</button>)}</div>
      <input className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="ایمیل، یادداشت، ۵ نویسهٔ آخر کلید یا نشانی سایت…" aria-label="جست‌وجو" />
    </div>
    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>لایسنس</th><th>محصول</th><th>خریدار</th><th>سایت‌ها</th><th>به‌روزرسانی تا</th><th /></tr></thead><tbody>
        {data?.rows.map((l) => <tr key={l.id}>
          <td><code dir="ltr">{l.key}</code> {l.status === 'REVOKED' && <span className="sa-state is-bad">باطل</span>}<small className="sa-sub">{faDate(l.createdAt)}{l.paid ? ` · ${l.paid}` : ' · هدیه'}{l.note && !l.note.startsWith('buy:') ? ` · ${l.note}` : ''}</small></td>
          <td>{l.product}</td><td dir="ltr">{l.email || '—'}</td>
          <td>{l.sites.filter((s) => s.active).map((s) => <div key={s.site} className="rp-site"><span dir="ltr">{s.site}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => void op({ op: 'license.site', id: l.id, site: s.site }, 'جای سایت آزاد شد.')}>آزاد کن</button></div>)}<small className="sa-sub">{fa(l.sites.filter((s) => s.active).length)} از {l.siteLimit ? fa(l.siteLimit) : 'نامحدود'}</small></td>
          <td>{l.updatesUntil ? faDate(l.updatesUntil) : 'همیشه'}</td>
          <td><div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (l.status === 'ACTIVE' ? window.confirm('لایسنس باطل شود؟ سایت‌ها در بررسی بعدی بسته را غیرفعال می‌کنند.') : true) void op({ op: 'license.status', id: l.id, status: l.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE' }, l.status === 'ACTIVE' ? 'باطل شد.' : 'دوباره فعال شد.') }}>{l.status === 'ACTIVE' ? 'ابطال' : 'فعال‌سازی'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const days = Number(window.prompt('چند روز تمدید شود؟', '365')); if (days > 0) void op({ op: 'license.extend', id: l.id, days }, 'تمدید شد.') }}>تمدید</button></div></td>
        </tr>)}
        {data && !data.rows.length && <tr><td colSpan={6} className="sa-empty">لایسنسی پیدا نشد.</td></tr>}
      </tbody></table>
    </section>
    {data && data.pages > 1 && <nav className="sa-pager"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{fa(page)} از {fa(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
  </RepoShell>
}
