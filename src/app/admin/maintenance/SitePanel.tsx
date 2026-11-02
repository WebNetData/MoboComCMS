'use client'

import { useState } from 'react'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import GroupPicker from '@/components/admin/GroupPicker'
import SiteNotice, { SITE_ICON_ART } from '@/components/site/maintenance/SiteNotice'
import { MAINTENANCE_MODES, SITE_DESIGNS, SITE_EFFECTS, SITE_ICONS, SITE_LIMITS, siteNoticeOf } from '@/modules/site/domain/maintenance'
import type { SiteGroup } from '@/modules/account/domain/site-groups'

export type SiteState = { enabled: boolean; mode: string; title: string; message: string; design: string; effect: string; icon: string; reopensAt: string; users: number[]; groups: string[] }
export type Person = { id: number; name: string | null; email: string | null }

/** The whole site's maintenance: who stays in, the words, and how the notice looks, with the notice itself beside them. */
export default function SitePanel({ site, people, catalog, busy, onSave, lookup }: { site: SiteState; people: Person[]; catalog: SiteGroup[]; busy: boolean; onSave: (change: Partial<SiteState>, done: string) => Promise<boolean>; lookup: (who: string) => Promise<Person | string> }) {
  const [draft, setDraft] = useState(site)
  const [known, setKnown] = useState(people)
  const [who, setWho] = useState('')
  const [wrong, setWrong] = useState('')
  const set = <K extends keyof SiteState>(key: K, value: SiteState[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const { enabled: _enabled, ...content } = draft
  const shown = siteNoticeOf(draft), blank = siteNoticeOf({ ...draft, title: '', message: '' })
  const changed = JSON.stringify(content) !== JSON.stringify((({ enabled: _on, ...rest }) => rest)(site))

  async function add() {
    setWrong('')
    const found = await lookup(who)
    if (typeof found === 'string') { setWrong(found); return }
    setKnown((current) => (current.some((person) => person.id === found.id) ? current : [...current, found]))
    set('users', draft.users.includes(found.id) ? draft.users : [...draft.users, found.id])
    setWho('')
  }
  async function toggle() {
    if (!site.enabled && !window.confirm('کل سایت برای بازدیدکنندگان بسته شود؟ فقط مدیر کل و افرادی که انتخاب کرده‌اید سایت را می‌بینند.')) return
    await onSave({ ...content, enabled: !site.enabled }, site.enabled ? 'سایت باز شد.' : 'حالت تعمیر کل سایت روشن شد.')
  }
  const choice = (legend: string, list: readonly { id: string; label: string }[], value: string, pick: (id: string) => void, art?: (id: string) => React.ReactNode, kind = '') => <fieldset className="smp-choices">
    <legend>{legend}</legend>
    {list.map((item) => <label key={item.id} className={`smp-choice ${kind}${value === item.id ? ' is-on' : ''}`}><input type="radio" name={legend} checked={value === item.id} onChange={() => pick(item.id)} />{art?.(item.id)}<span>{item.label}</span></label>)}
  </fieldset>

  return <section className={`card mnt-admin-card smp${site.enabled ? ' is-on' : ''}`} aria-labelledby="smp-title">
    <header className="smp-head">
      <div><h2 id="smp-title" className="h3">حالت تعمیر کل سایت</h2><p className="muted text-sm">با روشن کردن، همهٔ صفحه‌ها به‌جز ورود، بازگشت از درگاه پرداخت و لینک اشتراک مشتری‌ها بسته می‌شوند.</p></div>
      <span className={`badge ${site.enabled ? 'badge-amber' : 'badge-green'}`}>{site.enabled ? 'سایت بسته است' : 'سایت باز است'}</span>
    </header>
    <div className="smp-grid">
      <div className="smp-fields">
        {choice('نوع', MAINTENANCE_MODES, draft.mode, (id) => set('mode', id))}
        <label className="label" htmlFor="smp-heading">عنوان</label>
        <input id="smp-heading" className="input" maxLength={SITE_LIMITS.title} placeholder={blank.title} value={draft.title} onChange={(event) => set('title', event.target.value)} />
        <label className="label" htmlFor="smp-message">متن</label>
        <textarea id="smp-message" className="textarea" rows={3} maxLength={SITE_LIMITS.message} placeholder={blank.message} value={draft.message} onChange={(event) => set('message', event.target.value)} />
        <span className="label" id="smp-when">زمان بازگشایی (اختیاری، شمارش معکوس نشان داده می‌شود)</span>
        <JalaliDateInput withTime className="input" value={draft.reopensAt} onChange={(value) => set('reopensAt', value)} />
        {choice('قالب', SITE_DESIGNS, draft.design, (id) => set('design', id), (id) => <span className={`smp-swatch is-${id}`} aria-hidden="true" />)}
        {choice('افکت', SITE_EFFECTS, draft.effect, (id) => set('effect', id))}
        {choice('آیکن', SITE_ICONS, draft.icon, (id) => set('icon', id), (id) => SITE_ICON_ART[id], 'smp-icon-choice')}
      </div>
      <div className="smp-fields">
        <SiteNotice preview title={shown.title} message={shown.message} design={draft.design} effect={draft.effect} icon={draft.icon} reopensAt={draft.reopensAt} />
        <h3 className="h4">چه کسانی سایت را ببینند؟</h3>
        <p className="muted text-sm">مدیر کل همیشه سایت را می‌بیند. بقیه، حتی مدیران بخش‌ها، فقط اگر اینجا انتخاب شوند.</p>
        <div className="smp-add">
          <input className="input" dir="ltr" aria-label="ایمیل، موبایل یا شناسهٔ کاربر" placeholder="ایمیل، موبایل یا شناسهٔ کاربر" value={who} onChange={(event) => setWho(event.target.value)} />
          <button type="button" className="btn btn-ghost" disabled={busy || !who.trim()} onClick={() => void add()}>افزودن کاربر</button>
        </div>
        {wrong && <p className="text-danger text-sm" role="alert">{wrong}</p>}
        {draft.users.length > 0 && <ul className="smp-people">{draft.users.map((id) => { const person = known.find((row) => row.id === id); return <li key={id}><span>{person?.name || person?.email || `#${id}`}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => set('users', draft.users.filter((item) => item !== id))}>برداشتن</button></li> })}</ul>}
        <GroupPicker legend="گروه‌هایی که سایت را می‌بینند" groups={catalog} value={draft.groups} onChange={(groups) => set('groups', groups)} />
      </div>
    </div>
    <div className="smp-actions">
      <button type="button" className="btn btn-secondary" disabled={busy || !changed} onClick={() => void onSave(content, 'تنظیمات ذخیره شد.')}>ذخیره</button>
      <button type="button" className={`btn ${site.enabled ? 'btn-primary' : 'btn-ghost'}`} disabled={busy} aria-pressed={site.enabled} onClick={() => void toggle()}>{site.enabled ? 'باز کردن سایت' : 'بستن سایت'}</button>
      <a className="btn btn-ghost" href="/maintenance?site=1" target="_blank" rel="noreferrer">دیدن اعلان در صفحهٔ کامل</a>
    </div>
  </section>
}
