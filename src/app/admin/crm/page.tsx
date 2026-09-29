'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { fa, faDate } from '../store/shared'

type Row = { id: number; name: string; email: string; phone: string; createdAt: string; orders: number; spend: number; lastOrderAt: string | null; segment: { key: string; label: string; tone: string }; tags: string[] }
const SEGMENTS = [['', 'همه'], ['loyal', 'وفادار'], ['active', 'فعال'], ['new', 'تازه'], ['at-risk', 'در خطر ریزش'], ['lost', 'از دست رفته'], ['lead', 'بدون خرید']] as const

/** Customer list for the CRM: value, recency segment and tags; every row opens the full file. */
export default function CrmList() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [segment, setSegment] = useState('')
  const [data, setData] = useState<{ rows: Row[]; tags: { tag: string; count: number }[] } | null>(null)
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/crm?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&segment=${segment}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setData(await response.json())
  }, [q, tag, segment])
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer) }, [load])
  return <div className="sa" dir="rtl">
    <header className="sa-head"><div><h1>پروندهٔ مشتریان</h1><p className="sa-hint">ارزش خرید، آخرین خرید و وضعیت هر مشتری؛ با کلیک، همهٔ سفارش‌ها، تیکت‌ها و گفت‌وگوها در یک صفحه.</p></div></header>
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head">
        <div className="crm-filters">{SEGMENTS.map(([value, label]) => <button key={value} type="button" className={segment === value ? 'is-active' : ''} aria-pressed={segment === value} onClick={() => setSegment(value)}>{label}</button>)}</div>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، ایمیل، موبایل یا شناسه…" aria-label="جست‌وجو" />
      </header>
      {data?.tags.length ? <div className="crm-tags sa-row">برچسب‌ها: {data.tags.map((row) => <button key={row.tag} type="button" className="crm-tag" aria-pressed={tag === row.tag} onClick={() => setTag(tag === row.tag ? '' : row.tag)} style={tag === row.tag ? { outline: '2px solid var(--primary)' } : undefined}>{row.tag} ({fa(row.count)})</button>)}</div> : null}
      {!data ? <div className="sa-skeleton" /> : <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>مشتری</th><th>وضعیت</th><th>سفارش</th><th>مجموع خرید</th><th>آخرین خرید</th><th>برچسب</th></tr></thead><tbody>
        {data.rows.map((row) => <tr key={row.id}>
          <td><Link className="sa-link" href={`/admin/crm/${row.id}`}>{row.name || row.email}</Link><small className="sa-sub" dir="ltr">{row.phone || row.email}</small></td>
          <td><span className={`crm-seg is-${row.segment.tone}`}>{row.segment.label}</span></td>
          <td className="num">{fa(row.orders)}</td>
          <td className="num">{fa(row.spend)} تومان</td>
          <td>{row.lastOrderAt ? faDate(row.lastOrderAt) : '—'}</td>
          <td><div className="crm-tags">{row.tags.map((t) => <span key={t} className="crm-tag">{t}</span>)}</div></td>
        </tr>)}
        {!data.rows.length && <tr><td colSpan={6} className="sa-empty">مشتری‌ای با این شرایط نیست.</td></tr>}
      </tbody></table>}
    </section>
  </div>
}
