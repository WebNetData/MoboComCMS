'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { fa, type Call, type Group } from './shared'

type Draft = Omit<Group, 'memberCount' | 'clubCategoryId'>
const EMPTY: Draft = { id: 0, slug: '', name: '', description: '', icon: '👥', color: '#0ea5e9', title: '', visibility: 'PUBLIC', joinMode: 'CLOSED', moderator: false, mentionable: false, automatic: null }
const JOIN: Record<string, string> = { OPEN: 'آزاد', REQUEST: 'با درخواست', CLOSED: 'فقط با دعوت' }
const SEEN: Record<string, string> = { PUBLIC: 'عمومی', MEMBERS: 'فقط اعضا', STAFF: 'فقط تیم' }
type View = 'manual' | 'automatic' | 'clubs'
const viewOf = (g: Group): View => g.clubCategoryId ? 'clubs' : g.automatic ? 'automatic' : 'manual'

/**
 * Forum groups in three kinds: the ones the team makes (titles, access, moderators), the automatic ones
 * (by role or trust level; only their look changes) and the members' clubs. A group's members are added and
 * removed from its own row.
 */
export default function GroupsTab({ groups, busy, call, remove }: { groups: Group[]; busy: boolean; call: Call; remove: (section: string, id: number, label: string) => void }) {
  const [view, setView] = useState<View>('manual')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [members, setMembers] = useState<Group | null>(null)
  const shown = groups.filter((g) => viewOf(g) === view)
  const count = (kind: View) => groups.filter((g) => viewOf(g) === kind).length
  const views: [View, string][] = [['manual', 'گروه‌های تالار'], ['automatic', 'خودکار'], ['clubs', 'کلوب‌ها']]
  const open = (g: Group) => { setMembers(null); setDraft({ id: g.id, slug: g.slug, name: g.name, description: g.description, icon: g.icon, color: g.color, title: g.title, visibility: g.visibility, joinMode: g.joinMode, moderator: g.moderator, mentionable: g.mentionable, automatic: g.automatic }) }

  return <section className="sa-card">
    <div className="sa-card-head">
      <div><h2>گروه‌ها</h2><small>عنوان و دسترسی گروهی اعضا. دسترسی هر گروه به انجمن‌ها در «دسته‌ها» تنظیم می‌شود.</small></div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMembers(null); setDraft({ ...EMPTY }) }}>+ گروه تازه</button>
    </div>
    <div className="sa-subtabs">{views.map(([key, label]) => <button key={key} type="button" className={view === key ? 'is-active' : ''} aria-pressed={view === key} onClick={() => setView(key)}>{label}<span>{fa(count(key))}</span></button>)}</div>
    {draft && <GroupForm key={draft.id} draft={draft} busy={busy} call={call} onClose={() => setDraft(null)} />}
    {members && <MembersForm key={members.id} group={members} busy={busy} call={call} onClose={() => setMembers(null)} />}
    <div className="sa-table-wrap"><table className="data sa-table sa-cards">
      <thead><tr><th>گروه</th><th>{view === 'automatic' ? 'عضویت' : 'عضویت و نمایش'}</th><th>اعضا</th><th><span className="sr-only">کارها</span></th></tr></thead>
      <tbody>
        {shown.map((g) => <tr key={g.id}>
          <td className="sa-card-main"><div className="fa-node" style={{ ['--fa-node' as string]: g.color }}>
            <span className="fa-node-icon" aria-hidden="true">{g.icon}</span>
            <span><b>{g.name}</b><small className="sa-sub"><bdi dir="ltr">@{g.slug}</bdi>{g.title && <> · عنوان «{g.title}»</>}</small></span>
          </div></td>
          <td data-label="عضویت">{g.automatic ? <span className="sa-sub">بر اساس نقش یا سطح اعتماد</span> : <div className="fa-perm-cell"><span className="sa-tag">{JOIN[g.joinMode] || g.joinMode}</span><span className="sa-tag">{SEEN[g.visibility] || g.visibility}</span>{g.moderator && <span className="sa-tag">ناظر تالار</span>}{g.mentionable && <span className="sa-tag">@ نام‌بردنی</span>}</div>}</td>
          <td data-label="اعضا">{fa(g.memberCount)}</td>
          <td className="sa-card-foot"><div className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(g)}>ویرایش</button>
            {!g.automatic && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={members?.id === g.id} onClick={() => { setDraft(null); setMembers(members?.id === g.id ? null : g) }}>اعضا</button>}
            <Link className="btn btn-ghost btn-sm" href={`/forum/g/${g.slug}`} target="_blank">{g.clubCategoryId ? 'صفحهٔ کلوب' : 'فهرست اعضا'} ↗</Link>
            {!g.automatic && !g.clubCategoryId && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove('groups', g.id, g.name)}>حذف</button>}
          </div></td>
        </tr>)}
        {!shown.length && <tr><td colSpan={4} className="sa-empty">{view === 'clubs' ? 'هنوز کلوبی ساخته نشده است.' : 'گروهی در این فهرست نیست.'}</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function GroupForm({ draft, busy, call, onClose }: { draft: Draft; busy: boolean; call: Call; onClose: () => void }) {
  const [group, setGroup] = useState(draft)
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => { name.current?.focus(); name.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const heading = group.id ? `ویرایش گروه «${draft.name}»` : 'گروه تازه'
  return <form className="fr-admin-form fa-panel" aria-label={heading} onSubmit={async (event) => { event.preventDefault(); if (await call(group.id ? 'PATCH' : 'POST', { section: 'groups', ...group }, group.id ? 'گروه به‌روز شد' : 'گروه ساخته شد')) onClose() }}>
    <div className="fa-panel-head"><h3>{heading}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div>
    <label className="studio-field"><span>نام</span><input ref={name} className="input" value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} required maxLength={60} /></label>
    <label className="studio-field"><span>نشانی (انگلیسی)</span><input className="input" dir="ltr" value={group.slug} onChange={(e) => setGroup({ ...group, slug: e.target.value })} disabled={!!group.automatic} maxLength={40} /></label>
    <div className="studio-field" role="group" aria-label="آیکون و رنگ"><span aria-hidden="true">آیکون و رنگ</span><div className="fa-inline"><input className="input" value={group.icon} onChange={(e) => setGroup({ ...group, icon: e.target.value })} maxLength={8} aria-label="آیکون" /><input type="color" value={group.color} onChange={(e) => setGroup({ ...group, color: e.target.value })} aria-label="رنگ" /></div></div>
    <label className="studio-field"><span>عنوان اعضا</span><input className="input" value={group.title} onChange={(e) => setGroup({ ...group, title: e.target.value })} placeholder="مثلاً: متخصص شبکه" maxLength={40} /></label>
    <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={group.description} onChange={(e) => setGroup({ ...group, description: e.target.value })} maxLength={1000} /></label>
    {!group.automatic && <>
      <label className="studio-field"><span>نمایش</span><select className="input" value={group.visibility} onChange={(e) => setGroup({ ...group, visibility: e.target.value })}><option value="PUBLIC">عمومی</option><option value="MEMBERS">فقط اعضای گروه</option><option value="STAFF">فقط تیم</option></select></label>
      <label className="studio-field"><span>عضویت</span><select className="input" value={group.joinMode} onChange={(e) => setGroup({ ...group, joinMode: e.target.value })}><option value="OPEN">آزاد</option><option value="REQUEST">با درخواست</option><option value="CLOSED">فقط با دعوت مدیر</option></select></label>
      <label className="studio-switch"><input type="checkbox" checked={group.moderator} onChange={(e) => setGroup({ ...group, moderator: e.target.checked })} />اعضا ناظر تالار هستند</label>
      <label className="studio-switch"><input type="checkbox" checked={group.mentionable} onChange={(e) => setGroup({ ...group, mentionable: e.target.checked })} />قابل نام‌بردن با @</label>
    </>}
    {group.automatic && <p className="muted fr-admin-wide">این گروه خودکار است؛ عضویت آن بر اساس نقش یا سطح اعتماد تعیین می‌شود و فقط ظاهرش قابل تغییر است.</p>}
    <div className="fr-admin-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{group.id ? 'ذخیرهٔ تغییرات' : 'افزودن گروه'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>انصراف</button></div>
  </form>
}

function MembersForm({ group, busy, call, onClose }: { group: Group; busy: boolean; call: Call; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const change = async (action: 'add' | 'remove') => { if (await call('POST', { section: 'members', action, slug: group.slug, username }, action === 'add' ? 'کاربر به گروه اضافه شد' : 'کاربر از گروه حذف شد')) setUsername('') }
  return <form className="fr-admin-form fa-panel" aria-label={`اعضای «${group.name}»`} onSubmit={(event) => { event.preventDefault(); void change('add') }}>
    <div className="fa-panel-head"><h3>اعضای «{group.name}» <small className="muted">{fa(group.memberCount)} عضو</small></h3><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div>
    <label className="studio-field fr-admin-wide"><span>نام کاربری</span><input ref={input} className="input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" required /></label>
    <div className="fr-admin-actions fr-admin-wide"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>افزودن به گروه</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !username} onClick={() => void change('remove')}>برداشتن از گروه</button><Link className="btn btn-ghost btn-sm" href={`/forum/g/${group.slug}`} target="_blank">فهرست اعضا ↗</Link></div>
  </form>
}
