'use client'
import { useEffect, useId, useState } from 'react'
import Link from '@/components/AppLink'
import { DEMAND_SECTIONS, DEMAND_STATUS } from '@/modules/support/domain/demand'
type Row = { id: number; section: string; title: string; status: string; version?: number; count?: number; notes?: string[]; note?: string; decisionNote: string; target: { title: string; href: string } | null }
export default function DemandDesk({ admin = false }: { admin?: boolean }) {
  const sectionId = useId()
  const [section, setSection] = useState('store'), [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    fetch(`/api/support/requests${admin ? `?admin=1&section=${section}` : ''}`, { cache: 'no-store', signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); if (!controller.signal.aborted) setRows(data.requests) }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'دریافت نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [section, attempt, admin])
  async function decide(row: Row, form: HTMLFormElement) {
    const fields = new FormData(form), targetType = String(fields.get('targetType') || '')
    setBusy(row.id); setError('')
    try { const response = await fetch('/api/support/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decide', id: row.id, section, version: row.version, status: fields.get('status'), note: fields.get('note'), ...(targetType ? { [targetType]: fields.get('targetId') } : {}) }) }), data = await response.json(); if (!response.ok) throw Error(data.error); setAttempt(value => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت نشد') } finally { setBusy(0) }
  }
  const targetTypes: Record<string, string[]> = { store: ['productId'], cinema: ['cinemaTitleId'], games: ['gameId'], software: ['softwareId'], music: ['trackId', 'albumId'], magazine: ['postId'], forum: ['threadId'] }
  return <section className="dt-page" aria-label={admin ? 'میزکار درخواست کالا و محتوا' : 'پیگیری درخواست کالا و محتوا'}>
    <header className="dt-head"><div><h1>{admin ? 'درخواست‌های کالا و محتوا' : 'درخواست‌های کالا و محتوای من'}</h1><p>{admin ? 'تقاضای مشترک کاربران، در محدودهٔ دسترسی مدیر همان بخش' : 'نتیجهٔ بررسی و لینک موردی که برای شما آماده شده است'}</p></div><Link className="btn btn-ghost" href={admin ? '/admin' : '/dashboard/requests'}>{admin ? 'پیشخوان مدیریت' : 'درخواست‌های خدمات و فرم‌ها'}</Link></header>
    {admin && <div><label htmlFor={sectionId}>بخش</label><select id={sectionId} className="select" value={section} onChange={event => setSection(event.target.value)}>{DEMAND_SECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
    {error && <p role="alert">{error}</p>}<button type="button" className="btn btn-ghost" onClick={() => setAttempt(value => value + 1)} disabled={loading}>تازه‌سازی</button>
    {loading ? <p role="status">در حال دریافت…</p> : !rows.length && !error ? <p>هنوز درخواستی ثبت نشده است.</p> : <div className="sa-stack">{rows.map(row => <article key={row.id} className="sa-card" id={`demand-${row.id}`}>
      <h2>{row.title}</h2><p>{DEMAND_STATUS[row.status]}{admin && ` · ${row.count?.toLocaleString('fa-IR')} درخواست‌کننده`}</p>
      {row.note && <p>{row.note}</p>}{row.decisionNote && <p>پاسخ تیم: {row.decisionNote}</p>}
      {row.target ? <Link className="btn btn-primary" href={row.target.href}>مشاهدهٔ {row.target.title}</Link> : row.status === 'FULFILLED' ? <p>لینک این مورد فعلاً در دسترس عمومی نیست؛ از پشتیبانی پیگیری کنید.</p> : null}
      {admin && <>{!!row.notes?.length && <details><summary>جزئیات درخواست‌کنندگان</summary><ul>{row.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}{['OPEN', 'REVIEWING'].includes(row.status) && <form className="sa-stack" onSubmit={event => { event.preventDefault(); void decide(row, event.currentTarget) }}>
        <div><label htmlFor={`${sectionId}-${row.id}-status`}>تصمیم</label><select id={`${sectionId}-${row.id}-status`} className="select" name="status" defaultValue="REVIEWING"><option value="REVIEWING">در حال بررسی</option><option value="FULFILLED">آماده شده؛ اتصال به مورد عمومی</option><option value="DECLINED">فعلاً قابل انجام نیست</option></select></div>
        <label>پاسخ به درخواست‌کنندگان<textarea name="note" className="input" rows={2} maxLength={1500} /></label>
        <div className="sa-row"><div><label htmlFor={`${sectionId}-${row.id}-target`}>نوع مقصد</label><select id={`${sectionId}-${row.id}-target`} name="targetType" className="select">{targetTypes[section].map(type => <option key={type} value={type}>{type === 'trackId' ? 'آهنگ' : type === 'albumId' ? 'آلبوم' : DEMAND_SECTIONS.find(item => item.id === section)?.label}</option>)}</select></div><label>شناسهٔ مورد آماده‌شده<input name="targetId" className="input" inputMode="numeric" pattern="[0-9]+" /></label></div>
        <small>برای «آماده شده» شناسهٔ همان کالا یا محتوای منتشرشده را از مدیریت وارد کنید؛ عمومی‌بودن آن روی سرور بررسی می‌شود. سایر تصمیم‌ها به شناسه نیاز ندارند.</small><button type="submit" className="btn btn-primary" disabled={busy !== 0}>{busy === row.id ? 'در حال ثبت…' : 'ثبت تصمیم'}</button>
      </form>}</>}
    </article>)}</div>}
  </section>
}
