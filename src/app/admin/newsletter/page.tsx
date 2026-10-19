'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { Notice, Pager, fa, faDate } from '../store/shared'
import JalaliDateInput from '@/components/date/JalaliDateInput'

const RichEditor = dynamic(() => import('@/components/editor/ContentEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

type Campaign = { id: number; subject: string; preheader: string; audience: string; status: string; scheduledAt: string | null; startedAt: string | null; finishedAt: string | null; total: number; sent: number; failed: number; opens: number; clicks: number; createdAt: string }
type Draft = { id?: number; subject: string; preheader: string; html: string; audience: string }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const AUDIENCE: Record<string, string> = { subscribers: 'عضوهای خبرنامه', users: 'همهٔ کاربران (اعلان ایمیلی روشن)', customers: 'مشتریانی که خرید کرده‌اند', all: 'عضوهای خبرنامه + همهٔ کاربران' }
const STATUS: Record<string, [string, string]> = { DRAFT: ['پیش‌نویس', ''], SCHEDULED: ['زمان‌بندی‌شده', 'is-info'], SENDING: ['در حال ارسال', 'is-warn'], SENT: ['ارسال شد', 'is-ok'], CANCELLED: ['لغو شد', 'is-bad'] }
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

async function call<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch('/api/admin/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true, data: data as T } : { ok: false, error: data?.error || 'انجام نشد' }
}

function useView<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [url])
  useEffect(() => { void reload() }, [reload])
  return { data, error, reload }
}

// ------------------------------------------------------------------ editor

function Editor({ initial, sizes, onDone }: { initial: Draft; sizes: Record<string, number> | null; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState('')
  const [testTo, setTestTo] = useState('')
  const [preview, setPreview] = useState('')
  const [when, setWhen] = useState('')

  async function save(): Promise<number | null> {
    setBusy('save'); setNotice(null)
    const result = await call<{ id: number }>({ op: 'save', campaign: draft })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return null }
    setDraft({ ...draft, id: result.data.id })
    return result.data.id
  }
  async function schedule(now: boolean) {
    const id = await save()
    if (!id) return
    const audienceSize = sizes?.[draft.audience] ?? 0
    if (!window.confirm(now ? `کمپین برای ${fa(audienceSize)} نفر ارسال شود؟` : `کمپین برای ${when} زمان‌بندی شود؟`)) return
    setBusy('send')
    const result = await call({ op: 'schedule', id, at: now ? null : new Date(when).toISOString() })
    setBusy('')
    if (result.ok) onDone(); else setNotice({ tone: 'error', text: result.error })
  }
  async function test() {
    setBusy('test'); setNotice(null)
    const result = await call({ op: 'test', campaign: draft, to: testTo })
    setBusy('')
    setNotice(result.ok ? { tone: 'ok', text: `ایمیل آزمایشی به ${testTo} فرستاده شد.` } : { tone: 'error', text: result.error })
  }
  async function showPreview() {
    const result = await call<{ html: string }>({ op: 'preview', campaign: draft })
    if (result.ok) setPreview(result.data.html); else setNotice({ tone: 'error', text: result.error })
  }

  return <div className="nl-editor">
    <section className="sa-card sa-form">
      <label className="sa-field"><span>موضوع ایمیل</span><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={200} placeholder="تخفیف‌های آخر هفته 🎁" /></label>
      <label className="sa-field"><span>پیش‌متن (کنار موضوع در صندوق ایمیل دیده می‌شود)</span><input className="input" value={draft.preheader} onChange={(e) => setDraft({ ...draft, preheader: e.target.value })} maxLength={200} /></label>
      <label className="sa-field"><span>گیرندگان</span><select className="select" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([key, label]) => <option key={key} value={key}>{label}{sizes ? ` — ${fa(sizes[key] || 0)} نفر` : ''}</option>)}</select></label>
      <div className="sa-field"><span>متن ایمیل</span><RichEditor value={draft.html} onChange={(html) => setDraft({ ...draft, html })} dir="rtl" minHeight={320} /></div>
      <p className="sa-hint">پیوندها برای شمارش کلیک و یک تصویر ۱×۱ برای شمارش بازشدن خودکار اضافه می‌شود. پیوند لغو عضویت همیشه در پایین ایمیل هست.</p>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="sa-head-actions nl-actions">
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void save().then((id) => id && setNotice({ tone: 'ok', text: 'پیش‌نویس ذخیره شد.' }))}>ذخیرهٔ پیش‌نویس</button>
        <button type="button" className="btn btn-ghost" onClick={() => void showPreview()}>پیش‌نمایش</button>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void schedule(true)}>{busy === 'send' ? 'در حال ثبت…' : 'ارسال اکنون'}</button>
      </div>
      <div className="nl-row">
        <JalaliDateInput withTime className="input" value={when} onChange={(value) => setWhen(value)} aria-label="زمان ارسال" />
        <button type="button" className="btn btn-ghost" disabled={!when || !!busy} onClick={() => void schedule(false)}>زمان‌بندی ارسال</button>
      </div>
      <div className="nl-row">
        <input className="input" type="email" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="ایمیل آزمایشی" aria-label="ایمیل آزمایشی" />
        <button type="button" className="btn btn-ghost" disabled={!testTo || !!busy} onClick={() => void test()}>{busy === 'test' ? 'در حال ارسال…' : 'ارسال آزمایشی'}</button>
      </div>
    </section>
    {preview && <section className="sa-card nl-preview"><header className="sa-card-head"><h2>پیش‌نمایش</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview('')}>بستن</button></header><iframe title="پیش‌نمایش ایمیل" sandbox="" srcDoc={preview} /></section>}
  </div>
}

// ------------------------------------------------------------------ campaigns

function Campaigns({ onEdit }: { onEdit: (draft: Draft) => void }) {
  const { data, error, reload } = useView<{ campaigns: Campaign[] }>('/api/admin/newsletter?view=campaigns')
  const [notice, setNotice] = useState<Tone>(null)
  const [report, setReport] = useState<{ campaign: Campaign; statuses: Record<string, number>; recent: { email: string; status: string; error: string; openedAt: string | null; opens: number; clicks: number }[] } | null>(null)
  useEffect(() => {
    if (!data?.campaigns.some((row) => row.status === 'SENDING' || row.status === 'SCHEDULED')) return
    const timer = setInterval(() => void reload(), 5000)
    return () => clearInterval(timer)
  }, [data, reload])
  async function act(body: Record<string, unknown>, text: string) {
    const result = await call(body)
    setNotice(result.ok ? { tone: 'ok', text } : { tone: 'error', text: result.error })
    void reload()
  }
  async function open(id: number) {
    const response = await fetch(`/api/admin/newsletter?view=campaign&id=${id}`, { cache: 'no-store' })
    const row = await response.json()
    if (response.ok) onEdit({ id: row.id, subject: row.subject, preheader: row.preheader, html: row.html, audience: row.audience })
  }
  async function showReport(id: number) {
    const response = await fetch(`/api/admin/newsletter?view=report&id=${id}`, { cache: 'no-store' })
    if (response.ok) setReport(await response.json())
  }
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  const sent = data.campaigns.reduce((sum, row) => sum + row.sent, 0)
  const opens = data.campaigns.reduce((sum, row) => sum + row.opens, 0)
  const clicks = data.campaigns.reduce((sum, row) => sum + row.clicks, 0)
  return <>
    <div className="sa-kpis">
      <div className="sa-kpi"><small>ایمیل‌های ارسال‌شده</small><b className="num">{fa(sent)}</b></div>
      <div className="sa-kpi"><small>نرخ بازشدن</small><b className="num">{fa(pct(opens, sent))}٪</b></div>
      <div className="sa-kpi"><small>نرخ کلیک</small><b className="num">{fa(pct(clicks, sent))}٪</b></div>
      <div className="sa-kpi"><small>کمپین‌ها</small><b className="num">{fa(data.campaigns.length)}</b></div>
    </div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 820 }}><thead><tr><th>کمپین</th><th>گیرندگان</th><th>وضعیت</th><th>ارسال</th><th>باز شده</th><th>کلیک</th><th /></tr></thead><tbody>
        {data.campaigns.map((row) => { const [label, tone] = STATUS[row.status] || [row.status, '']; return <tr key={row.id}>
          <td><b>{row.subject}</b><br /><small className="sa-hint">{faDate(row.createdAt)}</small></td>
          <td><small>{AUDIENCE[row.audience] || row.audience}</small></td>
          <td><span className={`sa-state ${tone}`}>{label}</span>{row.status === 'SCHEDULED' && row.scheduledAt && <><br /><small>{faDate(row.scheduledAt, true)}</small></>}</td>
          <td className="num">{fa(row.sent)}{row.total ? ` / ${fa(row.total)}` : ''}{row.failed ? <><br /><small className="nl-fail">{fa(row.failed)} ناموفق</small></> : null}{row.status === 'SENDING' && row.total > 0 && <span className="nl-bar"><i style={{ inlineSize: `${pct(row.sent + row.failed, row.total)}%` }} /></span>}</td>
          <td className="num">{fa(row.opens)} <small>({fa(pct(row.opens, row.sent))}٪)</small></td>
          <td className="num">{fa(row.clicks)} <small>({fa(pct(row.clicks, row.sent))}٪)</small></td>
          <td className="sp-row-actions">
            {['DRAFT', 'SCHEDULED'].includes(row.status) && <button type="button" className="sa-link" onClick={() => void open(row.id)}>ویرایش</button>}
            {row.status !== 'DRAFT' && <button type="button" className="sa-link" onClick={() => void showReport(row.id)}>گزارش</button>}
            <button type="button" className="sa-link" onClick={() => void act({ op: 'duplicate', id: row.id }, 'کپی ساخته شد.')}>کپی</button>
            {['SCHEDULED', 'SENDING'].includes(row.status) && <button type="button" className="sa-link is-danger" onClick={() => void act({ op: 'cancel', id: row.id }, 'لغو شد.')}>لغو</button>}
            {row.status !== 'SENDING' && <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm('کمپین حذف شود؟')) void act({ op: 'delete', id: row.id }, 'حذف شد.') }}>حذف</button>}
          </td>
        </tr> })}
        {!data.campaigns.length && <tr><td colSpan={7} className="sa-empty">هنوز کمپینی نساخته‌اید.</td></tr>}
      </tbody></table>
    </section>
    {report && <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>گزارش «{report.campaign.subject}»</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setReport(null)}>بستن</button></header>
      <p className="sa-hint">ارسال‌شده {fa(report.statuses.SENT || 0)} · در صف {fa(report.statuses.PENDING || 0)} · ناموفق {fa(report.statuses.FAILED || 0)}</p>
      <table className="data sa-table" style={{ minWidth: 560 }}><thead><tr><th>ایمیل</th><th>وضعیت</th><th>بازشدن</th><th>کلیک</th></tr></thead><tbody>
        {report.recent.map((row) => <tr key={row.email}><td dir="ltr">{row.email}</td><td>{row.status === 'FAILED' ? <small className="nl-fail">{row.error}</small> : row.status}</td><td className="num">{row.openedAt ? `${fa(row.opens)} بار` : '—'}</td><td className="num">{fa(row.clicks)}</td></tr>)}
        {!report.recent.length && <tr><td colSpan={4} className="sa-empty">هنوز بازشدنی ثبت نشده است.</td></tr>}
      </tbody></table>
    </section>}
  </>
}

// ------------------------------------------------------------------ subscribers

function Subscribers() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useView<{ page: number; pages: number; total: number; counts: Record<string, number>; rows: { id: number; email: string; name: string; status: string; source: string; createdAt: string }[] }>(`/api/admin/newsletter?view=subscribers&q=${encodeURIComponent(q)}&status=${status}&page=${page}`)
  const [importText, setImportText] = useState('')
  const [notice, setNotice] = useState<Tone>(null)
  if (error) return <Notice tone="error">{error}</Notice>
  return <div className="sa-cols nl-subs">
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head">
        <h2>عضوها</h2>
        <div className="sa-toolbar">
          <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="جست‌وجوی ایمیل یا نام" aria-label="جست‌وجو" />
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="وضعیت"><option value="">همه</option><option value="ACTIVE">فعال ({fa(data?.counts.ACTIVE || 0)})</option><option value="PENDING">منتظر تأیید ({fa(data?.counts.PENDING || 0)})</option><option value="UNSUBSCRIBED">لغو کرده ({fa(data?.counts.UNSUBSCRIBED || 0)})</option></select>
          <a className="btn btn-ghost btn-sm" href="/api/admin/newsletter?view=export">خروجی CSV</a>
        </div>
      </header>
      {!data ? <div className="sa-skeleton" /> : <>
        <table className="data sa-table" style={{ minWidth: 560 }}><thead><tr><th>ایمیل</th><th>نام</th><th>وضعیت</th><th>منبع</th><th>تاریخ</th><th /></tr></thead><tbody>
          {data.rows.map((row) => <tr key={row.id}><td dir="ltr">{row.email}</td><td>{row.name || '—'}</td><td><span className={`sa-state ${row.status === 'ACTIVE' ? 'is-ok' : row.status === 'PENDING' ? 'is-warn' : 'is-bad'}`}>{row.status === 'ACTIVE' ? 'فعال' : row.status === 'PENDING' ? 'منتظر تأیید' : 'لغو کرده'}</span></td><td><small>{row.source}</small></td><td><small>{faDate(row.createdAt)}</small></td>
            <td><button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm('حذف شود؟')) void call({ op: 'remove-subscriber', id: row.id }).then(() => reload()) }}>حذف</button></td></tr>)}
          {!data.rows.length && <tr><td colSpan={6} className="sa-empty">عضوی نیست.</td></tr>}
        </tbody></table>
        <Pager page={data.page} pages={data.pages} onPage={setPage} />
      </>}
    </section>
    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>افزودن گروهی</h2></header>
      <p className="sa-hint">هر خط یک ایمیل، یا «ایمیل,نام». فقط نشانی‌هایی را اضافه کنید که خودشان اجازهٔ دریافت خبرنامه داده‌اند؛ کسانی که قبلاً لغو کرده‌اند دوباره اضافه نمی‌شوند.</p>
      <textarea className="input" dir="ltr" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'ali@example.com,علی\nsara@example.com'} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <button type="button" className="btn btn-primary" disabled={!importText.trim()} onClick={() => void call<{ added: number; skipped: number }>({ op: 'import', text: importText }).then((result) => { setNotice(result.ok ? { tone: 'ok', text: `${fa(result.data.added)} نفر اضافه شد؛ ${fa(result.data.skipped)} مورد تکراری یا نامعتبر بود.` } : { tone: 'error', text: result.error }); if (result.ok) { setImportText(''); void reload() } })}>افزودن</button>
    </section>
  </div>
}

function SettingsTab() {
  const { data, reload } = useView<{ settings: { perMinute: number } }>('/api/admin/newsletter?view=campaigns')
  const [value, setValue] = useState<number | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  if (!data) return <div className="sa-skeleton" />
  const current = value ?? data.settings.perMinute
  return <section className="sa-card sa-form">
    <header className="sa-card-head"><h2>سرعت ارسال</h2></header>
    <label className="sa-field"><span>تعداد ایمیل در هر دقیقه</span><input className="input num" type="number" min={1} max={300} value={current} onChange={(e) => setValue(Number(e.target.value))} /></label>
    <p className="sa-hint">ارسال در پس‌زمینه و دسته‌دسته انجام می‌شود و از «سقف روزانهٔ ایمیل» در تنظیمات ایمیل سایت بیشتر نمی‌شود؛ باقی‌مانده روز بعد ادامه پیدا می‌کند. برای جیمیل شخصی ۵۰۰ ایمیل در روز و برای Google Workspace حدود ۲۰۰۰ ایمیل در روز مجاز است.</p>
    <p className="sa-hint">فرم عضویت در نشانی <a className="sa-link" href="/newsletter" target="_blank" rel="noreferrer">/newsletter</a> است؛ در صفحه‌ساز هم دکمهٔ «عضویت در خبرنامه» می‌تواند به همین نشانی برود.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <button type="button" className="btn btn-primary" onClick={() => void call({ op: 'settings', settings: { perMinute: current } }).then((result) => { setNotice(result.ok ? { tone: 'ok', text: 'ذخیره شد.' } : { tone: 'error', text: result.error }); void reload() })}>ذخیره</button>
  </section>
}

export default function NewsletterAdmin() {
  const [tab, setTab] = useState<'campaigns' | 'compose' | 'subscribers' | 'settings'>('campaigns')
  const [draft, setDraft] = useState<Draft>({ subject: '', preheader: '', html: '', audience: 'subscribers' })
  const [sizes, setSizes] = useState<Record<string, number> | null>(null)
  useEffect(() => { void fetch('/api/admin/newsletter?view=sizes', { cache: 'no-store' }).then((r) => r.json()).then(setSizes).catch(() => undefined) }, [])
  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>خبرنامه و کمپین ایمیلی</h1><div className="sa-head-actions"><button type="button" className="btn btn-primary" onClick={() => { setDraft({ subject: '', preheader: '', html: '', audience: 'subscribers' }); setTab('compose') }}>کمپین تازه</button></div></header>
    <nav className="sa-subtabs" aria-label="بخش‌ها">{([['campaigns', 'کمپین‌ها'], ['compose', 'نوشتن کمپین'], ['subscribers', `عضوها${sizes ? ` (${fa(sizes.subscribers || 0)})` : ''}`], ['settings', 'تنظیمات']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'campaigns' && <Campaigns onEdit={(next) => { setDraft(next); setTab('compose') }} />}
    {tab === 'compose' && <Editor key={draft.id || 'new'} initial={draft} sizes={sizes} onDone={() => setTab('campaigns')} />}
    {tab === 'subscribers' && <Subscribers />}
    {tab === 'settings' && <SettingsTab />}
  </div>
}
