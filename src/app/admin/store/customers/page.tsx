'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Money, Notice, Pager, StoreShell, fa, faDate, useJson } from '../shared'

type Customer = { id: number; name: string; email: string; phone: string; joined: string | null; addresses: number; orders: number; spent: number; currency: string; lastOrder: string | null }

export default function CustomersPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading } = useJson<{ page: number; pages: number; total: number; customers: Customer[] }>(`/api/admin/store/customers?${new URLSearchParams({ q, sort, page: String(page) })}`)
  return <StoreShell title="مشتریان فروشگاه">
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); setQ(search.trim()); setPage(1) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام، ایمیل یا موبایل" aria-label="جست‌وجوی مشتری" />
      <label className="sa-inline"><span>ترتیب</span><select className="select" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="">بیشترین خرید</option><option value="orders">بیشترین سفارش</option><option value="recent">آخرین خرید</option></select></label>
      <button type="submit" className="btn btn-ghost">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {data && <p className="sa-hint num">{fa(data.total)} مشتری با حداقل یک سفارش موفق</p>}
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table"><thead><tr><th>مشتری</th><th>سفارش‌ها</th><th>مجموع خرید</th><th>آخرین خرید</th><th>آدرس‌ها</th><th /></tr></thead>
        <tbody>{data?.customers.map((customer) => <tr key={customer.id}>
          <td><b>{customer.name || '—'}</b><small className="sa-sub" dir="ltr">{customer.email}{customer.phone && ` · ${customer.phone}`}</small></td>
          <td className="num">{fa(customer.orders)}</td>
          <td><Money value={customer.spent} currency={customer.currency} /></td>
          <td>{customer.lastOrder ? faDate(customer.lastOrder) : '—'}</td>
          <td className="num">{fa(customer.addresses)}</td>
          <td><div className="sa-row-actions"><Link className="sa-link" href={`/admin/store/orders?q=${encodeURIComponent(customer.email)}`}>سفارش‌ها</Link><Link className="sa-link" href={`/admin/users?q=${encodeURIComponent(customer.email)}`}>حساب</Link></div></td>
        </tr>)}
        {data && !data.customers.length && <tr><td colSpan={6} className="sa-empty">مشتری‌ای پیدا نشد.</td></tr>}</tbody>
      </table>
    </div>
    {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
  </StoreShell>
}
