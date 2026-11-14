'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { isProblemKind, isReportablePath, type ProblemKind } from '@/modules/support/domain/report-problem'
import Link from '@/components/AppLink'
import styles from './site-utility-controls.module.css'

const DRAFT_KEY = 'mobocom-report-problem-draft'

export default function ReportProblemControl({ ready }: { ready: boolean }) {
  const supportOn = useModuleEnabled('support')
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const pathname = usePathname() || '/'
  const dialog = useRef<HTMLDialogElement>(null)
  const formId = useId()
  const submitting = useRef(false)
  const [kind, setKind] = useState<ProblemKind>('CONTENT')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error' | 'signin'>('idle')
  const [message, setMessage] = useState('')
  const [ticketId, setTicketId] = useState<number | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('reportProblem') !== '1') return
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      sessionStorage.removeItem(DRAFT_KEY)
      const draft = raw ? JSON.parse(raw) : null
      if (draft?.path === pathname && isProblemKind(draft.kind) && typeof draft.note === 'string') {
        setKind(draft.kind); setNote(draft.note.slice(0, 2000)); setState('idle'); setMessage('')
        dialog.current?.showModal()
      }
    } catch { /* no draft available */ }
    url.searchParams.delete('reportProblem')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [pathname])

  if (!supportOn || !isReportablePath(pathname)) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setState('busy'); setMessage('')
    try {
      const response = await fetch('/api/support/report-problem', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pathname, kind, note }),
      }).catch(() => null)
      const data = await response?.json().catch(() => null)
      if (response?.ok && Number.isSafeInteger(data?.ticketId)) {
        try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* storage unavailable */ }
        setTicketId(data.ticketId)
        setState('done')
        setMessage(fa ? 'درخواست شما در گفت‌وگوی پشتیبانی ثبت شد.' : 'Your report is now in a support conversation.')
      } else if (response?.status === 401) {
        setState('signin')
        setMessage(fa ? 'برای پیگیری پاسخ، ابتدا وارد حساب شوید. گزارشی هنوز ثبت نشده است.' : 'Sign in to receive replies. Nothing has been submitted yet.')
      } else {
        setState('error')
        setMessage(typeof data?.error === 'string' ? data.error : (fa ? 'ثبت گزارش انجام نشد. دوباره امتحان کنید.' : 'The report could not be submitted. Try again.'))
      }
    } finally { submitting.current = false }
  }

  const kinds: Array<{ value: ProblemKind; fa: string; en: string }> = [
    { value: 'DOWNLOAD', fa: 'دانلود کار نمی‌کند', en: 'Download problem' },
    { value: 'AUDIO', fa: 'پخش موسیقی مشکل دارد', en: 'Audio playback problem' },
    { value: 'VIDEO', fa: 'پخش ویدیو مشکل دارد', en: 'Video playback problem' },
    { value: 'CONTENT', fa: 'مشکل در محتوا یا صفحه', en: 'Content or page problem' },
  ]

  return <div className={styles.report}>
    <button type="button" className="btn btn-ghost btn-sm" disabled={!ready} onClick={() => { setState('idle'); setMessage(''); setTicketId(null); setNote(''); dialog.current?.showModal() }}>
      {fa ? 'گزارش مشکل این صفحه' : 'Report a problem on this page'}
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${formId}-title`}>
      <form onSubmit={submit} aria-describedby={`${formId}-context`}>
        <h2 id={`${formId}-title`}>{fa ? 'گزارش مشکل' : 'Report a problem'}</h2>
        <p id={`${formId}-context`} className="muted">{fa ? 'موبوکام صفحهٔ عمومی فعلی را دوباره بررسی می‌کند و نشانی تأییدشده را برای پشتیبانی می‌فرستد.' : 'MoboCom verifies this public page and sends its confirmed address to Support.'}</p>
{state === 'done' ? <div role="status"><p>{message}</p>{ticketId && <p>#{ticketId}</p>}<Link className="btn btn-primary btn-sm" href="/dashboard/tickets">{fa ? 'پیگیری در پشتیبانی' : 'Follow up in Support'}</Link><button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()}>{fa ? 'بستن' : 'Close'}</button></div> : state === 'signin' ? <div role="alert"><p>{message}</p><button type="button" className="btn btn-primary btn-sm" onClick={() => {
          try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ path: pathname, kind, note: note.slice(0, 2000) })) } catch { /* draft preservation is optional */ }
          const next = `${pathname}?reportProblem=1`
          window.location.assign(`/login?next=${encodeURIComponent(next)}`)
        }}>{fa ? 'ورود به حساب' : 'Sign in'}</button></div> : <>
          <fieldset className={styles.kinds} disabled={state === 'busy'}>
            <legend>{fa ? 'نوع مشکل' : 'Problem type'}</legend>
            {kinds.map(option => <label key={option.value}><input type="radio" name={`${formId}-kind`} value={option.value} checked={kind === option.value} onChange={() => isProblemKind(option.value) && setKind(option.value)} />{fa ? option.fa : option.en}</label>)}
          </fieldset>
          <div className={styles.note}><label htmlFor={`${formId}-note`}>{fa ? 'توضیح (اختیاری)' : 'Details (optional)'}</label><textarea id={`${formId}-note`} className="input" rows={4} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} disabled={state === 'busy'} /></div>
          {message && <div className="error-text" role="alert"><p>{message}</p><Link href="/dashboard/tickets">{fa ? 'رفتن به تیکت‌های پشتیبانی' : 'Open Support tickets'}</Link></div>}
          <div className={styles.actions}><button type="submit" className="btn btn-primary btn-sm" disabled={state === 'busy'}>{state === 'busy' ? (fa ? 'در حال ثبت…' : 'Submitting…') : (fa ? 'ارسال به پشتیبانی' : 'Send to Support')}</button><button type="button" className="btn btn-ghost btn-sm" disabled={state === 'busy'} onClick={() => dialog.current?.close()}>{fa ? 'انصراف' : 'Cancel'}</button></div>
        </>}
      </form>
    </dialog>
  </div>
}
