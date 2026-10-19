'use client'

import { useState } from 'react'
import Link from 'next/link'

type Person = { id: number; name: string; username: string }
export type ForumTeam = { admins: Person[]; deputies: Person[]; moderators: (Person & { categoryIds: number[] })[] }
type Forum = { id: number; title: string; depth: number }
type Call = (method: string, body?: Record<string, unknown>, success?: string) => Promise<unknown>

/**
 * The forum's team in three ranks: who runs the whole forum, who moderates every forum, and who moderates
 * one section or forum. The first is a site role; the other two are set here by username.
 */
export default function TeamTab({ team, forums, busy, call }: { team: ForumTeam; forums: Forum[]; busy: boolean; call: Call }) {
  const [deputy, setDeputy] = useState('')
  const [moderator, setModerator] = useState({ username: '', categoryId: 0 })
  const title = (id: number) => forums.find((forum) => forum.id === id)?.title || `#${id}`
  const who = (person: Person) => <><b>{person.name}</b> <bdi className="muted" dir="ltr">@{person.username}</bdi></>

  return <section className="xm-section">
    <p className="muted fa-team-intro">سه رتبه در تیم تالار هست. هر کس بالاترین رتبه‌ای را که دارد کنار پیام‌هایش نشان می‌دهد و در صفحهٔ <Link href="/forum/staff" target="_blank">تیم تالار</Link> دیده می‌شود.</p>

    <div className="card fa-team">
      <header><h3>مدیر کل تالار</h3><p className="muted">همهٔ انجمن‌ها، گروه‌ها، نشان‌ها و تنظیمات تالار؛ به همین صفحه هم دسترسی دارد. این یک نقش سایت است.</p></header>
      <ul>{team.admins.map((person) => <li key={person.id}>{who(person)}</li>)}{!team.admins.length && <li className="muted">کسی نیست.</li>}</ul>
      <p className="fa-team-foot"><Link href="/admin/section-managers" className="btn btn-ghost btn-sm">افزودن یا برداشتن از «مدیران بخش‌ها»</Link></p>
    </div>

    <div className="card fa-team">
      <header><h3>معاون تالار</h3><p className="muted">در همهٔ انجمن‌ها ناظر است: پنهان، حذف، قفل، انتقال و صف بررسی. به پنل مدیریت و تنظیمات تالار راه ندارد.</p></header>
      <ul>{team.deputies.map((person) => <li key={person.id}>{who(person)}<button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(`«${person.name}» دیگر معاون تالار نباشد؟`)) void call('POST', { section: 'team', action: 'deputy-remove', username: person.username }, 'از معاونان برداشته شد') }}>برداشتن</button></li>)}{!team.deputies.length && <li className="muted">هنوز معاونی تعیین نشده است.</li>}</ul>
      <form className="fa-team-add" onSubmit={async (event) => { event.preventDefault(); if (await call('POST', { section: 'team', action: 'deputy-add', username: deputy }, 'معاون تالار اضافه شد')) setDeputy('') }}>
        <input className="input" dir="ltr" value={deputy} onChange={(event) => setDeputy(event.target.value)} placeholder="نام کاربری" aria-label="نام کاربری معاون تازه" required />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !deputy.trim()}>افزودن معاون</button>
      </form>
    </div>

    <div className="card fa-team">
      <header><h3>مدیر انجمن</h3><p className="muted">فقط در بخش یا انجمنی که به او سپرده شده و هر چه زیر آن است ناظر است؛ بیرون از آن عضو عادی است.</p></header>
      <ul>{team.moderators.map((person) => <li key={person.id}><span>{who(person)}</span><span className="fa-team-forums">{person.categoryIds.map((id) => <span key={id} className="badge">{title(id)}<button type="button" disabled={busy} aria-label={`برداشتن ${person.name} از ${title(id)}`} onClick={() => void call('POST', { section: 'team', action: 'moderator-remove', username: person.username, categoryId: id }, 'از این انجمن برداشته شد')}>×</button></span>)}</span></li>)}{!team.moderators.length && <li className="muted">هنوز مدیری برای انجمنی تعیین نشده است.</li>}</ul>
      <form className="fa-team-add" onSubmit={async (event) => { event.preventDefault(); if (await call('POST', { section: 'team', action: 'moderator-add', ...moderator }, 'مدیر انجمن اضافه شد')) setModerator({ username: '', categoryId: moderator.categoryId }) }}>
        <input className="input" dir="ltr" value={moderator.username} onChange={(event) => setModerator({ ...moderator, username: event.target.value })} placeholder="نام کاربری" aria-label="نام کاربری مدیر انجمن" required />
        <select className="input" value={moderator.categoryId} onChange={(event) => setModerator({ ...moderator, categoryId: Number(event.target.value) })} aria-label="بخش یا انجمن" required>
          <option value={0} disabled>بخش یا انجمن…</option>
          {forums.map((forum) => <option key={forum.id} value={forum.id}>{'— '.repeat(forum.depth)}{forum.title}</option>)}
        </select>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !moderator.username.trim() || !moderator.categoryId}>افزودن مدیر انجمن</button>
      </form>
    </div>
  </section>
}
