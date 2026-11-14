'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { DEMAND_SECTIONS, demandSection, DEMAND_STATUS } from '@/modules/support/domain/demand'
import styles from './content-request.module.css'

export default function ContentRequest({ section: initialSection, query = '', compact = false }: { section?: string; query?: string; compact?: boolean }) {
  const [section, setSection] = useState(initialSection || 'store'), [title, setTitle] = useState(query), [note, setNote] = useState('')
  const [similar, setSimilar] = useState<{ id: number; title: string; status: string; count: number } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false), [signin, setSignin] = useState(false)
  const [reviewed, setReviewed] = useState(false), [join, setJoin] = useState(false), [ready, setReady] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), key = useId(), support = useModuleEnabled('support')
  const module = demandSection(initialSection)?.module || 'store', on = useModuleEnabled(module)
  useEffect(() => { setReady(true) }, [])
  const entry = demandSection(section)!
  if (!support || (initialSection && !on)) return null
  const resetReview = () => { setReviewed(false); setJoin(false); setSimilar(null); setError('') }
  async function review() {
    setBusy(true); setError(''); setSignin(false)
    try { const response = await fetch(`/api/support/requests?similar=1&section=${section}&title=${encodeURIComponent(title)}`), data = await response.json(); if (!response.ok) throw Error(data.error || 'بررسی انجام نشد'); setSimilar(data.similar); setReviewed(true) } catch (cause) { setError(cause instanceof Error ? cause.message : 'بررسی انجام نشد') } finally { setBusy(false) }
  }
  async function submit() {
    if (!reviewed || (similar && !join)) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/support/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section, title, note, joinDemandId: similar?.id }) }), data = await response.json()
      if (response.status === 401) { setSignin(true); throw Error('برای ثبت و پیگیری درخواست وارد حساب شوید؛ متن شما تا بازبودن این صفحه حفظ می‌شود') }
      if (!response.ok) { if (response.status === 409) setReviewed(false); throw Error(data.error || 'ثبت انجام نشد') }
      setDone(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت انجام نشد') } finally { setBusy(false) }
  }
  return <section className={`${styles.callout} ${compact ? styles.compact : ''}`} aria-label="درخواست کالا یا محتوا">
    <div><span className={styles.eyebrow}>انتخاب بعدی با شما</span><h2>{initialSection === 'store' ? 'کالای موردنیازتان را پیدا نکردید؟' : initialSection ? `${entry.label} موردنظرتان اینجا نیست؟` : 'چیزی که می‌خواستید پیدا نشد؟'}</h2><p>نام و جزئیات را بفرستید؛ تیم همان بخش بررسی می‌کند و نتیجه را در حسابتان می‌بینید.</p></div>
    <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => { setTitle(query || title); setDone(false); setError(''); setSignin(false); resetReview(); dialog.current?.showModal() }}>ثبت درخواست <span aria-hidden="true">←</span></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${key}-heading`} onCancel={event => { if (busy) event.preventDefault() }}>
      <header><h2 id={`${key}-heading`}>{done ? 'درخواست ثبت شد' : 'چه چیزی نیاز دارید؟'}</h2><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialog.current?.close()} aria-label="بستن فرم درخواست">×</button></header>
      {done ? <div role="status"><p>درخواست شما به تیم این بخش رسید. ثبت درخواست به معنی تعهد تأمین یا زمان انتشار نیست.</p><Link className="btn btn-primary" href="/dashboard/content-requests">پیگیری درخواست‌های من</Link></div> : <form onSubmit={event => { event.preventDefault(); void (reviewed ? submit() : review()) }}>
        {!initialSection && <label htmlFor={`${key}-section`}>بخش<select id={`${key}-section`} className="select" value={section} onChange={event => { setSection(event.target.value); resetReview() }}>{DEMAND_SECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        <label htmlFor={`${key}-title`}>نام {entry.label}<input id={`${key}-title`} className="input" autoFocus required minLength={2} maxLength={160} value={title} disabled={busy} onChange={event => { setTitle(event.target.value); resetReview() }} /></label>
        <label htmlFor={`${key}-note`}>جزئیات برای تشخیص دقیق‌تر <span>(اختیاری)</span><textarea id={`${key}-note`} className="input" rows={3} maxLength={1500} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="مدل، سال، نسخه یا توضیح کوتاه؛ اطلاعات شخصی ننویسید" /></label>
        {reviewed && (similar ? <div className={styles.match}><b>{similar.title}</b><p>{similar.count.toLocaleString('fa-IR')} درخواست‌کننده · {DEMAND_STATUS[similar.status]}</p>{similar.status === 'DECLINED' ? <p>این مورد فعلاً قابل انجام نیست؛ نام یا مشخصات متفاوت را دقیق‌تر وارد کنید.</p> : <label><input type="checkbox" checked={join} onChange={event => setJoin(event.target.checked)} /> این همان مورد موردنیاز من است؛ به درخواست آن می‌پیوندم</label>}</div> : <p role="status">درخواست یکسانی پیدا نشد؛ می‌توانید ثبت کنید.</p>)}
        {error && <p role="alert">{error}</p>}{signin && <Link href="/login" target="_blank" rel="noopener">ورود به حساب در برگهٔ تازه</Link>}
        <footer><button type="submit" className="btn btn-primary" disabled={busy || (reviewed && !!similar && (!join || similar.status === 'DECLINED'))}>{busy ? 'در حال بررسی…' : reviewed ? 'تأیید و ثبت درخواست' : 'بررسی درخواست‌های مشابه'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialog.current?.close()}>انصراف</button></footer>
      </form>}
    </dialog>
  </section>
}
