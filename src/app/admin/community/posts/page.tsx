'use client'

import { useState } from 'react'
import { CommunityShell, Notice, Pager, Who, fa, faDate, send, useJson, type Person } from '../shared'

type Row = { id: number; text: string; images: string[]; status: string; visibility: string; likes: number; comments: number; reports: number; createdAt: string; author: Person | null }

export default function CommunityPostsPage() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<{ total: number; page: number; pages: number; posts: Row[] }>(`/api/admin/community?section=posts&q=${encodeURIComponent(query)}&status=${status}&page=${page}`)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function act(row: Row, action: 'hide' | 'restore') {
    const result = await send('/api/admin/community', 'POST', { action, id: row.id })
    setMessage(result.ok ? { tone: 'ok', text: action === 'hide' ? 'پست پنهان شد' : 'پست دوباره نمایش داده می‌شود' } : { tone: 'error', text: result.error })
    void reload()
  }
  return <CommunityShell title="پست‌های کاربران">
    <form className="sa-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()) }}>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در متن پست‌ها" aria-label="جست‌وجو" />
      <label className="sa-inline"><span>وضعیت</span><select className="select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}><option value="">همه</option><option value="VISIBLE">نمایش</option><option value="HIDDEN">پنهان</option></select></label>
      <button className="btn btn-ghost" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-card sa-table-wrap"><table className="data sa-table"><thead><tr><th>نویسنده</th><th>متن</th><th>تعامل</th><th>وضعیت</th><th /></tr></thead><tbody>
      {data?.posts.map((row) => <tr key={row.id}>
        <td><Who person={row.author} /></td>
        <td><p className="ca-text" dir="auto">{row.text || '(تصویر)'}</p><small className="sa-sub">{faDate(row.createdAt, true)}{row.images.length ? ` · ${fa(row.images.length)} تصویر` : ''}{row.visibility === 'FOLLOWERS' ? ' · فقط دنبال‌کنندگان' : ''}</small></td>
        <td className="num"><small>♥ {fa(row.likes)} · 💬 {fa(row.comments)}</small>{row.reports > 0 && <small className="ga-issues">⚠ {fa(row.reports)} گزارش باز</small>}</td>
        <td><span className={`sa-state ${row.status === 'VISIBLE' ? 'is-ok' : 'is-bad'}`}>{row.status === 'VISIBLE' ? 'نمایش' : 'پنهان'}</span></td>
        <td><div className="sa-row-actions"><a href={`/feed/p/${row.id}`} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a>{row.status === 'VISIBLE' ? <button type="button" className="sa-link is-danger" onClick={() => void act(row, 'hide')}>پنهان کردن</button> : <button type="button" className="sa-link" onClick={() => void act(row, 'restore')}>بازگرداندن</button>}</div></td>
      </tr>)}
      {data && !data.posts.length && <tr><td colSpan={5} className="sa-empty">پستی پیدا نشد.</td></tr>}
    </tbody></table></div>
    {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
  </CommunityShell>
}
