'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useParams } from '@/platform/routing/navigation'
import { Notice, fa, faDate } from '../../store/shared'

type Event = { at: string; kind: string; title: string; detail: string; href: string; tone: string }
type Profile = {
  customer: { id: number; name: string; email: string; phone: string; createdAt: string; status: string; orders: number; spendToman: number; lastOrderAt: string | null; openTickets: number; tags: string[]; wallet: { currency: string; balance: number }[]; aov: number; daysSinceLastOrder: number | null; segment: { label: string; tone: string } }
  subscriptions: number; cities: string[]
  notes: { id: number; body: string; author: string; createdAt: string }[]
  timeline: Event[]
  counts: Record<string, number>
}
const ICON: Record<string, string> = { order: '🛒', ticket: '🎫', chat: '💬', wallet: '👛', return: '↩️', note: '📝', review: '⭐', signup: '👋' }
const KINDS = [['', 'همه'], ['order', 'سفارش‌ها'], ['ticket', 'تیکت‌ها'], ['chat', 'گفت‌وگوها'], ['wallet', 'کیف پول'], ['return', 'مرجوعی'], ['review', 'نظرها'], ['note', 'یادداشت‌ها'], ['communication', 'ارتباط‌های بازاریابی']] as const

async function post(body: Record<string, unknown>) {
  const response = await fetch('/api/admin/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true as const } : { ok: false as const, error: String(data?.error || 'انجام نشد') }
}

/** The 360° customer file: value, segment, tags, notes and one timeline of orders, tickets, chats, wallet and more. */
export default function CustomerFile() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('')
  const [note, setNote] = useState('')
  const [tag, setTag] = useState('')
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/crm?id=${id}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setData(body); else setError(body?.error || 'بارگذاری نشد')
  }, [id])
  useEffect(() => { void load() }, [load])
  if (error) return <div className="sa"><Notice tone="error">{error}</Notice></div>
  if (!data) return <div className="sa"><div className="sa-skeleton" aria-busy="true" /></div>
  const c = data.customer
  async function addNote(event: FormEvent) { event.preventDefault(); const result = await post({ id: c.id, note }); if (result.ok) { setNote(''); void load() } else setError(result.error) }
  async function toggleTag(value: string, on: boolean) { const result = await post({ id: c.id, tag: value, on }); if (result.ok) { setTag(''); void load() } else setError(result.error) }
  const events = kind ? data.timeline.filter((event) => event.kind === kind) : data.timeline
  return <div className="sa" dir="rtl">
    <header className="sa-head crm-head">
      <span className="crm-avatar" aria-hidden="true">{(c.name || c.email).slice(0, 1)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{c.name || c.email}</h1>
        <p className="sa-hint"><bdi dir="ltr">{c.email}</bdi>{c.phone ? <> · <bdi dir="ltr">{c.phone}</bdi></> : ''} · عضو از {faDate(c.createdAt)}{data.cities.length ? ` · ${data.cities.join('، ')}` : ''}</p>
        <div className="crm-tags"><span className={`crm-seg is-${c.segment.tone}`}>{c.segment.label}</span>{c.status !== 'ACTIVE' && <span className="crm-seg is-bad">حساب مسدود</span>}
          {c.tags.map((t) => <span key={t} className="crm-tag">{t}<button type="button" onClick={() => void toggleTag(t, false)} aria-label={`حذف برچسب ${t}`}>✕</button></span>)}
          <form onSubmit={(e) => { e.preventDefault(); if (tag.trim()) void toggleTag(tag.trim(), true) }} className="sa-row"><input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ برچسب" aria-label="برچسب تازه" style={{ width: 120, paddingBlock: 4 }} /></form>
        </div>
      </div>
      <div className="sa-head-actions"><Link href={`/admin/users/${c.id}`} className="btn btn-ghost">ویرایش حساب</Link><Link href={`/admin/tickets?user=${c.id}`} className="btn btn-ghost">تیکت‌ها</Link></div>
    </header>

    <div className="sa-kpis">
      <div className="sa-kpi"><small>مجموع خرید</small><b>{fa(c.spendToman)} تومان</b><span className="sa-sub">{fa(c.orders)} سفارش موفق · میانگین {fa(c.aov)}</span></div>
      <div className="sa-kpi"><small>آخرین خرید</small><b>{c.lastOrderAt ? faDate(c.lastOrderAt) : '—'}</b><span className="sa-sub">{c.daysSinceLastOrder != null ? `${fa(c.daysSinceLastOrder)} روز پیش` : 'هنوز خرید نکرده'}</span></div>
      <div className="sa-kpi"><small>پشتیبانی</small><b className="num">{fa(c.openTickets)} تیکت باز</b><span className="sa-sub">{fa(data.counts.tickets)} تیکت · {fa(data.counts.chats)} گفت‌وگو</span></div>
      <div className="sa-kpi"><small>کیف پول و سرویس</small><b>{c.wallet.map((w) => `${fa(w.balance)} ${w.currency === 'IRT' ? 'تومان' : w.currency}`).join('، ') || '۰'}</b><span className="sa-sub">{fa(data.subscriptions)} سرویس فعال</span></div>
    </div>

    <div className="sa-editor">
      <section className="sa-card">
        <header className="sa-card-head"><h2>تاریخچهٔ کامل</h2><div className="crm-filters">{KINDS.map(([value, label]) => <button key={value} type="button" className={kind === value ? 'is-active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div></header>
        <ol className="crm-timeline">{events.map((event, index) => <li key={`${event.kind}-${index}`} className={event.tone ? `is-${event.tone}` : ''}>
          <span className="crm-ico" aria-hidden="true">{ICON[event.kind] || '•'}</span>
          <div>{event.href ? <Link className="sa-link" href={event.href}><b>{event.title}</b></Link> : <b>{event.title}</b>}{event.detail && <p>{event.detail}</p>}</div>
          <time dateTime={event.at}>{faDate(event.at)}</time>
        </li>)}{!events.length && <li><span /><p className="sa-empty">موردی نیست.</p><span /></li>}</ol>
      </section>
      <aside className="sa-editor-side sa-stack">
        <form className="sa-card sa-form" onSubmit={addNote}>
          <header className="sa-card-head"><h2>یادداشت داخلی</h2></header>
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="فقط برای همکاران قابل مشاهده است" aria-label="یادداشت" />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!note.trim()}>ثبت یادداشت</button>
        </form>
        <section className="sa-card">
          <header className="sa-card-head"><h2>یادداشت‌ها</h2></header>
          {data.notes.length ? <ul className="sl-reviews">{data.notes.map((n) => <li key={n.id}><p>{n.body}</p><small className="sa-sub">{n.author} · {faDate(n.createdAt, true)}</small></li>)}</ul> : <p className="sa-empty">یادداشتی ثبت نشده است.</p>}
        </section>
      </aside>
    </div>
  </div>
}
