'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { call, faNum } from '../SellerContext'

type Row = { id: number; slug: string; name: string; image: string; category: string; price: number; currency: string; stock: number; active: boolean; approval: string; approvalNote: string; soldCount: number; views: number; variants: number }
type List = { rows: Row[]; total: number; page: number; pages: number; counts: Record<string, number> }

const TABS = [['', 'همه'], ['active', 'در حال فروش'], ['inactive', 'غیرفعال'], ['pending', 'در انتظار تأیید'], ['rejected', 'ردشده'], ['out', 'ناموجود']] as const
const APPROVAL: Record<string, [string, string]> = { APPROVED: ['تأییدشده', 'is-ok'], PENDING: ['در انتظار تأیید', 'is-warn'], REJECTED: ['ردشده', 'is-bad'] }

function StockCell({ row, onSaved }: { row: Row; onSaved: (message: string, ok: boolean) => void }) {
  const [value, setValue] = useState(row.stock < 0 ? '' : String(row.stock))
  const [price, setPrice] = useState(String(row.price))
  const dirty = value !== (row.stock < 0 ? '' : String(row.stock)) || price !== String(row.price)
  async function save() {
    const result = await call('/api/seller/products', 'PATCH', { id: row.id, stock: value, price })
    onSaved(result.ok ? `«${row.name}» به‌روز شد` : result.error, result.ok)
  }
  return <div className="sl-inline">
    <label><span className="sr-only">موجودی</span><input className="input" dir="ltr" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="∞" aria-label={`موجودی ${row.name}`} disabled={row.variants > 0} title={row.variants > 0 ? 'موجودی تنوع‌ها را در ویرایش محصول تغییر دهید' : ''} /></label>
    <label><span className="sr-only">قیمت</span><input className="input" dir="ltr" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`قیمت ${row.name}`} /></label>
    {dirty && <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>ثبت</button>}
  </div>
}

export default function SellerProducts() {
  const [status, setStatus] = useState('')
  useEffect(() => { setStatus(new URLSearchParams(window.location.search).get('status') || '') }, [])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<List | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/seller/products?status=${status}&q=${encodeURIComponent(q)}&page=${page}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setData(await response.json())
  }, [status, q, page])
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer) }, [load])

  async function toggle(row: Row) {
    const result = await call('/api/seller/products', 'PATCH', { id: row.id, active: !row.active })
    setNotice({ ok: result.ok, text: result.ok ? (row.active ? 'محصول از فروش خارج شد' : 'محصول در فروش قرار گرفت') : result.error })
    void load()
  }

  const total = Object.values(data?.counts || {}).reduce((sum, n) => sum + n, 0)
  return <div className="sa">
    <header className="sa-head"><h1>محصولات من</h1><div className="sa-head-actions"><Link href="/seller/products/new" className="btn btn-primary">+ افزودن محصول</Link></div></header>
    <nav className="sa-subtabs" aria-label="وضعیت">{TABS.map(([value, label]) => <button key={value} type="button" className={status === value ? 'is-active' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }}>{label}{value === '' && total ? ` (${faNum(total)})` : value === 'pending' && data?.counts.PENDING ? ` (${faNum(data.counts.PENDING)})` : value === 'rejected' && data?.counts.REJECTED ? ` (${faNum(data.counts.REJECTED)})` : ''}</button>)}</nav>
    {notice && <p className={`sa-notice ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">{notice.text}</p>}
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><input className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="جست‌وجوی نام یا SKU…" aria-label="جست‌وجو" /></header>
      {!data ? <div className="sa-skeleton" /> : <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>محصول</th><th>وضعیت</th><th>موجودی و قیمت (تومان)</th><th>فروش</th><th>بازدید</th><th /></tr></thead><tbody>
        {data.rows.map((row) => <tr key={row.id}>
          <td><div className="sa-prod">{row.image ? <img src={row.image} alt="" width={44} height={44} /> : <span className="sa-prod-ph" />}<div><Link className="sa-link" href={`/seller/products/${row.id}`}>{row.name}</Link><small className="sa-sub">{row.category || 'بدون دسته'}{row.variants ? ` · ${faNum(row.variants)} تنوع` : ''}</small></div></div></td>
          <td><span className={`sa-state ${(APPROVAL[row.approval] || ['', ''])[1]}`}>{(APPROVAL[row.approval] || [row.approval])[0]}</span>{row.approval === 'REJECTED' && row.approvalNote && <small className="sa-sub sl-reject">{row.approvalNote}</small>}{row.approval === 'APPROVED' && <button type="button" className={`sl-switch${row.active ? ' is-on' : ''}`} role="switch" aria-checked={row.active} onClick={() => void toggle(row)}>{row.active ? 'در حال فروش' : 'متوقف'}</button>}</td>
          <td><StockCell key={`${row.id}-${row.stock}-${row.price}`} row={row} onSaved={(text, ok) => { setNotice({ ok, text }); void load() }} /></td>
          <td className="num">{faNum(row.soldCount)}</td>
          <td className="num">{faNum(row.views)}</td>
          <td><div className="sa-row-actions"><Link className="sa-link" href={`/seller/products/${row.id}`}>ویرایش</Link>{row.active && <a className="sa-link" href={`/products/${row.slug}`} target="_blank" rel="noreferrer">مشاهده</a>}</div></td>
        </tr>)}
        {!data.rows.length && <tr><td colSpan={6} className="sa-empty">{status || q ? 'محصولی با این شرایط نیست.' : <>هنوز محصولی ثبت نکرده‌اید. <Link href="/seller/products/new" className="sa-link">اولین محصول را اضافه کنید</Link>.</>}</td></tr>}
      </tbody></table>}
      {data && data.pages > 1 && <nav className="sa-pager" aria-label="صفحه‌بندی"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{faNum(page)} از {faNum(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
    </section>
  </div>
}
