'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type Row = { id: number; ownerType: string; title: string; url: string; image: string; subtitle: string; paid: string; createdAt: string }
const TYPE: Record<string, string> = { post: 'مقاله', software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ' }

/** Everything the member bought (or was given): lifetime access, one click back to each item. */
export default function MyPurchases() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/me/purchases', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (response.ok) setRows(body?.purchases || [])
      else setError(body?.error || 'بارگذاری نشد')
    }).catch(() => setError('ارتباط برقرار نشد'))
  }, [])
  return (
    <div className="pw-page">
      <header className="pw-page-head"><h1 className="h2">خریدهای من</h1><p className="muted">فایل‌ها و مقاله‌هایی که خریده‌اید؛ دسترسی شما همیشگی است.</p></header>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!rows && !error && <div className="card muted">در حال بارگذاری…</div>}
      {rows && !rows.length && <div className="card"><p className="muted">هنوز خریدی ندارید. فایل‌ها و مقاله‌های فروشی را در بخش‌های سایت ببینید.</p></div>}
      {rows && rows.length > 0 && <div className="pw-list">
        {rows.map((row) => <div key={row.id} className="pw-row">
          {row.image ? <img src={row.image} alt="" loading="lazy" /> : <span className="pw-ph" aria-hidden="true">{row.title.slice(0, 1)}</span>}
          <div><b>{row.title}</b><small>{TYPE[row.ownerType] || row.ownerType}{row.subtitle ? ` · ${row.subtitle}` : ''} · {row.paid} · {new Date(row.createdAt).toLocaleDateString('fa-IR')}</small></div>
          {row.url ? <Link className="btn btn-primary btn-sm" href={`${row.url}${row.ownerType === 'post' ? '' : '#downloads'}`}>{row.ownerType === 'post' ? 'خواندن' : 'دریافت'}</Link> : <span className="muted text-sm">در دسترس نیست</span>}
        </div>)}
      </div>}
    </div>
  )
}
