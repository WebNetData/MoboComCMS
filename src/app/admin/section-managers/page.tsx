'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Section = { id: string; label: string; hint: string }
type Staff = { id: number; email: string; name: string; status: string; kind: 'full' | 'sections' | 'authors' | 'custom'; roleName: string; sections: string[]; authorOf: string[]; twoFactor: boolean; lastLoginAt: string | null }

/**
 * One manager for each part of the site: pick an account and tick its sections. The role behind it is found
 * or made for exactly those sections, so nobody builds roles by hand for this.
 */
export default function SectionManagersPage() {
  const [sections, setSections] = useState<Section[]>([])
  // The sections that have authors: an author posts there and manages only what they posted.
  const [authorSections, setAuthorSections] = useState<Section[]>([])
  const [authorEmail, setAuthorEmail] = useState('')
  const [authorPicked, setAuthorPicked] = useState<string[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  // Ticks waiting to be saved, per account.
  const [draft, setDraft] = useState<Record<number, string[]>>({})

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/section-managers', { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { setSections(data.sections); setAuthorSections(data.authorSections || []); setStaff(data.staff) } else setNotice({ tone: 'err', text: data?.error === 'forbidden' ? 'برای این صفحه دسترسی «نقش‌ها» لازم است.' : data?.error || 'بارگذاری نشد.' })
    setLoaded(true)
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(target: { userId?: number; email?: string }, list: string[], done: string, as: 'manager' | 'author' = 'manager') {
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/section-managers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...target, sections: list, as }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'err', text: data?.error || 'انجام نشد؛ دوباره تلاش کنید.' }); return false }
    setStaff(data.staff); setDraft({}); setNotice({ tone: 'ok', text: done })
    return true
  }
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
  const label = (id: string) => sections.find((section) => section.id === id)?.label || id
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item))
  const managersOf = (id: string) => staff.filter((row) => row.kind !== 'full' && row.sections.includes(id))
  const authorsOf = (id: string) => staff.filter((row) => row.kind === 'authors' && row.authorOf.includes(id))
  const authorLabel = (id: string) => authorSections.find((section) => section.id === id)?.label || id

  if (!loaded) return <div className="tb-empty">در حال بارگذاری…</div>
  return (
    <div dir="rtl">
      <h1 className="h2 mb-2">مدیران و نویسندگان بخش‌ها</h1>
      <p className="muted mb-6">برای هر بخش سایت یک یا چند مدیر تعیین کنید. هر مدیر فقط به بخش‌هایی که تیک خورده دسترسی دارد و نه به بقیهٔ پنل. نقش‌های دیگر (پشتیبان، حسابدار و مانند آن) از <Link href="/admin/roles">نقش‌ها و دسترسی‌ها</Link> ساخته می‌شوند؛ مدیران هر انجمن و معاونان تالار از <Link href="/admin/forum?tab=team">تیم تالار</Link>.</p>

      {notice && <p className={notice.tone === 'err' ? 'error-text mb-4' : 'sm-notice mb-4'} role={notice.tone === 'err' ? 'alert' : 'status'}>{notice.text}</p>}

      <section className="sm-board mb-6" aria-label="بخش‌ها و مدیرانشان">
        {sections.map((section) => {
          const people = managersOf(section.id)
          return <article key={section.id} className="card sm-section">
            <h2>{section.label}</h2>
            <p className="muted">{section.hint}</p>
            {people.length ? <ul>{people.map((row) => <li key={row.id}><b>{row.name || row.email}</b>{row.name && <small dir="ltr">{row.email}</small>}</li>)}</ul> : <p className="sm-none">مدیر جداگانه ندارد؛ فقط مدیر کل سایت.</p>}
            {authorsOf(section.id).length > 0 && <><p className="muted">نویسندگان</p><ul data-testid={`authors-of-${section.id}`}>{authorsOf(section.id).map((row) => <li key={row.id}><b>{row.name || row.email}</b>{row.name && <small dir="ltr">{row.email}</small>}</li>)}</ul></>}
          </article>
        })}
      </section>

      <div className="sm-adds">
      <form className="card mb-6 sm-add" onSubmit={async (event) => { event.preventDefault(); if (await save({ email }, picked, 'مدیر بخش اضافه شد.')) { setEmail(''); setPicked([]) } }}>
        <h2>افزودن مدیر</h2>
        <label className="label" htmlFor="sm-email">ایمیل حساب (باید پیش‌تر در سایت ثبت‌نام کرده باشد)</label>
        <input id="sm-email" className="input" dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
        <fieldset className="sm-ticks"><legend className="label">بخش‌ها</legend>
          {sections.map((section) => <label key={section.id}><input type="checkbox" checked={picked.includes(section.id)} onChange={() => setPicked(toggle(picked, section.id))} />{section.label}</label>)}
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim() || !picked.length}>افزودن</button>
      </form>

      <form className="card mb-6 sm-add" aria-label="افزودن نویسنده" onSubmit={async (event) => { event.preventDefault(); if (await save({ email: authorEmail }, authorPicked, 'نویسنده اضافه شد.', 'author')) { setAuthorEmail(''); setAuthorPicked([]) } }}>
        <h2>افزودن نویسنده</h2>
        <p className="muted">نویسنده فقط در بخش‌های تیک‌خورده مطلب می‌گذارد و فقط مطالب خودش را می‌بیند و ویرایش می‌کند. حذف مطلبش آن را به سطل زباله می‌برد و حذف نهایی یا بازگردانی با مدیر همان بخش یا مدیر کل است.</p>
        <label className="label" htmlFor="sm-author-email">ایمیل حساب (باید پیش‌تر در سایت ثبت‌نام کرده باشد)</label>
        <input id="sm-author-email" className="input" dir="ltr" type="email" value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} placeholder="name@example.com" required />
        <fieldset className="sm-ticks"><legend className="label">نویسندهٔ کدام بخش‌ها</legend>
          {authorSections.map((section) => <label key={section.id}><input type="checkbox" checked={authorPicked.includes(section.id)} onChange={() => setAuthorPicked(toggle(authorPicked, section.id))} />{section.label}</label>)}
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy || !authorEmail.trim() || !authorPicked.length}>افزودن نویسنده</button>
      </form>
      </div>

      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>حساب</th><th>جایگاه</th><th>بخش‌ها</th><th>ورود دومرحله‌ای</th><th /></tr></thead>
          <tbody>{staff.map((row) => {
            const author = row.kind === 'authors'
            const current = draft[row.id] ?? (author ? row.authorOf : row.sections)
            const changed = (row.kind === 'sections' && !same(current, row.sections)) || (author && !same(current, row.authorOf))
            const noun = author ? 'نویسنده' : 'مدیر'
            return <tr key={row.id}>
              <td><b>{row.name || '—'}</b><br /><small className="muted" dir="ltr">{row.email}</small>{row.status !== 'ACTIVE' && <span className="badge badge-gray">غیرفعال</span>}</td>
              <td>{row.roleName}{row.kind === 'custom' && <><br /><small className="muted">نقش سفارشی؛ از «نقش‌ها» تغییر می‌کند</small></>}</td>
              <td>{author
                ? <span className="sm-ticks is-row">{authorSections.map((section) => <label key={section.id}><input type="checkbox" checked={current.includes(section.id)} disabled={busy} onChange={() => setDraft({ ...draft, [row.id]: toggle(current, section.id) })} />{authorLabel(section.id)}</label>)}</span>
                : row.kind === 'sections'
                ? <span className="sm-ticks is-row">{sections.map((section) => <label key={section.id}><input type="checkbox" checked={current.includes(section.id)} disabled={busy} onChange={() => setDraft({ ...draft, [row.id]: toggle(current, section.id) })} />{section.label}</label>)}</span>
                : row.kind === 'full' ? <span className="muted">همهٔ بخش‌ها</span> : row.sections.length ? row.sections.map(label).join('، ') : <span className="muted">—</span>}</td>
              <td>{row.twoFactor ? 'فعال' : <span className="muted">خاموش</span>}</td>
              <td className="sm-actions">{(row.kind === 'sections' || author) && <>
                {changed && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save({ userId: row.id }, current, current.length ? `بخش‌های این ${noun} به‌روز شد.` : `این حساب دیگر ${noun} نیست.`, author ? 'author' : 'manager')}>ذخیره</button>}
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(`«${row.name || row.email}» دیگر ${noun} نباشد؟ حسابش عضو عادی می‌ماند.`)) void save({ userId: row.id }, [], `این حساب دیگر ${noun} نیست.`, author ? 'author' : 'manager') }}>برداشتن</button>
              </>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </div>
  )
}
