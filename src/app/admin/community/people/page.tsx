'use client'

import { useState } from 'react'
import { CommunityShell, Notice, Pager, Who, fa, faDate, send, useJson, type Person } from '../shared'

type Row = Person & { email: string; joinedAt: string; posts: number; following: number; followers: number }

export default function CommunityPeoplePage() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [verified, setVerified] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<{ total: number; page: number; pages: number; people: Row[] }>(`/api/admin/community?section=people&q=${encodeURIComponent(query)}&verified=${verified}&page=${page}`)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function toggle(row: Row) {
    const result = await send('/api/admin/community', 'POST', { action: row.verified ? 'unverify' : 'verify', id: row.userId })
    setMessage(result.ok ? { tone: 'ok', text: row.verified ? `نشان تأیید ${row.name} برداشته شد` : `${row.name} نشان تأیید گرفت` } : { tone: 'error', text: result.error })
    void reload()
  }
  return <CommunityShell title="کاربران و نشان تأیید">
    <form className="sa-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()) }}>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، نام کاربری یا ایمیل" aria-label="جست‌وجو" />
      <label className="sa-inline"><span>فیلتر</span><select className="select" value={verified} onChange={(e) => { setPage(1); setVerified(e.target.value) }}><option value="">همه</option><option value="1">فقط تأییدشده‌ها</option></select></label>
      <button className="btn btn-ghost" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-card sa-table-wrap"><table className="data sa-table"><thead><tr><th>کاربر</th><th>ایمیل</th><th>آمار</th><th>عضویت</th><th>نشان تأیید</th></tr></thead><tbody>
      {data?.people.map((row) => <tr key={row.userId}>
        <td><Who person={row} /></td>
        <td><small dir="ltr">{row.email}</small></td>
        <td className="num"><small>{fa(row.followers)} دنبال‌کننده · {fa(row.posts)} پست</small></td>
        <td><small>{faDate(row.joinedAt)}</small></td>
        <td><button type="button" className={`sa-action${row.verified ? ' is-selected' : ''}`} aria-pressed={row.verified} onClick={() => void toggle(row)}>{row.verified ? '✔ تأییدشده' : 'تأیید حساب'}</button></td>
      </tr>)}
      {data && !data.people.length && <tr><td colSpan={5} className="sa-empty">کاربری پیدا نشد.</td></tr>}
    </tbody></table></div>
    {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
  </CommunityShell>
}
