'use client'

import { useRef, useState } from 'react'
import Link from '@/components/AppLink'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import GroupPicker from '@/components/admin/GroupPicker'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import type { SiteGroup } from '@/modules/account/domain/site-groups'
import { Notice, fa, send, useJson } from '../store/shared'
import './user-groups.css'

type Group = { id: number; name: string; description: string; color: string; active: boolean; vipBenefits: boolean; hideAds: boolean; discountPercent: number; showBadge: boolean; sortOrder: number; members: number; updatedAt?: string }
type Draft = Omit<Group, 'id' | 'members'> & { id?: number }
type Data = { groups: Group[]; catalog: SiteGroup[]; access: Record<string, string[]>; accessRevision: string; sections: { id: string; label: string }[] }
type Member = { id: number; userId: number; expiresAt: string | null; note: string; user: { id: number; name: string | null; email: string | null; phone: string | null } }
type Members = { rows: Member[]; total: number; pages: number; asOf: string }
type Say = (tone: 'ok' | 'error', text: string) => void

const EMPTY: Draft = { name: '', description: '', color: '#4b45ee', active: true, vipBenefits: false, hideAds: false, discountPercent: 0, showBadge: true, sortOrder: 0 }
const API = '/api/admin/user-groups'
const numericValue = (input: HTMLInputElement, previous: number) => input.value === '' ? 0 : Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : previous

const gives = (group: Group) => [group.vipBenefits && 'مزایای عضویت ویژه', group.hideAds && 'بدون تبلیغ', group.discountPercent > 0 && `${fa(group.discountPercent)}٪ تخفیف فروشگاه`].filter(Boolean).join('، ') || 'بدون مزیت عمومی'

function GroupEditor({ draft, onCancel, onSaved, say }: { draft: Draft; onCancel: () => void; onSaved: () => void; say: Say }) {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }))
  async function save() {
    setBusy(true)
    const result = await send(API, 'POST', { op: 'save', group: form })
    setBusy(false)
    if (result.ok) { say('ok', 'گروه ذخیره شد.'); onSaved() } else say('error', result.error)
  }
  return <section className="sa-card ug-editor" aria-labelledby="ug-editor-title">
    <header className="sa-card-head"><h2 id="ug-editor-title">{form.id ? 'ویرایش گروه' : 'گروه تازه'}</h2></header>
    <div className="ug-grid">
      <label className="sa-field"><span>نام گروه</span><input className="input" value={form.name} maxLength={60} onChange={(event) => set('name', event.target.value)} /></label>
      <label className="sa-field"><span>رنگ</span><input className="input ug-color" type="color" value={form.color} onChange={(event) => set('color', event.target.value)} /></label>
      <label className="sa-field ug-wide"><span>توضیح (برای مدیران)</span><input className="input" value={form.description} maxLength={300} onChange={(event) => set('description', event.target.value)} /></label>
      <label className="sa-field"><span>ترتیب نمایش</span><input className="input" type="number" dir="ltr" value={form.sortOrder} onChange={(event) => set('sortOrder', numericValue(event.target, form.sortOrder))} /></label>
    </div>
    <fieldset className="ug-gives">
      <legend>این گروه چه چیزی می‌گیرد</legend>
      <label><input type="checkbox" checked={form.vipBenefits} onChange={(event) => set('vipBenefits', event.target.checked)} /><span>مزایای عضویت ویژه<small>قیمت ویژه و محتوای مخصوص اعضای ویژه</small></span></label>
      <label><input type="checkbox" checked={form.hideAds} onChange={(event) => set('hideAds', event.target.checked)} /><span>سایت بدون تبلیغ<small>تبلیغ‌های سایت به اعضا نشان داده نمی‌شود</small></span></label>
      <label className="sa-field ug-percent"><span>تخفیف فروشگاه (درصد)</span><input className="input" type="number" min={0} max={90} dir="ltr" value={form.discountPercent} onChange={(event) => set('discountPercent', numericValue(event.target, form.discountPercent))} /></label>
      <label><input type="checkbox" checked={form.showBadge} onChange={(event) => set('showBadge', event.target.checked)} /><span>نمایش زیر نام کاربر<small>نام گروه در کادر زیر نام اعضا در تالار دیده می‌شود</small></span></label>
      <label><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} /><span>فعال<small>گروه غیرفعال هیچ دسترسی و مزیتی نمی‌دهد</small></span></label>
    </fieldset>
    <p className="sa-hint">این گروه دسترسی به پنل مدیریت نمی‌دهد؛ کارکنان (صندوق‌دار، کارشناس فرم، پشتیبان و…) با <Link href="/admin/roles">نقش‌ها و دسترسی کارکنان</Link> و مدیران هر بخش با <Link href="/admin/section-managers">مدیران بخش‌ها</Link> تعیین می‌شوند.</p>
    <div className="ug-actions">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ گروه'}</button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button>
    </div>
  </section>
}

function GroupMembers({ group, onChanged, onClose, say }: { group: Group; onChanged: () => void; onClose: () => void; say: Say }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [who, setWho] = useState('')
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const userInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, reload } = useJson<Members>(`${API}?group=${group.id}&q=${encodeURIComponent(query)}&page=${page}`)

  async function run(body: Record<string, unknown>, text: string) {
    setBusy(true)
    const result = await send(API, 'POST', { id: group.id, ...body })
    setBusy(false)
    if (!result.ok) { say('error', result.error); return false }
    say('ok', text); void reload(); onChanged()
    return true
  }
  const clear = () => { setWho(''); setUntil(''); setNote(''); setEditing(null) }
  async function add() { if (await run({ op: 'member.add', user: who, expiresAt: until || null, note }, editing ? 'عضویت به‌روزرسانی شد.' : 'عضو اضافه شد.')) clear() }
  function editMember(row: Member) { setEditing(row.userId); setWho(String(row.userId)); setUntil(row.expiresAt || ''); setNote(row.note); userInput.current?.focus() }

  return <section className="sa-card" aria-labelledby="ug-members-title">
    <header className="sa-card-head"><h2 id="ug-members-title">اعضای {group.name}</h2><button type="button" className="btn btn-ghost" onClick={onClose}>بستن</button></header>
    <div className="ug-add">
      <label className="sa-field"><span>کاربر (ایمیل، موبایل یا شناسه)</span><input ref={userInput} className="input" dir="ltr" value={who} readOnly={editing !== null} onChange={(event) => setWho(event.target.value)} /></label>
      <label className="sa-field"><span>پایان عضویت (اختیاری)</span><JalaliDateInput withTime className="input" value={until} onChange={setUntil} /></label>
      <label className="sa-field"><span>یادداشت</span><input className="input" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="ug-actions"><button type="button" className="btn btn-primary" disabled={busy || !who.trim()} onClick={() => void add()}>{editing ? 'ذخیرهٔ عضویت' : 'افزودن'}</button>{editing && <button type="button" className="btn btn-ghost" disabled={busy} onClick={clear}>انصراف از ویرایش</button>}</div>
    </div>
    <label className="sa-field ug-search"><span>جست‌وجو میان اعضا</span><input className="input" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label>
    {error && <div className="sa-hint" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></div>}
    {!data && !error && <p className="sa-hint" role="status">در حال دریافت اعضا…</p>}
    {data && (data.rows.length ? <div className="ug-scroll"><table className="sa-table">
      <thead><tr><th>کاربر</th><th>پایان عضویت</th><th>یادداشت</th><th><span className="sr-only">کار</span></th></tr></thead>
      <tbody>{data.rows.map((row) => {
        const ended = row.expiresAt ? new Date(row.expiresAt).getTime() <= new Date(data.asOf).getTime() : false
        return <tr key={row.id}>
          <td><Link href={`/admin/users/${row.userId}`}>{row.user.name || row.user.email || row.user.phone || `#${fa(row.userId)}`}</Link></td>
          <td className={ended ? 'ug-ended' : ''}>{row.expiresAt ? `${new Date(row.expiresAt).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })}${ended ? ' (پایان یافته)' : ''}` : 'بدون پایان'}</td>
          <td>{row.note || '—'}</td>
          <td className="ug-row-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => editMember(row)}>ویرایش عضویت</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run({ op: 'member.remove', userId: row.userId }, 'عضو حذف شد.')}>حذف</button></td>
        </tr>
      })}</tbody>
    </table></div> : <p className="sa-hint">{query ? 'عضوی با این مشخصات پیدا نشد.' : 'این گروه هنوز عضوی ندارد.'}</p>)}
    {data && data.pages > 1 && <nav className="ug-pages" aria-label="صفحه‌های اعضا">
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
      <span>{fa(page)} از {fa(data.pages)}</span>
      <button type="button" className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button>
    </nav>}
  </section>
}

function SectionAccess({ data, onSaved, say }: { data: Data; onSaved: () => void; say: Say }) {
  const [access, setAccess] = useState<Record<string, string[]>>(data.access)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const result = await send(API, 'POST', { op: 'sections', access, revision: data.accessRevision })
    setBusy(false)
    if (result.ok) { say('ok', 'دسترسی بخش‌ها ذخیره شد.'); onSaved() } else say('error', result.error)
  }
  return <section className="sa-card" aria-labelledby="ug-sections-title">
    <header className="sa-card-head"><h2 id="ug-sections-title">دسترسی بخش‌ها</h2><SectionSettingsHistoryLink section="section-access" /></header>
    <p className="sa-hint">بخشی که گروهی برایش انتخاب نشود برای همه باز است. انتخاب چند گروه یعنی عضویت در یکی از آن‌ها کافی است. مهمان‌ها وارد حساب می‌شوند و مدیران همان بخش همیشه دسترسی دارند.</p>
    <div className="ug-sections">{data.sections.map((section) => {
      const chosen = access[section.id] || []
      const catalog: SiteGroup[] = section.id === 'vpn' && !data.catalog.some(group => group.key === 'vip') ? [...data.catalog, { key: 'vip', label: 'اعضای ویژه (نیازمند فعال‌بودن VIP)', family: 'vip', count: 0 }] : data.catalog
      return <details key={section.id} className="ug-section" open={section.id === 'vpn'}>
        <summary><span>{section.label}</span><small className={chosen.length ? 'is-limited' : ''}>{chosen.length ? `فقط ${fa(chosen.length)} گروه` : 'باز برای همه'}</small></summary>
        {section.id === 'vpn' && <div className="ug-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAccess(current => ({ ...current, vpn: ['vip'] }))}>فقط اعضای VIP</button><p className="sa-hint">برای VIP یا گروه خاص، گزینه‌های دلخواه را با هم انتخاب کنید. فعال‌بودن ماژول VPN و برای گزینهٔ VIP فعال‌بودن اشتراک ویژه لازم است؛ این تنظیم ماژول‌ها را روشن نمی‌کند.</p></div>}
        <GroupPicker legend={`گروه‌های ${section.label}`} groups={catalog} value={chosen} onChange={(next) => setAccess((current) => ({ ...current, [section.id]: next }))} />
      </details>
    })}</div>
    <div className="ug-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ دسترسی بخش‌ها'}</button></div>
  </section>
}

export default function UserGroupsPage() {
  const { data, error, reload } = useJson<Data>(API)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const say: Say = (tone, text) => setNotice({ tone, text })
  const open = data?.groups.find((group) => group.id === openId) || null

  async function remove(group: Group) {
    if (!window.confirm(`گروه «${group.name}» حذف شود؟ عضویت‌ها و قیمت‌های آن پاک می‌شود و موردی که فقط برای این گروه بوده بسته می‌ماند.`)) return
    const result = await send(API, 'POST', { op: 'delete', id: group.id })
    if (result.ok) { say('ok', 'گروه حذف شد.'); if (openId === group.id) setOpenId(null); void reload() } else say('error', result.error)
  }

  return <div className="sa ug" dir="rtl">
    <header className="sa-head">
      <div><h1>گروه‌های اعضا و مشتریان</h1><p className="sa-hint">برای هر گروه تعیین کنید چه مزایایی بگیرد و چه بخش‌هایی را ببیند. برای یک محصول، مطلب، فیلم یا بازی هم از صفحهٔ ویرایش همان مورد مخاطب انتخاب کنید.</p></div>
      {!draft && <div className="sa-head-actions"><button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setDraft({ ...EMPTY }) }}>گروه تازه</button></div>}
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error} <button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></Notice>}
    {!data && !error && <p className="sa-hint" role="status">در حال دریافت گروه‌ها…</p>}
    {draft && <GroupEditor key={draft.id || 'new'} draft={draft} say={say} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); void reload() }} />}
    {data && <section className="sa-card" aria-label="فهرست گروه‌ها">
      {data.groups.length ? <div className="ug-scroll"><table className="sa-table">
        <thead><tr><th>گروه</th><th>اعضا</th><th>مزایا</th><th>وضعیت</th><th><span className="sr-only">کارها</span></th></tr></thead>
        <tbody>{data.groups.map((group) => <tr key={group.id}>
          <td><span className="ug-name"><i style={{ background: group.color }} aria-hidden="true" />{group.name}</span>{group.description && <small className="ug-desc">{group.description}</small>}</td>
          <td className="ug-num">{fa(group.members)}</td>
          <td>{gives(group)}</td>
          <td><span className={`sa-state ${group.active ? 'is-ok' : ''}`}>{group.active ? 'فعال' : 'غیرفعال'}</span></td>
          <td className="ug-row-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpenId(group.id)}>اعضا</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setNotice(null); setDraft(group); window.scrollTo({ top: 0 }) }}>ویرایش</button>
            <button type="button" className="btn btn-ghost" onClick={() => void remove(group)}>حذف</button>
          </td>
        </tr>)}</tbody>
      </table></div> : <p className="sa-hint">هنوز گروهی ساخته نشده است. نخستین گروه را بسازید.</p>}
    </section>}
    {open && <GroupMembers key={open.id} group={open} say={say} onClose={() => setOpenId(null)} onChanged={() => void reload()} />}
    {data && <SectionAccess key={JSON.stringify(data.access)} data={data} say={say} onSaved={() => void reload()} />}
  </div>
}
