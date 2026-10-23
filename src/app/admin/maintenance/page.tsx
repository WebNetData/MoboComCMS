'use client'

import { useCallback, useEffect, useState } from 'react'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Section = { id: string; label: string; paths: string[]; enabled: boolean; title: string; message: string }
type View = { sections: Section[]; defaults: { title: string; message: string }; limits: { title: number; message: number }; settingsRevision: string }

/** Maintenance mode, one section at a time: the switch, and the words visitors read while it is on. */
export default function SectionMaintenancePage() {
  const [view, setView] = useState<View | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { title: string; message: string }>>({})
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ id: string; text: string; error: boolean } | null>(null)

  const accept = (next: View) => { setView(next); setDrafts(Object.fromEntries(next.sections.map((section) => [section.id, { title: section.title, message: section.message }]))) }
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/maintenance', { cache: 'no-store' }).catch(() => null)
    if (!response?.ok) return setNote({ id: '', text: response?.status === 403 ? 'این صفحه نیاز به دسترسی تنظیمات سایت دارد.' : 'بارگذاری انجام نشد.', error: true })
    accept(await response.json())
  }, [])
  useEffect(() => { void load() }, [load])

  const send = async (section: Section, change: Record<string, unknown>, done: string) => {
    setBusy(section.id); setNote(null)
    const response = await fetch('/api/admin/maintenance', { method: 'PUT', headers: { 'content-type': 'application/json', ...(view?.settingsRevision ? { 'if-match': view.settingsRevision } : {}) }, body: JSON.stringify({ section: section.id, ...change }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy('')
    if (!response?.ok) return setNote({ id: section.id, text: body?.error || 'ذخیره نشد.', error: true })
    setView(body)
    const updated = body.sections.find((s: Section) => s.id === section.id)
    if (updated) setDrafts(previous => ({ ...previous, [section.id]: { title: updated.title, message: updated.message } }))
    setNote({ id: section.id, text: done, error: false })
  }

  if (!view) return <div className="card" dir="rtl" aria-busy={!note}>{note?.text || 'در حال بارگذاری…'}</div>
  return (
    <div dir="rtl" className="mnt-admin">
      <h1 className="h2">حالت تعمیر بخش‌ها</h1>
      <SectionSettingsHistoryLink section="maintenance" />
      <p className="muted">هر بخش را جداگانه به حالت تعمیر ببرید. تا وقتی روشن است، بازدیدکنندگان به‌جای آن بخش اعلان به‌روزرسانی را با متن شما می‌بینند؛ شما و مدیران همان بخش آن را مثل همیشه می‌بینید و می‌توانید پرش کنید. بخش مدیریت همیشه باز است.</p>
      <div className="mnt-admin-grid">
        {view.sections.map((section) => {
          const draft = drafts[section.id] || { title: '', message: '' }
          const changed = draft.title !== section.title || draft.message !== section.message
          return (
            <section key={section.id} className={`card mnt-admin-card${section.enabled ? ' is-on' : ''}`} aria-labelledby={`mnt-${section.id}`}>
              <header className="mnt-admin-head">
                <div><h2 id={`mnt-${section.id}`} className="h3">{section.label}</h2><span className="muted text-sm" dir="ltr">{section.paths.join('  ')}</span></div>
                <span className={`badge ${section.enabled ? 'badge-amber' : 'badge-green'}`}>{section.enabled ? 'در حال تعمیر' : 'باز'}</span>
              </header>
              <label className="label" htmlFor={`mnt-title-${section.id}`}>عنوان اعلان</label>
              <input id={`mnt-title-${section.id}`} className="input" maxLength={view.limits.title} placeholder={view.defaults.title} value={draft.title} onChange={(event) => setDrafts({ ...drafts, [section.id]: { ...draft, title: event.target.value } })} />
              <label className="label" htmlFor={`mnt-message-${section.id}`}>متن اعلان</label>
              <textarea id={`mnt-message-${section.id}`} className="textarea" rows={4} maxLength={view.limits.message} placeholder={view.defaults.message} value={draft.message} onChange={(event) => setDrafts({ ...drafts, [section.id]: { ...draft, message: event.target.value } })} />
              <p className="muted text-sm">خالی بماند، متن پیش‌فرض نمایش داده می‌شود.</p>
              <div className="flex gap-2 mnt-admin-actions">
                <button type="button" className="btn btn-secondary" disabled={busy === section.id || !changed} onClick={() => void send(section, draft, 'متن ذخیره شد.')}>ذخیرهٔ متن</button>
                <button type="button" className={`btn ${section.enabled ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === section.id} aria-pressed={section.enabled} onClick={() => void send(section, { ...draft, enabled: !section.enabled }, section.enabled ? 'بخش باز شد.' : 'بخش به حالت تعمیر رفت.')}>{section.enabled ? 'باز کردن بخش' : 'بردن به حالت تعمیر'}</button>
                {section.paths[0] ? <a className="btn btn-ghost" href={section.paths[0]} target="_blank" rel="noreferrer">دیدن بخش</a> : null}
              </div>
              {note?.id === section.id ? <p role={note.error ? 'alert' : 'status'} className={note.error ? 'text-danger text-sm' : 'text-sm'}>{note.text}</p> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
