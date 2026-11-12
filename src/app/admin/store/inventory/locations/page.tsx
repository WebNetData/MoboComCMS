'use client'
import { Fragment, useState } from 'react'
import { StoreShell, Notice, Pager, send, useJson, faDate } from '../../shared'
import { StockNav, ItemPicker, useLocations, REASON, type Location, type PickedItem } from '../StockKit'
import '../../desk.css'

type Item = { key: string; productId: number; variantId: number | null; name: string; sku: string; barcode: string; online: number; reserve: number; lowStockAt: number; held: number; at: Record<string, number> }
type Movement = { id: number; location: string; delta: number; balance: number; reason: string; orderId: number | null; note: string; actor: string; createdAt: string }
const fa = (value: number) => value.toLocaleString('fa-IR')
const EMPTY = { name: '', kind: 'SHOP', sellsOnline: false, active: true, isDefault: false, sortOrder: 0, address: '' }

function PlaceForm({ value, onDone, onCancel }: { value: Partial<Location> & { id?: number }; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ ...EMPTY, ...value }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const patch = (part: Partial<typeof form>) => setForm({ ...form, ...part })
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const result = await send('/api/admin/store/stock', 'POST', { op: 'location.save', ...form, id: value.id })
    setBusy(false)
    if (result.ok) onDone(); else setError(result.error)
  }
  return <form className="st-form" onSubmit={save}>
    <h3 className="sa-sub-title">{value.id ? `ویرایش ${value.name}` : 'محل تازه'}</h3>
    <fieldset disabled={busy}>
      <label className="cd-field"><span>نام</span><input className="input" required minLength={2} maxLength={60} value={form.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label className="cd-field"><span>نوع</span><select className="input" value={form.kind} onChange={(event) => patch({ kind: event.target.value })}><option value="SHOP">فروشگاه (قفسه)</option><option value="WAREHOUSE">انبار</option></select></label>
      <label className="cd-field"><span>ترتیب برداشت آنلاین</span><input className="input" type="number" min={0} max={1000} value={form.sortOrder} onChange={(event) => patch({ sortOrder: Number(event.target.value) })} /></label>
      <label className="cd-field"><span>نشانی، اختیاری</span><input className="input" maxLength={300} value={form.address} onChange={(event) => patch({ address: event.target.value })} /></label>
    </fieldset>
    <div className="st-checks">
      <label><input type="checkbox" checked={form.sellsOnline} onChange={(event) => patch({ sellsOnline: event.target.checked })} />سایت از این محل می‌فروشد</label>
      <label><input type="checkbox" checked={form.active} disabled={form.isDefault && !!value.isDefault} onChange={(event) => patch({ active: event.target.checked })} />فعال</label>
      {!value.isDefault && <label><input type="checkbox" checked={form.isDefault} onChange={(event) => patch({ isDefault: event.target.checked })} />انبار پیش‌فرض (موجودی کالاهای تازه)</label>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="st-form-actions"><button className="btn btn-primary" type="submit">{busy ? 'در حال ذخیره…' : 'ذخیره'}</button><button className="btn btn-ghost" type="button" onClick={onCancel}>انصراف</button></div>
  </form>
}

function Transfer({ locations, onDone }: { locations: Location[]; onDone: () => void }) {
  const active = locations.filter((row) => row.active)
  const [item, setItem] = useState<PickedItem | null>(null), [from, setFrom] = useState(active[0]?.id || 0), [to, setTo] = useState(active[1]?.id || 0)
  const [quantity, setQuantity] = useState(1), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!item) return
    setBusy(true); setResult(null)
    const response = await send('/api/admin/store/stock', 'POST', { op: 'transfer', productId: item.productId, variantId: item.variantId, from, to, quantity, note })
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setResult({ tone: 'ok', text: `${fa(quantity)} عدد «${item.name}» منتقل شد` }); setItem(null); setQuantity(1); setNote(''); onDone()
  }
  return <section className="sa-card st-form" aria-labelledby="st-transfer"><h2 id="st-transfer" className="sa-sub-title">انتقال بین انبار و فروشگاه</h2>
    {item ? <div className="st-picked"><span>کالا: <b>{item.name}</b></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setItem(null)}>کالای دیگر</button></div> : <ItemPicker onPick={setItem} />}
    <form onSubmit={submit}><fieldset disabled={busy || !item}>
      <label className="cd-field"><span>از</span><select className="input" value={from} onChange={(event) => setFrom(Number(event.target.value))}>{active.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="cd-field"><span>به</span><select className="input" value={to} onChange={(event) => setTo(Number(event.target.value))}>{active.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="cd-field"><span>تعداد</span><input className="input" type="number" min={1} max={1000000} required value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></label>
      <label className="cd-field"><span>توضیح، اختیاری</span><input className="input" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="btn btn-primary" type="submit" disabled={from === to}>{busy ? 'در حال انتقال…' : 'انتقال'}</button>
    </fieldset></form>
    {from === to && item && <p className="sa-hint">مبدأ و مقصد را متفاوت انتخاب کنید.</p>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </section>
}

function Ledger({ item }: { item: Item }) {
  const { data, error } = useJson<{ movements: Movement[] }>(`/api/admin/store/stock?ledger=1&product=${item.productId}${item.variantId ? `&variant=${item.variantId}` : ''}`)
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <p className="sa-hint" role="status">در حال دریافت گردش…</p>
  return <table><thead><tr><th>زمان</th><th>محل</th><th>شرح</th><th>تغییر</th><th>مانده</th><th>کاربر</th></tr></thead><tbody>{data.movements.map((row) => <tr key={row.id}><td>{faDate(row.createdAt, true)}</td><td>{row.location}</td><td>{REASON[row.reason] || row.reason}{row.orderId ? ` · سفارش ${row.orderId.toLocaleString('fa-IR', { useGrouping: false })}` : ''}{row.note ? ` · ${row.note}` : ''}</td><td className={`st-delta ${row.delta > 0 ? 'is-in' : row.delta < 0 ? 'is-out' : ''}`}><bdi dir="ltr">{row.delta > 0 ? '+' : ''}{fa(row.delta)}</bdi></td><td>{fa(row.balance)}</td><td>{row.actor || '—'}</td></tr>)}</tbody></table>
}

export default function StockLocations() {
  const [attempt, setAttempt] = useState(0)
  const { locations, manager, error } = useLocations(attempt)
  const [editing, setEditing] = useState<(Partial<Location> & { id?: number }) | null>(null)
  const [q, setQ] = useState(''), [only, setOnly] = useState(0), [page, setPage] = useState(1)
  const view = useJson<{ page: number; pages: number; total: number; items: Item[] }>(`/api/admin/store/stock?view=1&q=${encodeURIComponent(q)}&page=${page}${only ? `&location=${only}` : ''}&r=${attempt}`)
  const [edits, setEdits] = useState<Record<string, number>>({}), [reserves, setReserves] = useState<Record<number, number>>({})
  const [open, setOpen] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const refresh = () => setAttempt((value) => value + 1)
  const columns = (locations || []).filter((row) => row.active)
  const dirty = Object.keys(edits).length + Object.keys(reserves).length

  async function save() {
    setBusy(true); setResult(null)
    const items = Object.entries(edits).map(([cell, stock]) => { const [key, location] = cell.split('@'); const [productId, variantId] = key.split(':').map(Number); return { productId, variantId: variantId || undefined, stock, locationId: Number(location) } })
    if (items.length) { const response = await send('/api/admin/store/inventory', 'POST', { items }); if (!response.ok) { setBusy(false); setResult({ tone: 'error', text: response.error }); return } }
    for (const [productId, reserve] of Object.entries(reserves)) { const response = await send('/api/admin/store/stock', 'POST', { op: 'reserve.set', productId: Number(productId), reserve }); if (!response.ok) { setBusy(false); setResult({ tone: 'error', text: response.error }); return } }
    setBusy(false); setEdits({}); setReserves({}); setResult({ tone: 'ok', text: 'موجودی‌ها ذخیره و در دفتر گردش ثبت شد' }); refresh()
  }

  return <StoreShell title="انبارها و انتقال">
    <StockNav />
    {error && <Notice tone="error">{error}</Notice>}
    <p className="sa-hint">سایت فقط از محل‌هایی می‌فروشد که «فروش آنلاین» دارند؛ صندوق هر فروشگاه از قفسهٔ همان فروشگاه می‌فروشد. «حاشیهٔ آنلاین» چند عدد آخر را برای فروش حضوری نگه می‌دارد.</p>
    <div className="st-places">
      {locations?.map((row) => <article key={row.id} className={`st-place${row.active ? '' : ' is-off'}`} aria-label={row.name}>
        <header><h3>{row.name}</h3>{manager && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(row)}>ویرایش</button>}</header>
        <div className="st-place-tags"><span className="cd-status">{row.kind === 'SHOP' ? 'فروشگاه' : 'انبار'}</span><span className={`cd-status${row.sellsOnline ? ' is-ok' : ''}`}>{row.sellsOnline ? 'فروش آنلاین' : 'فقط حضوری'}</span>{row.isDefault && <span className="cd-status is-warn">پیش‌فرض</span>}{!row.active && <span className="cd-status is-bad">غیرفعال</span>}</div>
        <dl className="st-place-figures"><div><dt>موجودی</dt><dd className="cd-num">{fa(row.units)}</dd></div><div><dt>قلم کالا</dt><dd className="cd-num">{fa(row.items)}</dd></div><div><dt>صندوق باز</dt><dd className="cd-num">{fa(row.openRegisters)}</dd></div></dl>
      </article>)}
      {manager && !editing && <button type="button" className="st-place-add" onClick={() => setEditing({})}>+ افزودن انبار یا فروشگاه</button>}
    </div>
    {editing && <PlaceForm key={editing.id || 'new'} value={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); refresh() }} />}
    {locations && locations.filter((row) => row.active).length > 1 && <Transfer locations={locations} onDone={refresh} />}

    <section className="sa-card" aria-labelledby="st-matrix-title">
      <header className="sa-card-head"><h2 id="st-matrix-title">موجودی به تفکیک محل</h2><small>{view.data ? `${fa(view.data.total)} قلم` : ''}</small></header>
      <div className="st-matrix-tools">
        <label className="cd-field"><span>نام، کد یا بارکد</span><input className="input" type="search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} /></label>
        <label className="cd-field"><span>فقط کالاهای این محل</span><select className="input" value={only} onChange={(event) => { setOnly(Number(event.target.value)); setPage(1) }}><option value={0}>همهٔ محل‌ها</option>{columns.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      </div>
      {view.error && <Notice tone="error">{view.error}</Notice>}
      <div className="sa-table-wrap" tabIndex={0} role="region" aria-label="جدول موجودی به تفکیک محل">
        <table className="st-matrix">
          <thead><tr><th scope="col">کالا</th>{columns.map((row) => <th scope="col" key={row.id} className="is-num">{row.name}<small>{row.sellsOnline ? 'فروش آنلاین' : 'فقط حضوری'}</small></th>)}<th scope="col" className="is-num">رزرو سفارش‌ها</th><th scope="col" className="is-num">قابل فروش در سایت</th><th scope="col" className="is-num">حاشیهٔ آنلاین</th><th scope="col"><span className="cd-sr">گردش</span></th></tr></thead>
          <tbody>{view.data?.items.map((item) => <Fragment key={item.key}>
            <tr className={columns.some((row) => edits[`${item.key}@${row.id}`] !== undefined) || reserves[item.productId] !== undefined ? 'is-dirty' : ''}>
              <th scope="row">{item.name}<small><bdi dir="ltr">{item.barcode}</bdi>{item.sku && <> · <bdi dir="ltr">{item.sku}</bdi></>}</small></th>
              {columns.map((row) => { const cell = `${item.key}@${row.id}`; return <td key={row.id} className="is-num"><input className="input st-cell cd-num" type="number" min={0} aria-label={`${item.name} در ${row.name}`} value={edits[cell] ?? item.at[row.id] ?? 0} onChange={(event) => { const next = Math.max(0, Math.floor(Number(event.target.value) || 0)); setEdits((all) => { const copy = { ...all }; if (next === (item.at[row.id] ?? 0)) delete copy[cell]; else copy[cell] = next; return copy }) }} /></td> })}
              <td className="is-num">{fa(item.held)}</td>
              <td className={`is-num st-online${item.online === 0 ? ' is-out' : ''}`}>{fa(item.online)}</td>
              <td className="is-num">{manager ? <input className="input st-cell cd-num" type="number" min={0} aria-label={`حاشیهٔ آنلاین ${item.name}`} value={reserves[item.productId] ?? item.reserve} onChange={(event) => setReserves({ ...reserves, [item.productId]: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /> : fa(item.reserve)}</td>
              <td><button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === item.key} onClick={() => setOpen(open === item.key ? '' : item.key)}>گردش</button></td>
            </tr>
            {open === item.key && <tr className="st-ledger"><td colSpan={columns.length + 5}><Ledger item={item} /></td></tr>}
          </Fragment>)}</tbody>
        </table>
      </div>
      {view.data && !view.data.items.length && <p className="sa-empty">کالایی با موجودی محدود پیدا نشد. کالاهای نامحدود و انبار کد اینجا نمی‌آیند.</p>}
      {view.data && <Pager page={view.data.page} pages={view.data.pages} onPage={setPage} />}
    </section>
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    {dirty > 0 && <div className="st-savebar"><span>{fa(dirty)} تغییر ذخیره‌نشده</span><div className="st-form-actions"><button type="button" className="btn btn-ghost" onClick={() => { setEdits({}); setReserves({}) }}>لغو</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}</button></div></div>}
  </StoreShell>
}
