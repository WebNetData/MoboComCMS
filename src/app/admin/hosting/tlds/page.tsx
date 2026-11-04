'use client'

import { useState } from 'react'
import { Notice, fa, send, useJson } from '../../store/shared'
import { HostingShell, toman } from '../shared'

type Tld = { id: number; suffix: string; registerMinor: string; renewMinor: string; transferMinor: string; years: string; needsHandle: boolean; active: boolean; featured: boolean; sort: number; domains: number; registrar: { name: string } | null }
type Draft = Omit<Tld, 'id' | 'domains' | 'registrar'> & { id?: number }
const EMPTY: Draft = { suffix: '', registerMinor: '', renewMinor: '', transferMinor: '0', years: '1,2,3,5', needsHandle: false, active: true, featured: true, sort: 0 }
const digits = (value: string) => value.replace(/[^\d]/g, '')

export default function HostingTldsPage() {
  const { data, error, reload } = useJson<{ tlds: Tld[] }>('/api/admin/hosting/tlds')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const result = await send('/api/admin/hosting/tlds', 'POST', body)
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
    return result.ok
  }
  const suffix = (draft?.suffix || '').replace(/^\./, '').toLowerCase()
  const isIr = suffix === 'ir' || suffix.endsWith('.ir')

  return <HostingShell title="پسوندها و قیمت دامنه" hint="هر پسوند با قیمت ثبت، تمدید و انتقال (به تومان، برای یک سال) و مدت‌های مجاز. پسوندهای «پیشنهادی» در جست‌وجو همیشه بررسی می‌شوند."
    actions={!draft && <button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setDraft({ ...EMPTY }) }}>پسوند تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {draft && <section className="sa-card hx-form" aria-label="پسوند">
      <header className="sa-card-head"><h2>{draft.id ? `ویرایش .${draft.suffix}` : 'پسوند تازه'}</h2></header>
      <div className="hx-row">
        <label className="sa-field"><span>پسوند *</span><input className="input" dir="ltr" value={draft.suffix} placeholder="ir یا co.ir یا com" disabled={Boolean(draft.id)} onChange={(event) => set('suffix', event.target.value)} /></label>
        <label className="sa-field"><span>ثبت، یک سال (تومان) *</span><input className="input" dir="ltr" inputMode="numeric" value={draft.registerMinor} onChange={(event) => set('registerMinor', digits(event.target.value))} /></label>
        <label className="sa-field"><span>تمدید، یک سال (تومان) *</span><input className="input" dir="ltr" inputMode="numeric" value={draft.renewMinor} onChange={(event) => set('renewMinor', digits(event.target.value))} /></label>
        <label className="sa-field"><span>انتقال (تومان، ۰ = بدون انتقال)</span><input className="input" dir="ltr" inputMode="numeric" value={draft.transferMinor} onChange={(event) => set('transferMinor', digits(event.target.value) || '0')} /></label>
        <label className="sa-field"><span>مدت‌های مجاز (سال، با ویرگول)</span><input className="input" dir="ltr" value={draft.years} placeholder={isIr ? '1,5' : '1,2,3,5'} onChange={(event) => set('years', event.target.value)} /></label>
        <label className="sa-field"><span>ترتیب</span><input className="input" dir="ltr" inputMode="numeric" value={String(draft.sort)} onChange={(event) => set('sort', Number(digits(event.target.value)) || 0)} /></label>
      </div>
      <label className="sa-check"><input type="checkbox" checked={draft.needsHandle || (!draft.id && isIr)} onChange={(event) => set('needsHandle', event.target.checked)} />شناسهٔ ایرنیک لازم است (برای .ir)</label>
      <label className="sa-check"><input type="checkbox" checked={draft.featured} onChange={(event) => set('featured', event.target.checked)} />پیشنهادی: در هر جست‌وجو بررسی شود</label>
      <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(event) => set('active', event.target.checked)} />فعال و قابل سفارش</label>
      <div className="hx-save">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run({ op: 'save', tld: { ...draft, needsHandle: draft.needsHandle || (!draft.id && isIr) } }, 'پسوند ذخیره شد.').then((done) => done && setDraft(null))}>ذخیره</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>انصراف</button>
      </div>
    </section>}
    {!draft && <section className="sa-card" aria-label="فهرست پسوندها">
      {data && !data.tlds.length && <div className="hx-empty"><h2>هنوز پسوندی تعریف نشده است</h2><p className="sa-hint">ir، co.ir، com و دیگر پسوندها را با قیمت ثبت و تمدید اضافه کنید.</p></div>}
      {data && data.tlds.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>پسوند</th><th>ثبت</th><th>تمدید</th><th>انتقال</th><th>مدت</th><th>دامنه‌ها</th><th>وضعیت</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.tlds.map((row) => <tr key={row.id}>
          <td><b dir="ltr">.{row.suffix}</b>{row.featured && <span className="sa-state is-info">پیشنهادی</span>}{row.needsHandle && <div className="hx-spec">شناسهٔ ایرنیک</div>}</td>
          <td>{toman(row.registerMinor)}</td><td>{toman(row.renewMinor)}</td><td>{row.transferMinor !== '0' ? toman(row.transferMinor) : '—'}</td>
          <td>{row.years}</td><td className="num">{fa(row.domains)}</td>
          <td><span className={`sa-state ${row.active ? 'is-ok' : ''}`}>{row.active ? 'فعال' : 'غیرفعال'}</span></td>
          <td><div className="hx-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setNotice(null); setDraft({ id: row.id, suffix: row.suffix, registerMinor: row.registerMinor, renewMinor: row.renewMinor, transferMinor: row.transferMinor, years: row.years, needsHandle: row.needsHandle, active: row.active, featured: row.featured, sort: row.sort }) }}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || row.domains > 0} title={row.domains ? 'پسوند دارای دامنه حذف نمی‌شود' : undefined} onClick={() => { if (window.confirm(`پسوند .${row.suffix} حذف شود؟`)) void run({ op: 'delete', id: row.id }, 'پسوند حذف شد.') }}>حذف</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </HostingShell>
}
