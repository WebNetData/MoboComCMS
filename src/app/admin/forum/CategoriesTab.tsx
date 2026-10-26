'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { MAX_CATEGORY_DEPTH, categoryFamily, categoryTree } from '@/modules/forum/domain/tree'
import { LEVEL_LABEL, fa, type Call, type Category, type Group, type Level } from './shared'

type Draft = { id: number; parentId: number; slug: string; title: string; description: string; icon: string; color: string; access: string; locked: boolean; sortOrder: number; permissions: { groupId: number; level: Level }[]; moderators: string }
const EMPTY: Draft = { id: 0, parentId: 0, slug: '', title: '', description: '', icon: '💬', color: '#6366f1', access: 'PUBLIC', locked: false, sortOrder: 0, permissions: [], moderators: '' }
const KIND = ['بخش', 'انجمن', 'زیرانجمن']
const draftOf = (c: Category): Draft => ({ id: c.id, parentId: c.parentId || 0, slug: c.slug, title: c.title, description: c.description, icon: c.icon, color: c.color, access: c.access, locked: c.locked, sortOrder: c.sortOrder, permissions: c.permissions.map((row) => ({ groupId: row.groupId, level: row.level })), moderators: c.moderators.join('، ') })

/**
 * The forum's structure: sections, their forums and subforums as one tree, and the members' clubs apart.
 * The form opens for a new section, a forum inside a row, or a row being edited, and closes after saving.
 */
export default function CategoriesTab({ categories, groups, busy, call, remove }: { categories: Category[]; groups: Group[]; busy: boolean; call: Call; remove: (section: string, id: number, label: string, warning?: string) => void }) {
  const [view, setView] = useState<'forums' | 'clubs'>('forums')
  const [draft, setDraft] = useState<Draft | null>(null)
  const tree = categoryTree(categories)
  const clubs = categories.filter((c) => c.club)
  const forums = tree.filter((row) => !row.category.club)
  const childCount = (id: number) => categories.filter((c) => c.parentId === id).length
  const clubsUnder = (id: number) => clubs.filter((c) => c.parentId === id).length
  const group = new Map(groups.map((g) => [g.id, g]))
  const access = (c: Category) => c.permissions.length
    ? c.permissions.map((row) => <span key={row.groupId} className="sa-tag">{group.get(row.groupId)?.name || `#${row.groupId}`}: {LEVEL_LABEL[row.level]}</span>)
    : <span className="sa-tag">{c.access === 'MEMBERS' ? <span data-vip="">♛ VIP</span> : 'همه'}{c.locked ? ' · اطلاعیه' : ''}</span>
  const removeRow = (c: Category) => {
    const children = childCount(c.id)
    remove('categories', c.id, c.title, children ? `${fa(children)} زیرشاخهٔ آن به سطح اول منتقل می‌شود.` : undefined)
  }

  return <section className="sa-card fa-structure">
    <div className="sa-card-head">
      <div><h2>ساختار تالار</h2><small>بخش‌ها، انجمن‌های داخل هر بخش و زیرانجمن‌ها؛ کلوب‌های اعضا جدا فهرست شده‌اند.</small></div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setDraft({ ...EMPTY })}>+ بخش تازه</button>
    </div>
    <div className="sa-subtabs">
      <button type="button" className={view === 'forums' ? 'is-active' : ''} aria-pressed={view === 'forums'} onClick={() => setView('forums')}>بخش‌ها و انجمن‌ها<span>{fa(forums.length)}</span></button>
      <button type="button" className={view === 'clubs' ? 'is-active' : ''} aria-pressed={view === 'clubs'} onClick={() => setView('clubs')}>انجمن‌های کلوب‌ها<span>{fa(clubs.length)}</span></button>
    </div>
    {draft && <CategoryForm key={`${draft.id}-${draft.parentId}`} draft={draft} categories={categories} groups={groups} busy={busy} call={call} onClose={() => setDraft(null)} />}

    {view === 'forums' && <div className="sa-table-wrap"><table className="data sa-table sa-cards fa-tree">
      <thead><tr><th>نام</th><th>دسترسی</th><th>مدیران</th><th>موضوع</th><th>پیام</th><th><span className="sr-only">کارها</span></th></tr></thead>
      <tbody>
        {forums.map(({ category: c, depth }) => <tr key={c.id} className={`is-depth-${depth}`}>
          <td className="sa-card-main"><div className="fa-node" style={{ ['--fa-node' as string]: c.color }}>
            <span className="fa-node-icon" aria-hidden="true">{c.icon}</span>
            <span><b>{c.title}</b><small className="sa-sub">{KIND[depth] || KIND[2]} · <bdi dir="ltr">/forum/c/{c.slug}</bdi>{clubsUnder(c.id) > 0 && <> · {fa(clubsUnder(c.id))} کلوب</>}</small></span>
          </div></td>
          <td data-label="دسترسی"><div className="fa-perm-cell">{access(c)}</div></td>
          <td data-label="مدیران">{c.moderators.length ? <bdi dir="ltr" className="fa-mods">{c.moderators.map((name) => `@${name}`).join(' ')}</bdi> : <span className="sa-sub">—</span>}</td>
          <td data-label="موضوع">{fa(c.threadCount)}</td>
          <td data-label="پیام">{fa(c.postCount)}</td>
          <td className="sa-card-foot"><div className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(draftOf(c))}>ویرایش</button>
            {depth < MAX_CATEGORY_DEPTH - 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY, parentId: c.id, color: c.color })} aria-label={`+ ${KIND[depth + 1]} تازه در «${c.title}»`}>+ {KIND[depth + 1]}</button>}
            <Link className="btn btn-ghost btn-sm" href={`/forum/c/${c.slug}`} target="_blank">مشاهده ↗</Link>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => removeRow(c)}>حذف</button>
          </div></td>
        </tr>)}
        {!forums.length && <tr><td colSpan={6} className="sa-empty">هنوز بخشی ساخته نشده است.</td></tr>}
      </tbody>
    </table></div>}

    {view === 'clubs' && <div className="sa-table-wrap"><table className="data sa-table sa-cards">
      <thead><tr><th>کلوب</th><th>اعضا</th><th>دسترسی</th><th>موضوع</th><th>پیام</th><th><span className="sr-only">کارها</span></th></tr></thead>
      <tbody>
        {clubs.map((c) => <tr key={c.id}>
          <td className="sa-card-main"><div className="fa-node" style={{ ['--fa-node' as string]: c.color }}>
            <span className="fa-node-icon" aria-hidden="true">{c.icon}</span>
            <span><b>{c.club?.name || c.title}</b><small className="sa-sub"><bdi dir="ltr">/forum/c/{c.slug}</bdi>{c.moderators.length > 0 && <> · بنیان‌گذار <bdi dir="ltr">{c.moderators.map((name) => `@${name}`).join(' ')}</bdi></>}</small></span>
          </div></td>
          <td data-label="اعضا">{fa(c.club?.memberCount || 0)}</td>
          <td data-label="دسترسی"><div className="fa-perm-cell">{access(c)}</div></td>
          <td data-label="موضوع">{fa(c.threadCount)}</td>
          <td data-label="پیام">{fa(c.postCount)}</td>
          <td className="sa-card-foot"><div className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(draftOf(c))}>ویرایش انجمن</button>
            <Link className="btn btn-ghost btn-sm" href={`/forum/g/${c.club?.slug || ''}`} target="_blank">صفحهٔ کلوب ↗</Link>
          </div></td>
        </tr>)}
        {!clubs.length && <tr><td colSpan={6} className="sa-empty">هنوز کلوبی ساخته نشده است. ساخت کلوب را در «تنظیمات» روشن یا خاموش کنید.</td></tr>}
      </tbody>
    </table></div>}
  </section>
}

function CategoryForm({ draft, categories, groups, busy, call, onClose }: { draft: Draft; categories: Category[]; groups: Group[]; busy: boolean; call: Call; onClose: () => void }) {
  const [category, setCategory] = useState(draft)
  const title = useRef<HTMLInputElement>(null)
  useEffect(() => { title.current?.focus(); title.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const tree = categoryTree(categories)
  // A parent may be a section or a forum, never a subforum, a club's forum, or the category itself or something under it.
  const under = new Set(category.id ? categoryFamily(categories, category.id) : [])
  const parents = tree.filter((row) => row.depth < MAX_CATEGORY_DEPTH - 1 && !row.category.club && !under.has(row.category.id))
  const parent = categories.find((c) => c.id === category.parentId)
  const parentDepth = tree.find((row) => row.category.id === category.parentId)?.depth
  const kind = category.parentId ? KIND[(parentDepth ?? 0) + 1] || KIND[2] : KIND[0]
  const heading = category.id ? `ویرایش «${draft.title}»` : parent ? `${kind} تازه در «${parent.title}»` : 'بخش تازه'
  const groupName = new Map(groups.map((g) => [g.id, g]))
  function setPermission(groupId: number, level: Level | '') {
    const rest = category.permissions.filter((row) => row.groupId !== groupId)
    setCategory({ ...category, permissions: level ? [...rest, { groupId, level }] : rest })
  }

  return <form className="fr-admin-form fa-panel" aria-label={heading} onSubmit={async (event) => { event.preventDefault(); if (await call(category.id ? 'PATCH' : 'POST', { section: 'categories', ...category }, category.id ? `${kind} به‌روز شد` : `${kind} ساخته شد`)) onClose() }}>
    <div className="fa-panel-head"><h3>{heading}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div>
    <label className="studio-field"><span>عنوان</span><input ref={title} className="input" value={category.title} onChange={(e) => setCategory({ ...category, title: e.target.value })} required maxLength={120} /></label>
    <label className="studio-field"><span>نشانی (انگلیسی)</span><input className="input" dir="ltr" value={category.slug} onChange={(e) => setCategory({ ...category, slug: e.target.value })} placeholder="general" maxLength={60} /></label>
    <label className="studio-field"><span>جای آن</span><select className="input" value={category.parentId || 0} onChange={(e) => setCategory({ ...category, parentId: Number(e.target.value) })}><option value={0}>— بخش (سطح اول) —</option>{parents.map(({ category: c, depth }) => <option key={c.id} value={c.id}>{'— '.repeat(depth)}{c.title}</option>)}</select></label>
    <div className="studio-field" role="group" aria-label="آیکون و رنگ"><span aria-hidden="true">آیکون و رنگ</span><div className="fa-inline"><input className="input" value={category.icon} onChange={(e) => setCategory({ ...category, icon: e.target.value })} maxLength={8} aria-label="آیکون" /><input type="color" value={category.color} onChange={(e) => setCategory({ ...category, color: e.target.value })} aria-label="رنگ" /></div></div>
    <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })} maxLength={400} /></label>
    <label className="studio-field"><span>ترتیب</span><input className="input" type="number" value={category.sortOrder} onChange={(e) => setCategory({ ...category, sortOrder: Math.trunc(Number(e.target.value)) || 0 })} /></label>
    <label className="studio-field fr-admin-wide"><span>مدیران این {kind}</span><input className="input" dir="ltr" value={category.moderators} onChange={(e) => setCategory({ ...category, moderators: e.target.value })} placeholder="sara, kian" aria-describedby="fa-mods-help" /><small id="fa-mods-help" className="muted">نام کاربری اعضا را با ویرگول جدا کنید. مدیر در همین‌جا و هر چه زیر آن است می‌تواند موضوع و پیام را پنهان، حذف، قفل، سنجاق و منتقل کند و صف بررسی را ببیند؛ بیرون از آن عضو عادی است و به پنل مدیریت راه ندارد.</small></label>
    <fieldset className="fa-perms fr-admin-wide">
      <legend>دسترسی گروه‌ها</legend>
      <small className="muted">اگر هیچ گروهی تنظیم نشود، دسترسی ساده اعمال می‌شود: {category.access === 'MEMBERS' ? <span data-vip="">فقط VIP</span> : 'همه'}{category.locked ? '، ساخت موضوع فقط برای تیم' : ''}. با افزودن ردیف، فقط گروه‌های فهرست‌شده به این {kind} دسترسی دارند (تیم مدیریت همیشه دسترسی کامل دارد).</small>
      {!category.permissions.length && <div className="fa-inline fa-wrap">
        <label className="studio-field"><span>دسترسی ساده</span><select className="input" value={category.access} onChange={(e) => setCategory({ ...category, access: e.target.value })}><option value="PUBLIC">همه</option><option data-vip="" value="MEMBERS">فقط اعضای VIP</option></select></label>
        <label className="studio-switch"><input type="checkbox" checked={category.locked} onChange={(e) => setCategory({ ...category, locked: e.target.checked })} />فقط تیم موضوع بسازد (اطلاعیه‌ها)</label>
      </div>}
      {category.permissions.map((row) => <div key={row.groupId} className="fa-inline">
        <span className="fa-grow">{groupName.get(row.groupId)?.icon} {groupName.get(row.groupId)?.name || `#${row.groupId}`}</span>
        <select className="input" value={row.level} onChange={(e) => setPermission(row.groupId, e.target.value as Level)} aria-label="سطح دسترسی">{(Object.keys(LEVEL_LABEL) as Level[]).map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}</select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPermission(row.groupId, '')} aria-label="حذف ردیف">✕</button>
      </div>)}
      <select className="input" value="" onChange={(e) => { if (e.target.value) setPermission(Number(e.target.value), 'CREATE') }} aria-label="افزودن گروه">
        <option value="">+ افزودن گروه…</option>
        {groups.filter((g) => !category.permissions.some((row) => row.groupId === g.id)).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
      </select>
    </fieldset>
    <div className="fr-admin-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{category.id ? 'ذخیرهٔ تغییرات' : `افزودن ${kind}`}</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>انصراف</button></div>
  </form>
}
