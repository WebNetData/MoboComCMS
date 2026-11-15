'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function DeleteUser({ user, onDeleted, className = 'btn btn-danger' }: { user: { id: number; identifier: string; updatedAt: string }; onDeleted: () => void; className?: string }) {
 const { locale } = useI18n()
 const fa = locale === 'fa'
 const dialog = useRef<HTMLDialogElement>(null)
 const trigger = useRef<HTMLButtonElement>(null)
 const running = useRef(false)
 const [confirmed, setConfirmed] = useState(false)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')

 async function remove(e: React.FormEvent) {
  e.preventDefault()
  if (!confirmed || running.current) return
  running.current = true
  setBusy(true)
  setError('')
  try {
   const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, updatedAt: user.updatedAt, confirm: true }) })
   const data = await res.json().catch(() => null)
   if (!res.ok) {
    setError(typeof data?.error === 'string' ? data.error : (fa ? 'حذف کاربر انجام نشد.' : 'Could not delete the user.'))
    return
   }
   dialog.current?.close()
   onDeleted()
  } catch {
   setError(fa ? 'ارتباط برقرار نشد. دوباره تلاش کنید.' : 'Connection failed. Please try again.')
  } finally {
   running.current = false
   setBusy(false)
  }
 }

 return <>
  <button ref={trigger} type="button" className={className} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{fa ? 'حذف کاربر' : 'Delete user'}</button>
  <dialog ref={dialog} aria-labelledby={`delete-user-title-${user.id}`} aria-describedby={`delete-user-description-${user.id}`} onCancel={(e) => { if (running.current) e.preventDefault() }} onClose={() => { setConfirmed(false); setError(''); trigger.current?.focus() }} className="card" style={{ maxWidth: 'min(32rem, 90vw)', maxHeight: '90dvh', overflow: 'auto', margin: 'auto', color: 'var(--text)' }}>
   <form onSubmit={remove} aria-busy={busy}>
    <h2 id={`delete-user-title-${user.id}`} className="h3 mb-3">{fa ? 'حذف دائمی کاربر' : 'Permanently delete user'}</h2>
    <p className="mb-3"><bdi dir="ltr">{user.identifier}</bdi> · #{user.id}</p>
    <p id={`delete-user-description-${user.id}`} className="mb-3">{fa ? 'این کار دائمی است. حساب‌های دارای سابقه قابل حذف نیستند؛ برای آن‌ها از غیرفعال‌سازی استفاده کنید.' : 'This is permanent. Accounts with retained history cannot be deleted; disable them instead.'}</p>
    <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />{fa ? 'حذف دائمی این حساب را تأیید می‌کنم.' : 'I confirm permanent deletion of this account.'}</label>
    {error && <p role="alert" className="error-text mb-3">{error}</p>}
    <div className="flex gap-2 flex-wrap">
     <button type="submit" className="btn btn-danger" disabled={!confirmed || busy}>{busy ? (fa ? 'در حال حذف…' : 'Deleting…') : (fa ? 'حذف دائمی' : 'Delete permanently')}</button>
     <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialog.current?.close()}>{fa ? 'انصراف' : 'Cancel'}</button>
    </div>
   </form>
  </dialog>
 </>
}
