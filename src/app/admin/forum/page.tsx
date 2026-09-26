'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Board = { id: number; slug: string; title: string; description: string; icon: string; access: string; locked: boolean; sortOrder: number; threadCount: number; postCount: number }
type Post = { id: number; excerpt: string; status: string; createdAt: string; user: { id: number; name: string; email: string }; thread: { id: number; title: string; status: string; pinned: boolean; locked: boolean; category: { title: string } } }
const EMPTY = { id: 0, slug: '', title: '', description: '', icon: '💬', access: 'PUBLIC', locked: false, sortOrder: 0 }

/** Forum boards and a moderation feed of the latest posts. */
export default function AdminForumPage() {
  const [boards, setBoards] = useState<Board[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/forum', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (response.ok) { setBoards(data.boards || []); setPosts(data.posts || []) }
    else setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(url: string, method: string, body?: unknown, success = 'ذخیره شد') {
    setBusy(true); setMessage(null)
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); return false }
    setMessage({ text: success, error: false })
    await load()
    return true
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (await call('/api/admin/forum', form.id ? 'PATCH' : 'POST', form, form.id ? 'انجمن به‌روز شد' : 'انجمن ساخته شد')) setForm(EMPTY)
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">FORUM</span><h1>تالار گفتمان</h1><p>انجمن‌ها را بسازید و مرتب کنید. پیام‌های تازه را همین‌جا ببینید؛ سنجاق، قفل، پنهان و حذف موضوع‌ها از نوار مدیریت داخل خود موضوع انجام می‌شود.</p></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <section className="xm-section">
      <h2>انجمن‌ها</h2>
      <form className="card fr-admin-form" onSubmit={save}>
        <label className="studio-field"><span>عنوان</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120}/></label>
        <label className="studio-field"><span>نشانی (انگلیسی)</span><input className="input" dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="general" maxLength={60}/></label>
        <label className="studio-field"><span>آیکون (ایموجی)</span><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={8}/></label>
        <label className="studio-field"><span>ترتیب</span><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}/></label>
        <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={400}/></label>
        <label className="studio-field"><span>دسترسی</span><select className="input" value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}><option value="PUBLIC">همه</option><option value="MEMBERS">فقط اعضای ویژه (VIP)</option></select></label>
        <label className="studio-switch"><input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })}/>فقط مدیران موضوع بسازند (اطلاعیه‌ها)</label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{form.id ? 'ذخیرهٔ تغییرات' : 'افزودن انجمن'}</button>{form.id > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(EMPTY)}>انصراف</button>}</div>
      </form>
      <div className="table-wrap card"><table className="table"><thead><tr><th>انجمن</th><th>دسترسی</th><th>موضوع</th><th>پیام</th><th /></tr></thead><tbody>
        {boards.map((board) => <tr key={board.id}>
          <td><b>{board.icon} {board.title}</b><br/><small className="muted" dir="ltr">/forum/c/{board.slug}</small></td>
          <td>{board.access === 'MEMBERS' ? '♛ VIP' : 'همه'}{board.locked ? ' · اطلاعیه' : ''}</td>
          <td>{board.threadCount.toLocaleString('fa-IR')}</td><td>{board.postCount.toLocaleString('fa-IR')}</td>
          <td className="fr-admin-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ id: board.id, slug: board.slug, title: board.title, description: board.description, icon: board.icon, access: board.access, locked: board.locked, sortOrder: board.sortOrder })}>ویرایش</button><Link className="btn btn-ghost btn-sm" href={`/forum/c/${board.slug}`} target="_blank">مشاهده ↗</Link><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(`انجمن «${board.title}» حذف شود؟`)) void call(`/api/admin/forum?id=${board.id}`, 'DELETE', undefined, 'انجمن حذف شد') }}>حذف</button></td>
        </tr>)}
        {!boards.length && <tr><td colSpan={5} className="muted">هنوز انجمنی ساخته نشده است.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="xm-section">
      <h2>پیام‌های اخیر</h2>
      <div className="fr-admin-feed">{posts.map((post) => <article key={post.id} className={`card${post.status !== 'VISIBLE' ? ' is-hidden' : ''}`}>
        <header><Link href={`/forum/t/${post.thread.id}#post-${post.id}`} target="_blank"><b>{post.thread.title}</b></Link><small className="muted">{post.thread.category.title} · {post.user.name || post.user.email} · {new Date(post.createdAt).toLocaleString('fa-IR')}</small></header>
        <p>{post.excerpt}</p>
        <div className="fr-admin-row-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call(`/api/forum/posts/${post.id}`, 'PATCH', { action: post.status === 'VISIBLE' ? 'hide' : 'show' }, 'به‌روز شد')}>{post.status === 'VISIBLE' ? 'پنهان‌کردن' : 'نمایش'}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call(`/api/forum/threads/${post.thread.id}`, 'PATCH', { locked: !post.thread.locked }, 'به‌روز شد')}>{post.thread.locked ? 'باز کردن موضوع' : 'قفل موضوع'}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm('این پیام حذف شود؟')) void call(`/api/forum/posts/${post.id}`, 'DELETE', undefined, 'حذف شد') }}>حذف پیام</button>
        </div>
      </article>)}
      {!posts.length && <div className="tb-empty">هنوز پیامی ارسال نشده است.</div>}</div>
    </section>
  </div>
}
