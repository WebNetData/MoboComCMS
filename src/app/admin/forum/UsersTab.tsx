'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Restrictions from './Restrictions'
import { date, fa, type Call, type Member } from './shared'
import { profileAddress } from '@/modules/identity/domain/profile-address'
import type { UserLevel } from '@/modules/forum/domain/community'

type Filter = '' | 'restricted' | 'locked' | 'noted'
const FILTERS: [Filter, string][] = [['', 'همه'], ['restricted', 'ساکت یا معلق'], ['locked', 'سطح دستی'], ['noted', 'دارای یادداشت']]

const active = (until: string | null) => !!until && new Date(until).getTime() > Date.now()

/**
 * Forum members as a list to scan: level, activity and any sanction at a glance, filtered by what needs the
 * team's eye. A member's level, title, note, silence, suspension and restrictions open under their row.
 */
export default function UsersTab({ trustNames, levels, busy, call, revision }: { trustNames: string[]; levels: UserLevel[]; busy: boolean; call: Call; revision: number }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const [members, setMembers] = useState<Member[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/admin/forum?section=users&q=${encodeURIComponent(query)}${filter ? `&filter=${filter}` : ''}`, { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => { if (body) { setMembers(body.users || []); setCounts(body.counts || {}) } })
        .catch(() => undefined)
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, filter, revision, reload])

  return <section className="sa-card">
    <div className="sa-card-head"><div><h2>کاربران تالار</h2><small>سطح اعتماد، عنوان، یادداشت تیم و محدودیت‌های هر عضو. برای جزئیات «مدیریت» را بزنید.</small></div></div>
    <div className="sa-toolbar"><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی نام، ایمیل یا @نام‌کاربری" aria-label="جست‌وجوی کاربر" /></div>
    <div className="sa-subtabs">{FILTERS.map(([key, label]) => <button key={key || 'all'} type="button" className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}{key && <span>{fa(counts[key] || 0)}</span>}</button>)}</div>
    <div className="sa-table-wrap"><table className="data sa-table sa-cards fa-users">
      <thead><tr><th>عضو</th><th>سطح اعتماد</th><th>پیام</th><th>پسند</th><th>آخرین بازدید</th><th>وضعیت</th><th><span className="sr-only">کارها</span></th></tr></thead>
      <tbody>
        {members?.map((user) => {
          const silenced = active(user.silencedUntil), suspended = active(user.suspendedUntil)
          return <Fragment key={user.userId}>
            <tr className={open === user.userId ? 'is-selected' : ''}>
              <td className="sa-card-main"><Link href={profileAddress(user.username)} target="_blank" className="sa-link"><b>{user.name || user.email}</b></Link> <bdi className="sa-sub" dir="ltr">@{user.username}</bdi>
                <small className="sa-sub">{user.email}{user.title && <> · «{user.title}»</>}{user.groups.length > 0 && <> · {user.groups.join('، ')}</>}</small></td>
              <td data-label="سطح اعتماد">{fa(user.trustLevel)} — {trustNames[user.trustLevel] || ''}{user.trustLocked && <span className="sa-tag" title="به‌دست تیم تعیین شده و خودکار تغییر نمی‌کند">دستی</span>}</td>
              <td data-label="پیام">{fa(user.postCount)}</td>
              <td data-label="پسند">{fa(user.likesReceived)}</td>
              <td data-label="آخرین بازدید">{user.lastSeenAt ? date(user.lastSeenAt) : <span className="sa-sub">—</span>}</td>
              <td data-label="وضعیت"><div className="fa-perm-cell">
                {suspended && <span className="sa-state is-bad">معلق تا {date(user.suspendedUntil)}</span>}
                {silenced && <span className="sa-state is-warn">ساکت تا {date(user.silencedUntil)}</span>}
                {!silenced && !suspended && <span className="sa-state is-ok">فعال</span>}
                {user.moderationNote && <span className="sa-tag" title={user.moderationNote}>یادداشت</span>}
              </div></td>
              <td className="sa-card-foot"><button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === user.userId} aria-controls={`fa-user-${user.userId}`} onClick={() => setOpen(open === user.userId ? null : user.userId)}>{open === user.userId ? 'بستن' : 'مدیریت'}</button></td>
            </tr>
            {open === user.userId && <tr className="fa-user-detail" id={`fa-user-${user.userId}`}><td colSpan={7} className="sa-card-main">
              <UserModeration user={user} trustNames={trustNames} levels={levels} busy={busy} onRestrictionsChanged={() => setReload((n) => n + 1)} onSave={(patch, success) => void call('PATCH', { section: 'users', userId: user.userId, ...patch }, success)} />
            </td></tr>}
          </Fragment>
        })}
        {members === null && <tr><td colSpan={7} className="sa-empty">در حال بارگذاری…</td></tr>}
        {members?.length === 0 && <tr><td colSpan={7} className="sa-empty">کاربری پیدا نشد.</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function UserModeration({ user, trustNames, levels, busy, onSave, onRestrictionsChanged }: { user: Member; trustNames: string[]; levels: UserLevel[]; busy: boolean; onSave: (patch: Record<string, unknown>, success: string) => void; onRestrictionsChanged: () => void }) {
  const [title, setTitle] = useState(user.title)
  const [note, setNote] = useState(user.moderationNote)
  const silenced = active(user.silencedUntil), suspended = active(user.suspendedUntil)
  const ask = (field: 'silenceDays' | 'suspendDays', label: string) => {
    const days = window.prompt(`${label} برای چند روز؟ (۰ = لغو)`, '7')
    if (days !== null) onSave({ [field]: Number(days) || 0 }, Number(days) ? `${label} اعمال شد` : `${label} لغو شد`)
  }
  return <div className="fa-user-panel">
    <div className="fa-inline fa-wrap">
      <label className="studio-field"><span>مقام کاربر</span><select aria-label="مقام کاربر" className="input" value={levels.some(level => level.id === user.manualLevelId) ? user.manualLevelId || '' : ''} disabled={busy} onChange={event => onSave({ manualLevelId: event.target.value || null }, event.target.value ? 'مقام دستی ذخیره شد' : 'مقام دوباره از فعالیت محاسبه می‌شود')}><option value="">خودکار، بر اساس فعالیت</option>{levels.map(level => <option key={level.id} value={level.id}>{level.icon} {level.name} (دستی)</option>)}</select><small className="muted">مقام نمایشی است و هیچ دسترسی مدیریتی نمی‌دهد.</small></label>
      <label className="studio-field"><span>سطح اعتماد{user.trustLocked ? ' (دستی)' : ''}</span><select className="input" value={user.trustLevel} disabled={busy} onChange={(e) => onSave({ trustLevel: Number(e.target.value), trustLocked: true }, 'سطح اعتماد تغییر کرد')}>{trustNames.map((name, level) => <option key={level} value={level}>{fa(level)} — {name}</option>)}</select></label>
      {user.trustLocked && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSave({ trustLocked: false }, 'سطح اعتماد دوباره خودکار شد')}>خودکار شود</button>}
      <div className="studio-field"><span id={`fa-title-${user.userId}`}>عنوان</span><div className="fa-inline"><input className="input" aria-labelledby={`fa-title-${user.userId}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} /><button type="button" className="btn btn-ghost btn-sm" disabled={busy || title === user.title} onClick={() => onSave({ title }, 'عنوان ذخیره شد')}>ذخیره</button></div></div>
      <div className="studio-field fa-grow"><span id={`fa-note-${user.userId}`}>یادداشت تیم (خصوصی)</span><div className="fa-inline"><input className="input" aria-labelledby={`fa-note-${user.userId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /><button type="button" className="btn btn-ghost btn-sm" disabled={busy || note === user.moderationNote} onClick={() => onSave({ moderationNote: note }, 'یادداشت ذخیره شد')}>ذخیره</button></div></div>
    </div>
    <div className="fa-inline fa-wrap">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('silenceDays', 'ساکت‌کردن')}>🔇 {silenced ? 'تغییر سکوت' : 'ساکت‌کردن'}</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('suspendDays', 'تعلیق')}>⛔ {suspended ? 'تغییر تعلیق' : 'تعلیق'}</button>
      <Link className="btn btn-ghost btn-sm" href={profileAddress(user.username)} target="_blank">نمایه ↗</Link>
    </div>
    <Restrictions userId={user.userId} disabled={busy} onChanged={onRestrictionsChanged} />
  </div>
}
