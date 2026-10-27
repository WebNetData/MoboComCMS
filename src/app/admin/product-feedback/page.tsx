'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { RatingChip, RatingMeter } from '@/components/engage/RatingMeter'
import styles from './feedback.module.css'

type Kind = 'review' | 'question'
type Item = { id: number; status: string; body: string; title?: string; rating?: number; answer?: string; guestName?: string; product: { name: string; slug: string }; user: { name: string; email: string } | null }

export default function ProductFeedbackPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [kind, setKind] = useState<Kind>('review')
  const [status, setStatus] = useState('PENDING')
  const [data, setData] = useState<{ kind: Kind; status: string; items: Item[] } | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setData(null)
    async function load() {
      try {
        const response = await fetch(`/api/admin/product-feedback?${new URLSearchParams({ kind, status })}`, { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'دریافت اطلاعات انجام نشد')
        if (!controller.signal.aborted) setData({ kind, status, items: body.items || [] })
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'دریافت اطلاعات انجام نشد')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [kind, status, reload])
  const items = data?.kind === kind && data.status === status ? data.items : []
  async function moderate(item: Item, next: string) {
    setBusyId(item.id); setError('')
    try {
      const res = await fetch('/api/admin/product-feedback', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, kind, status: next, answer: answers[item.id] ?? item.answer ?? '' }) })
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || 'ذخیره نشد') }
      setReload(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'ذخیره نشد') }
    finally { setBusyId(null) }
  }
  return <div className={`cms-workspace ${styles.page}`}>
    <header className="mb-6"><span className="content-eyebrow">فروشگاه</span><h1 className="h2 mt-3">{fa ? 'دیدگاه‌ها و پرسش‌های محصولات' : 'Product reviews and questions'}</h1><p className="muted text-sm mt-3">{fa ? 'دیدگاه‌ها فقط از خریداران تأییدشده پذیرفته می‌شوند؛ همه، حتی مهمانان، می‌توانند پرسش ثبت کنند.' : 'Reviews require a verified purchase; everyone, including guests, can ask a question.'}</p></header>
    <section className={styles.filters} aria-label={fa ? 'فیلتر دیدگاه‌ها و پرسش‌ها' : 'Feedback filters'}>
      <label className={styles.field}><span>{fa ? 'نوع محتوا' : 'Kind'}</span><select className={`select ${styles.select}`} value={kind} disabled={busyId !== null} onChange={e => setKind(e.target.value as Kind)}><option value="review">{fa ? 'دیدگاه‌ها' : 'Reviews'}</option><option value="question">{fa ? 'پرسش‌ها' : 'Questions'}</option></select></label>
      <label className={styles.field}><span>{fa ? 'وضعیت' : 'Status'}</span><select className={`select ${styles.select}`} value={status} disabled={busyId !== null} onChange={e => setStatus(e.target.value)}><option value="PENDING">{fa ? 'در انتظار بررسی' : 'Pending'}</option><option value="APPROVED">{fa ? 'تأییدشده' : 'Approved'}</option><option value="REJECTED">{fa ? 'ردشده' : 'Rejected'}</option><option value="ALL">{fa ? 'همه' : 'All'}</option></select></label>
    </section>
    {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" className="btn btn-ghost" disabled={loading || busyId !== null} onClick={() => setReload(value => value + 1)}>{fa ? 'دریافت دوباره' : 'Retry'}</button></div>}
    <section aria-label={fa ? 'نتایج' : 'Results'} aria-busy={loading}>
      {loading && <p role="status" className="muted">{fa ? 'در حال دریافت…' : 'Loading…'}</p>}
      {!loading && !error && items.length === 0 && <p role="status" className={styles.empty}>{fa ? 'با این نوع و وضعیت، موردی یافت نشد. فیلتر دیگری را انتخاب کنید.' : 'No items match these filters. Choose another kind or status.'}</p>}
      <div className="store-admin-list">{items.map(item => <article className="card" key={item.id}>
        <Link href={`/products/${item.product.slug}`} target="_blank" rel="noreferrer"><strong>{item.product.name}</strong></Link>
        <p className="muted text-sm">{item.user?.name || item.user?.email || item.guestName || (fa ? 'مهمان' : 'Guest')} · {item.status}</p>
        {item.rating && <div className="rv-inline"><RatingChip value={item.rating} /><RatingMeter size="sm" value={item.rating} label={`${item.rating} از ۵`} /></div>}
        {item.title && <h2>{item.title}</h2>}<p className={styles.body}>{item.body}</p>
        {kind === 'question' && <div className="store-admin-field"><label htmlFor={`product-answer-${item.id}`}>{fa ? 'پاسخ فروشگاه' : 'Store answer'}</label><textarea id={`product-answer-${item.id}`} className="textarea" disabled={busyId === item.id} value={answers[item.id] ?? item.answer ?? ''} onChange={e => setAnswers(old => ({ ...old, [item.id]: e.target.value }))} /></div>}
        <div className={styles.actions}><button type="button" className="btn btn-primary" disabled={busyId !== null} onClick={() => void moderate(item, 'APPROVED')}>{fa ? 'تأیید' : 'Approve'}</button><button type="button" className="btn btn-ghost" disabled={busyId !== null} onClick={() => void moderate(item, 'REJECTED')}>{fa ? 'رد' : 'Reject'}</button></div>
      </article>)}</div>
    </section>
  </div>
}
