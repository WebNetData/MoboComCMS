'use client'

import { use, useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import LibraryPicker from '@/components/media/LibraryPicker'
import JalaliDateInput from '@/components/date/JalaliDateInput'

type Item = { type: string; id: number; title: string; subtitle?: string; image?: string; url: string }
type Detail = { id: number; title: string; description: string; cover: string; visibility: string; updatedAt: string; publishAt: string | null; scheduleError: string; followerCount: number; reactionCount: number; items: { id: number; position: number; card: Item }[] }
type Found = { key: string; type: string; title: string; subtitle: string; image: string }

const TYPE: Record<string, string> = { post: 'مقاله', software: 'نرم‌افزار', game: 'بازی', studio: 'استودیو', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', artist: 'هنرمند', product: 'محصول', thread: 'موضوع تالار' }
const fa = (value: number) => value.toLocaleString('fa-IR')

/** The editor of one collection written for the site: its text, what it holds and in which order, and whether it is published. */
export default function EditorialCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const url = `/api/admin/collections/${id}`
  const [detail, setDetail] = useState<Detail | null>(null)
  const [form, setForm] = useState({ title: '', description: '', cover: '' })
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishAt, setPublishAt] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (!response?.ok) { setMessage({ text: body?.error === 'Collection unavailable' ? 'این مجموعه پیدا نشد یا مجموعهٔ سایت نیست.' : 'بارگذاری انجام نشد.', error: true }); return null }
    setDetail(body); return body as Detail
  }, [url])
  useEffect(() => { void load().then((body) => { if (body) setForm({ title: body.title, description: body.description, cover: body.cover }) }) }, [load])

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage(null)
    const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error === 'Collection needs a published item' ? 'برای انتشار، دست‌کم یک موردِ منتشرشده در مجموعه لازم است.' : result?.error === 'Collection is full' ? 'مجموعه پر است.' : result?.error === 'Item unavailable' ? 'این مورد منتشرشده نیست یا پیدا نشد.' : result?.error || 'انجام نشد', error: true }); return false }
    if (done) setMessage({ text: done, error: false })
    await load()
    return true
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    if (query.trim().length < 2) return
    const response = await fetch(`/api/admin/collections?find=${encodeURIComponent(query)}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setFound(response?.ok ? body.items : [])
  }

  async function remove() {
    if (!window.confirm('این مجموعه برای همیشه حذف شود؟ دنبال‌کننده‌ها و ذخیره‌های آن هم پاک می‌شوند.')) return
    setBusy(true)
    const response = await fetch(url, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (response?.ok) router.push('/admin/collections'); else setMessage({ text: 'حذف انجام نشد.', error: true })
  }

  if (!detail) return <div className="collections-admin" dir="rtl">{message ? <p role="alert" className="error-text">{message.text}</p> : <p className="muted">در حال بارگذاری…</p>}<Link className="btn btn-ghost btn-sm" href="/admin/collections">بازگشت به مجموعه‌ها</Link></div>
  const published = detail.visibility === 'EDITORIAL'
  const held = new Set(detail.items.map(({ card }) => `${card.type}:${card.id}`))

  return <div className="collections-admin" dir="rtl">
    <header className="collections-admin-head"><div><Link className="sa-link" href="/admin/collections">← مجموعه‌ها</Link><h1>{detail.title}</h1><p>{published ? 'منتشرشده؛ همه آن را می‌بینند.' : 'پیش‌نویس؛ فقط کارمندان آن را می‌بینند.'} · {fa(detail.items.length)} مورد{published ? ` · ${fa(detail.followerCount)} دنبال‌کننده · ♥ ${fa(detail.reactionCount)}` : ''}</p></div>
      <div className="sa-head-actions">
        {published && <Link className="btn btn-ghost btn-sm" href={`/collections/${detail.id}`}>دیدن در سایت</Link>}
        <button type="button" className={`btn btn-sm ${published ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => void patch({ publish: !published }, published ? 'به پیش‌نویس برگشت. دنبال‌کننده‌ها و ذخیره‌ها سر جایشان می‌مانند.' : 'منتشر شد.')}>{published ? 'برگرداندن به پیش‌نویس' : 'انتشار'}</button>
      </div>
    </header>
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error-text' : 'collections-admin-status'}>{message.text}</p>}

    <form className="sa-card sa-form" onSubmit={(event) => { event.preventDefault(); void patch(form, 'ذخیره شد.') }}>
      <header className="sa-card-head"><h2>مشخصات</h2></header>
      <label className="sa-field"><span>عنوان</span><input className="input" value={form.title} maxLength={120} required onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label className="sa-field"><span>توضیح (زیر عنوان نمایش داده می‌شود)</span><textarea className="input" rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label className="sa-field"><span>تصویر جلد (نشانی از همین سایت یا https)</span><input className="input" dir="ltr" value={form.cover} maxLength={1000} onChange={(event) => setForm({ ...form, cover: event.target.value })} placeholder="/api/media/covers/…" /></label>
      <div className="sa-head-actions"><LibraryPicker kind="image" onSelect={asset => setForm(current => ({ ...current, cover: asset.url }))} />{form.cover && <img src={form.cover} alt="پیش‌نمایش جلد مجموعه" width={120} height={72} style={{ objectFit: 'cover', borderRadius: 10 }} />}</div>
      <div className="sa-head-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ مشخصات</button><button type="button" className="sa-link is-danger" disabled={busy} onClick={() => void remove()}>حذف مجموعه</button></div>
    </form>

    {!published && <section className="sa-card" aria-label="زمان‌بندی انتشار">
      <header className="sa-card-head"><h2>انتشار زمان‌بندی‌شده</h2></header>
      <p className="sa-sub">زمان با منطقهٔ زمانی دستگاه شما ثبت می‌شود. سرور هنگام انتشار، دسترسی ثبت‌کننده و قابل نمایش بودن محتوا را دوباره بررسی می‌کند.</p>
      {detail.publishAt && <p role="status">زمان ثبت‌شده: <time dateTime={detail.publishAt}>{new Date(detail.publishAt).toLocaleString('fa-IR')}</time></p>}
      {detail.scheduleError && <p className="error-text" role="alert">{detail.scheduleError}</p>}
      <label className="sa-field"><span>تاریخ و ساعت انتشار</span><JalaliDateInput withTime className="input" value={publishAt} onChange={(value) => setPublishAt(value)} /></label>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || !publishAt || !Number.isFinite(new Date(publishAt).getTime())} onClick={() => void patch({ publishAt: new Date(publishAt).toISOString(), updatedAt: detail.updatedAt }, 'زمان‌بندی ثبت شد.')}>{detail.publishAt ? 'تغییر زمان‌بندی' : 'ثبت زمان‌بندی'}</button>{detail.publishAt && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void patch({ publishAt: null, updatedAt: detail.updatedAt }, 'زمان‌بندی لغو شد؛ مجموعه پیش‌نویس ماند.')}>لغو زمان‌بندی</button>}</div>
    </section>}

    <section className="sa-card" aria-label="افزودن مورد">
      <header className="sa-card-head"><h2>افزودن مورد</h2></header>
      <form className="collections-admin-new" onSubmit={search}>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام فیلم، بازی، آلبوم، مقاله، محصول…" aria-label="جست‌وجوی مورد" />
        <button className="btn btn-ghost btn-sm" disabled={query.trim().length < 2}>جست‌وجو</button>
      </form>
      {found && (found.length ? <ul className="sa-rows collections-admin-list">{found.map((row) => <li key={row.key}>{row.image ? <img src={row.image} alt="" className="collections-admin-thumb" loading="lazy" /> : <span className="collections-admin-thumb" />}<span className="sa-grow"><b>{row.title}</b><small>{TYPE[row.type] || row.type}{row.subtitle ? ` · ${row.subtitle}` : ''}</small></span>{held.has(row.key) ? <span className="collections-admin-status">در مجموعه هست</span> : <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void patch({ item: row.key, action: 'add' }, '')}>افزودن</button>}</li>)}</ul> : <p className="muted">موردِ منتشرشده‌ای با این نام پیدا نشد.</p>)}
    </section>

    <section className="sa-card" aria-label="موردهای مجموعه">
      <header className="sa-card-head"><h2>موردهای مجموعه</h2><span className="sa-sub">به همین ترتیب در سایت نمایش داده می‌شوند</span></header>
      {detail.items.length ? <ol className="sa-rows collections-admin-list">{detail.items.map(({ card: item }, index) => { const key = `${item.type}:${item.id}`; return <li key={key}>
        {item.image ? <img src={item.image} alt="" className="collections-admin-thumb" loading="lazy" /> : <span className="collections-admin-thumb" />}
        <Link href={item.url}><span className="sa-grow"><b>{item.title}</b><small>{TYPE[item.type] || item.type}{item.subtitle ? ` · ${item.subtitle}` : ''}</small></span></Link>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || index === 0} aria-label={`بالا بردن ${item.title}`} onClick={() => void patch({ item: key, action: 'up' }, '')}>↑</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || index === detail.items.length - 1} aria-label={`پایین بردن ${item.title}`} onClick={() => void patch({ item: key, action: 'down' }, '')}>↓</button>
        <button type="button" className="sa-link is-danger" disabled={busy} onClick={() => void patch({ item: key, action: 'remove' }, '')}>برداشتن</button>
      </li> })}</ol> : <p className="muted">هنوز موردی اضافه نشده است. از جست‌وجوی بالا اضافه کنید.</p>}
    </section>
  </div>
}
