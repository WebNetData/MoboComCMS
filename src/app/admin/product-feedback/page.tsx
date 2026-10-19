'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { RatingChip, RatingMeter } from '@/components/engage/RatingMeter'

type Item = { id: number; status: string; body: string; title?: string; rating?: number; answer?: string; guestName?: string; product: { name: string; slug: string }; user: { name: string; email: string } | null }
export default function ProductFeedbackPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [kind, setKind] = useState<'review' | 'question'>('review')
  const [status, setStatus] = useState('PENDING')
  const [items, setItems] = useState<Item[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const load = useCallback(() => { fetch(`/api/admin/product-feedback?kind=${kind}&status=${status}`).then(r => r.ok ? r.json() : { items: [] }).then(data => setItems(data.items || [])) }, [kind, status])
  useEffect(load, [load])
  async function moderate(item: Item, next: string) {
    const res = await fetch('/api/admin/product-feedback', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, kind, status: next, answer: answers[item.id] ?? item.answer ?? '' }) })
    if (!res.ok) { const body = await res.json().catch(() => null); setError(body?.error || 'Save failed'); return }
    setError(''); load()
  }
  return <div className="cms-workspace"><div className="mb-6"><span className="content-eyebrow">فروشگاه</span><h1 className="h2 mt-3">{fa ? 'دیدگاه‌ها و پرسش‌های محصولات' : 'Product reviews and questions'}</h1><p className="muted text-sm mt-3">{fa ? 'دیدگاه‌ها فقط از خریداران تأییدشده پذیرفته می‌شوند؛ همه، حتی مهمانان، می‌توانند پرسش ثبت کنند.' : 'Reviews require a verified purchase; everyone, including guests, can ask a question.'}</p></div><div className="flex gap-2 flex-wrap mb-6"><select className="select" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="review">{fa ? 'دیدگاه‌ها' : 'Reviews'}</option><option value="question">{fa ? 'پرسش‌ها' : 'Questions'}</option></select><select className="select" value={status} onChange={e => setStatus(e.target.value)}><option value="PENDING">{fa ? 'در انتظار بررسی' : 'Pending'}</option><option value="APPROVED">{fa ? 'تأییدشده' : 'Approved'}</option><option value="REJECTED">{fa ? 'ردشده' : 'Rejected'}</option><option value="ALL">{fa ? 'همه' : 'All'}</option></select></div>{error && <p className="error-text">{error}</p>}<div className="store-admin-list">{items.map(item => <article className="card" key={item.id}><Link href={`/products/${item.product.slug}`} target="_blank"><strong>{item.product.name}</strong></Link><p className="muted text-sm">{item.user?.name || item.user?.email || item.guestName || (fa ? 'مهمان' : 'Guest')} · {item.status}</p>{item.rating && <div className="rv-inline"><RatingChip value={item.rating} /><RatingMeter size="sm" value={item.rating} label={`${item.rating} از ۵`} /></div>}{item.title && <h3>{item.title}</h3>}<p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{item.body}</p>{kind === 'question' && <label className="store-admin-field"><span>{fa ? 'پاسخ فروشگاه' : 'Store answer'}</span><textarea className="textarea" value={answers[item.id] ?? item.answer ?? ''} onChange={e => setAnswers(old => ({ ...old, [item.id]: e.target.value }))} /></label>}<div className="flex gap-2 mt-4"><button className="btn btn-primary" onClick={() => moderate(item, 'APPROVED')}>{fa ? 'تأیید' : 'Approve'}</button><button className="btn btn-ghost" onClick={() => moderate(item, 'REJECTED')}>{fa ? 'رد' : 'Reject'}</button></div></article>)}</div>{items.length === 0 && <p className="muted">{fa ? 'موردی یافت نشد.' : 'No items found.'}</p>}</div>
}
