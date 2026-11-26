'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import styles from './DeleteUser.module.css'

type Preview = { id: number; identifier: string; updatedAt: string; revision: string; counts: { key: string; label: string; count: number }[]; retained: string[]; canDelete: boolean; refusal: string | null }

export default function DeleteUser({ user, onDeleted, className = 'btn btn-danger' }: { user: { id: number; identifier: string; updatedAt: string }; onDeleted: () => void; className?: string }) {
 const { locale } = useI18n()
 const fa = locale === 'fa'
 const tr = (en: string, persian: string) => fa ? persian : en
 const dialog = useRef<HTMLDialogElement>(null)
 const trigger = useRef<HTMLButtonElement>(null)
 const running = useRef(false)
 const previewRequest = useRef(0)
 const [preview, setPreview] = useState<Preview | null>(null)
 const [confirmed, setConfirmed] = useState(false)
 const [identifier, setIdentifier] = useState('')
 const [note, setNote] = useState('')
 const [busy, setBusy] = useState(false)
 const [deleting, setDeleting] = useState(false)
 const [error, setError] = useState('')
 const [stale, setStale] = useState(false)

 async function loadPreview() {
  const request = ++previewRequest.current
  setBusy(true); setError('')
  try {
   const res = await fetch(`/api/admin/users/${user.id}/deletion`, { cache: 'no-store' })
   const data = await res.json().catch(() => null)
   if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : tr('Could not load the deletion preview.', 'دریافت پیش‌نمایش حذف ناموفق بود.'))
   if (request === previewRequest.current) { setPreview(data as Preview); setStale(false) }
  } catch (err) {
   if (request === previewRequest.current) setError(err instanceof Error ? err.message : tr('Could not load the deletion preview.', 'دریافت پیش‌نمایش حذف ناموفق بود.'))
  } finally { if (request === previewRequest.current) setBusy(false) }
 }

 async function remove(e: React.FormEvent) {
  e.preventDefault()
  if (!preview || !preview.canDelete || stale || !confirmed || identifier !== preview.identifier || note.trim().length < 3 || note.length > 300 || running.current || busy) return
  running.current = true; setBusy(true); setDeleting(true); setError('')
  try {
   const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, updatedAt: preview.updatedAt, previewRevision: preview.revision, mode: 'erase', confirmation: identifier, confirm: true, note: note.trim() }) })
   const data = await res.json().catch(() => null)
   if (!res.ok) {
    if (res.status === 409) setStale(true)
    setError(typeof data?.error === 'string' ? data.error : tr('Could not delete the account.', 'حذف حساب انجام نشد.'))
    return
   }
   dialog.current?.close()
   onDeleted()
  } catch {
   setError(tr('Connection failed. Please try again.', 'ارتباط برقرار نشد. دوباره تلاش کنید.'))
  } finally { running.current = false; setBusy(false); setDeleting(false) }
 }

 const disabled = busy || !preview?.canDelete || stale
 return <>
  <button ref={trigger} type="button" className={className} aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); void loadPreview() }}>{tr('Delete user', 'حذف کاربر')}</button>
  <dialog ref={dialog} className={styles.dialog} aria-labelledby={`delete-user-title-${user.id}`} aria-describedby={`delete-user-description-${user.id}`} onCancel={e => { if (running.current) e.preventDefault() }} onClose={() => { previewRequest.current++; setBusy(false); setPreview(null); setConfirmed(false); setIdentifier(''); setNote(''); setError(''); setStale(false); trigger.current?.focus() }}>
   <form onSubmit={remove} aria-busy={busy}>
    <h2 id={`delete-user-title-${user.id}`}>{tr('Permanently delete account', 'حذف دائمی حساب')}</h2>
    <p><bdi dir="ltr">{preview?.identifier || user.identifier}</bdi> · #{user.id}</p>
    <p id={`delete-user-description-${user.id}`}>{tr('The account and its data will be erased permanently. Shared financial records are retained without identifying the account.', 'حساب و داده‌های آن برای همیشه حذف می‌شوند. سوابق مالی مشترک بدون شناسایی حساب حفظ می‌شوند.')}</p>
    {busy && !deleting && <p role="status">{tr('Loading deletion preview…', 'در حال دریافت پیش‌نمایش حذف…')}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {(!preview || stale) && !busy && <div className={styles.notice}>{stale && <p>{tr('The account or its data changed. Refresh the preview and review it before deleting; your entries are preserved.', 'حساب یا داده‌های آن تغییر کرده است. پیش‌نمایش را تازه و بررسی کنید؛ اطلاعات واردشده حفظ شده‌اند.')}</p>}<button type="button" className="btn btn-ghost" onClick={() => void loadPreview()}>{stale ? tr('Refresh preview', 'تازه‌سازی پیش‌نمایش') : tr('Retry preview', 'تلاش دوباره')}</button></div>}
    {preview && <>
     {!preview.canDelete && <p className={styles.notice}>{preview.refusal || tr('You cannot delete this account.', 'امکان حذف این حساب را ندارید.')}</p>}
     <section className={styles.preview} aria-labelledby={`delete-impact-${user.id}`}><h3 id={`delete-impact-${user.id}`}>{tr('Deletion impact', 'تأثیر حذف')}</h3>
      {preview.counts.length ? <dl className={styles.counts}>{preview.counts.map(item => <div key={item.key}><dt>{item.label}</dt><dd>{item.count}</dd></div>)}</dl> : <p>{tr('No items listed.', 'موردی ثبت نشده است.')}</p>}
      {preview.retained.length > 0 && <><h3>{tr('Retained without identifying the account', 'موارد حفظ‌شده بدون شناسایی حساب')}</h3><ul>{preview.retained.map(item => <li key={item}>{item}</li>)}</ul></>}
     </section>
     <fieldset disabled={disabled} className={styles.fields}>
      <label>{tr('Type the account identifier exactly', 'شناسه حساب را دقیق وارد کنید')}<input className="input" dir="ltr" autoComplete="off" value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
      <label>{tr('Reason for deletion (3–300 characters)', 'دلیل حذف (۳ تا ۳۰۰ نویسه)')}<textarea className="input" rows={2} minLength={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></label>
      <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{tr('I understand this deletion is permanent.', 'می‌دانم این حذف دائمی است.')}</label>
     </fieldset>
    </>}
    <div className={styles.actions}>
     <button type="submit" className="btn btn-danger" disabled={disabled || !confirmed || identifier !== preview?.identifier || note.trim().length < 3}>{deleting ? tr('Deleting…', 'در حال حذف…') : tr('Delete permanently', 'حذف دائمی')}</button>
     <button type="button" className="btn btn-ghost" disabled={deleting} onClick={() => dialog.current?.close()}>{tr('Cancel', 'انصراف')}</button>
    </div>
   </form>
  </dialog>
 </>
}
