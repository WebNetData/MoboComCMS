'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type Report = { id: number; code: string; name: string; email: string; organization: string; phone: string; role: string; workTitle: string; originalUrl: string; infringingUrls: string[]; description: string; status: string; resolution: string; actionTaken: string; createdAt: string; resolvedAt: string | null }
type Target = { url: string; item: { type: string; id: number; title: string; url: string; label: string } | null; links: { id: number; label: string; quality: string; url: string; disabled: boolean }[] }
const STATUSES: [string, string][] = [['NEW', 'جدید'], ['REVIEWING', 'در حال بررسی'], ['ACCEPTED', 'پذیرفته'], ['REJECTED', 'رد شده'], ['ALL', 'همه']]
const LABEL: Record<string, string> = Object.fromEntries(STATUSES)

/** Copyright takedown queue: review, remove content or links, answer the reporter. */
export default function AdminCopyrightPage() {
  const [status, setStatus] = useState('NEW')
  const [list, setList] = useState<{ open: number; reports: Report[] } | null>(null)
  const [detail, setDetail] = useState<{ report: Report; targets: Target[] } | null>(null)
  const [unpublish, setUnpublish] = useState<string[]>([])
  const [links, setLinks] = useState<number[]>([])
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/copyright?status=${status}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setList(body)
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [status])
  useEffect(() => { void load() }, [load])

  async function open(id: number) {
    setMessage(null)
    const response = await fetch(`/api/admin/copyright?id=${id}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (!response?.ok) { setMessage({ text: body?.error || 'باز نشد', error: true }); return }
    setDetail(body); setUnpublish([]); setLinks([]); setResolution(body.report.resolution || '')
  }

  async function decide(next: 'REVIEWING' | 'ACCEPTED' | 'REJECTED') {
    if (!detail) return
    if (next === 'ACCEPTED' && !unpublish.length && !links.length && !window.confirm('هیچ صفحه یا لینکی برای حذف انتخاب نشده است. بدون حذف، گزارش پذیرفته شود؟')) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/copyright', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: detail.report.id, status: next, resolution, unpublish, disableLinks: links }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'انجام نشد', error: true }); return }
    setMessage({ text: `وضعیت: ${LABEL[next]}${body.actions?.length ? ` — ${body.actions.join('؛ ')}` : ''}`, error: false })
    await open(detail.report.id)
    await load()
  }

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">COPYRIGHT</span><h1>گزارش‌های نقض حق نشر</h1>
      <p>گزارش‌ها از فرم عمومی <Link href="/copyright" target="_blank">/copyright</Link> می‌آیند. پس از بررسی، صفحه را از دسترس خارج کنید یا فقط لینک‌های دانلود مشخص را غیرفعال کنید؛ پیام نتیجه با کد پیگیری به گزارش‌دهنده نشان داده می‌شود.</p></div></header>
    <nav className="tb-tabs" role="tablist" aria-label="وضعیت">{STATUSES.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? 'is-active' : ''} onClick={() => { setStatus(key); setDetail(null) }}>{label}{key === 'NEW' && list ? <span>{list.open.toLocaleString('fa-IR')}</span> : null}</button>)}</nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <div className="cr-admin">
      <ul className="cr-admin-list">
        {list?.reports.map((report) => <li key={report.id}><button type="button" className={detail?.report.id === report.id ? 'is-active' : ''} onClick={() => void open(report.id)}>
          <b>{report.workTitle}</b><small>{report.name} · <span dir="ltr">{report.code}</span></small><small className="muted">{new Date(report.createdAt).toLocaleDateString('fa-IR')} · {LABEL[report.status] || report.status}</small>
        </button></li>)}
        {list && !list.reports.length && <li className="tb-empty">گزارشی نیست.</li>}
      </ul>
      {detail ? <article className="card cr-admin-detail">
        <header><h2>{detail.report.workTitle}</h2><span className="badge">{LABEL[detail.report.status]}</span></header>
        <dl className="cr-facts">
          <div><dt>گزارش‌دهنده</dt><dd>{detail.report.name}{detail.report.organization && ` — ${detail.report.organization}`} ({detail.report.role === 'AGENT' ? 'نماینده' : 'صاحب اثر'})</dd></div>
          <div><dt>تماس</dt><dd><bdi dir="ltr">{detail.report.email}</bdi>{detail.report.phone && <> · <bdi dir="ltr">{detail.report.phone}</bdi></>}</dd></div>
          {detail.report.originalUrl && <div><dt>نسخهٔ اصلی</dt><dd><a href={detail.report.originalUrl} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{detail.report.originalUrl}</a></dd></div>}
          <div><dt>کد پیگیری</dt><dd><bdi dir="ltr">{detail.report.code}</bdi></dd></div>
        </dl>
        <p className="fa-excerpt" dir="auto">{detail.report.description}</p>
        <h3>محتوای گزارش‌شده</h3>
        {detail.targets.map((target) => { const key = target.item ? `${target.item.type}:${target.item.id}` : ''; return <div key={target.url} className="cr-target">
          <a href={target.url} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="cr-url">{target.url}</a>
          {target.item ? <>
            <label className="studio-switch"><input type="checkbox" checked={unpublish.includes(key)} onChange={() => setUnpublish(toggle(unpublish, key))} />خارج کردن کل {target.item.label} «{target.item.title}» از دسترس</label>
            {target.links.length > 0 && <fieldset className="fa-perms"><legend>یا فقط این لینک‌های دانلود را غیرفعال کن</legend>
              {target.links.map((link) => <label key={link.id} className="studio-switch"><input type="checkbox" checked={links.includes(link.id) || link.disabled} disabled={link.disabled} onChange={() => setLinks(toggle(links, link.id))} />{link.label || 'لینک'} {link.quality} <small className="muted" dir="ltr">{link.url.slice(0, 70)}</small>{link.disabled && ' (غیرفعال)'}</label>)}
            </fieldset>}
          </> : <p className="muted">این نشانی به محتوای منتشرشده‌ای در سایت نمی‌رسد (شاید قبلاً حذف شده یا نشانی سایت دیگری است).</p>}
        </div> })}
        <label className="studio-field"><span>پیام نتیجه برای گزارش‌دهنده</span><textarea className="input" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="مثلاً: محتوای گزارش‌شده بررسی و از سایت حذف شد." /></label>
        <div className="fa-inline fa-wrap">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide('ACCEPTED')}>پذیرش و اعمال حذف</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void decide('REVIEWING')}>در حال بررسی</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void decide('REJECTED')}>رد گزارش</button>
        </div>
        {detail.report.actionTaken && <ol className="fa-excerpt cr-log" aria-label="گزارش اقدامات">{detail.report.actionTaken.split('\n').map((line, index) => <li key={index} dir="auto">{line}</li>)}</ol>}
      </article> : <div className="tb-empty">یک گزارش را از فهرست انتخاب کنید.</div>}
    </div>
  </div>
}
