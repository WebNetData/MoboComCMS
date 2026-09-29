'use client'

import { useCallback, useEffect, useState } from 'react'
import { call, faDate, faNum, useSeller } from '../SellerContext'

type Review = { id: number; rating: number; criteria: Record<string, number>; body: string; reply: string; name: string; createdAt: string }
const CRITERIA: Record<string, string> = { onTime: 'ارسال به‌موقع', asDescribed: 'مطابقت با توضیحات', packaging: 'بسته‌بندی' }

function Reply({ review, onDone }: { review: Review; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.reply)
  if (!open) return <button type="button" className="sa-link" onClick={() => setOpen(true)}>{review.reply ? 'ویرایش پاسخ' : 'پاسخ به خریدار'}</button>
  return <div className="sl-reply-form"><textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} aria-label="پاسخ فروشنده" /><div className="sa-row"><button type="button" className="btn btn-primary btn-sm" onClick={async () => { await call('/api/seller/reviews', 'POST', { id: review.id, reply: text }); setOpen(false); onDone() }}>ثبت پاسخ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>انصراف</button></div></div>
}

export default function SellerReviews() {
  const { seller } = useSeller()
  const [rows, setRows] = useState<Review[] | null>(null)
  const load = useCallback(async () => { const r = await fetch('/api/seller/reviews', { cache: 'no-store' }).catch(() => null); if (r?.ok) setRows((await r.json()).reviews) }, [])
  useEffect(() => { void load() }, [load])
  if (!rows) return <div className="sa-skeleton" aria-busy="true" />
  const average = rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : 0
  const byCriteria = Object.keys(CRITERIA).map((key) => { const values = rows.map((row) => row.criteria[key]).filter(Boolean); return { key, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 } })
  const stars = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((row) => row.rating === star).length }))
  return <div className="sa">
    <header className="sa-head"><h1>امتیاز و نظر خریداران</h1></header>
    <div className="sa-cols">
      <section className="sa-card sl-score">
        <b className="sl-score-big">{rows.length ? average.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : '—'}</b><span>از ۵ · {faNum(rows.length)} امتیاز · {faNum(seller.salesCount)} کالای فروخته‌شده</span>
        <ul className="sl-dist">{stars.map((row) => <li key={row.star}><span>{faNum(row.star)} ★</span><i style={{ width: `${rows.length ? (row.count / rows.length) * 100 : 0}%` }} /><small>{faNum(row.count)}</small></li>)}</ul>
      </section>
      <section className="sa-card"><header className="sa-card-head"><h2>شاخص‌های عملکرد</h2></header>
        <ul className="sl-criteria">{byCriteria.map((row) => <li key={row.key}><span>{CRITERIA[row.key]}</span><meter min={0} max={5} value={row.value} aria-label={CRITERIA[row.key]} /><b>{row.value ? row.value.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : '—'}</b></li>)}</ul>
        <p className="sa-hint">امتیاز بالاتر یعنی نمایش «عملکرد عالی» کنار محصولات شما و اعتماد بیشتر خریداران.</p>
      </section>
    </div>
    <section className="sa-card">
      {rows.length ? <ul className="sl-reviews">{rows.map((row) => <li key={row.id}>
        <div className="sl-review-head"><span className="sl-stars" aria-label={`${row.rating} از ۵`}>{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</span><b>{row.name}</b><small>{faDate(row.createdAt)}</small></div>
        <p>{row.body || 'بدون توضیح'}</p>
        {row.reply && <blockquote className="sl-reply">پاسخ شما: {row.reply}</blockquote>}
        <Reply review={row} onDone={() => void load()} />
      </li>)}</ul> : <p className="sa-empty">هنوز امتیازی ثبت نشده است.</p>}
    </section>
  </div>
}
