'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter, usePathname } from '@/platform/routing/navigation'
import type { MemberList } from '@/modules/account/domain/lists'
import { MEMBER_LISTS_CHANGED, memberListsChanged } from './member-list-events'
import styles from './MemberLists.module.css'


export default function AddToCollection({ item, loggedIn }: { item: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<MemberList[] | null>(null), [holding, setHolding] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false), [version, setVersion] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null), command = useRef(false), title = useId(), router = useRouter(), pathname = usePathname()
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.showModal()
    return () => { controller.current?.abort(); dialog.current?.close(); document.body.style.overflow = overflow; before?.focus() }
  }, [open])
  useEffect(() => {
    if (!open) return
    const request = new AbortController(); controller.current = request; setFailed(false); setRows(null)
    fetch('/api/me/lists?item=' + encodeURIComponent(item), { cache: 'no-store', signal: request.signal }).then(async response => {
      const body = await response.json()
      if (request.signal.aborted) return
      if (!response.ok) throw Error(body.error || 'فهرست‌ها بارگذاری نشدند.')
      if (!Array.isArray(body.lists) || !Array.isArray(body.holding)) throw Error('پاسخ فهرست‌ها معتبر نیست.')
      setRows(body.lists); setHolding(body.holding)
    }).catch(error => { if (!request.signal.aborted) { setFailed(true); setMessage(error.message || 'ارتباط برقرار نشد.') } })
    return () => request.abort()
  }, [open, item, version])
  useEffect(() => {
    const refresh = (event: Event) => { if ((event as CustomEvent).detail?.item === item && open && !command.current) setVersion(value => value + 1) }
    window.addEventListener(MEMBER_LISTS_CHANGED, refresh)
    return () => window.removeEventListener(MEMBER_LISTS_CHANGED, refresh)
  }, [item, open])
  async function toggle(key: string) {
    if (command.current) return
    command.current = true
    setBusy(true); setFailed(false); setMessage('')
    try {
      const response = await fetch('/api/me/lists', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, list: key, on: !holding.includes(key) }) })
      const body = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(body?.holding)) throw Error(body?.error || 'تغییر ذخیره نشد؛ دوباره تلاش کنید.')
      const next: string[] = body.holding
      setRows(current => current?.map(row => ({ ...row, count: Math.max(0, row.count + Number(next.includes(row.key)) - Number(holding.includes(row.key))) })) || [])
      setHolding(next); setMessage('تغییرات فهرست ذخیره شد.'); memberListsChanged(item); router.refresh()
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'ذخیره نشد.') }
    finally { command.current = false; setBusy(false) }
  }
  if (!loggedIn) return <Link className="ea-btn" href={`/login?next=${encodeURIComponent(pathname)}`}>فهرست‌های من</Link>
  return <div className="collections-picker">
    <button type="button" className={`ea-btn${open ? ' is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setMessage(''); setOpen(true) }}><svg className="ea-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M4 5h16v15H4zM8 5v7l4-2 4 2V5" /></svg>فهرست‌های من</button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} dir="rtl" onCancel={event => { event.preventDefault(); setOpen(false) }}>
      <header className={styles.head}><div><h2 id={title}>ذخیره در فهرست‌های من</h2><p>مجموعه‌ها، علاقه‌مندی‌ها و فهرست‌های مرتبط شما؛ تغییرات همین‌جا ذخیره می‌شوند.</p></div><button type="button" className={styles.close} aria-label="بستن فهرست‌ها" onClick={() => setOpen(false)}>×</button></header>
      <div className={styles.body} aria-busy={busy || (!rows && !failed)}>
        {!rows && !failed && <p className={styles.notice} role="status">در حال بارگذاری فهرست‌ها…</p>}
        {rows && (rows.length ? <ul className={styles.list}>{rows.map(row => <li key={row.key}><button type="button" className={styles.row} aria-pressed={holding.includes(row.key)} disabled={busy} onClick={() => void toggle(row.key)}><span className={styles.check} aria-hidden="true">{holding.includes(row.key) ? '✓' : '+'}</span><span className={styles.copy}><b>{row.title}</b><small>{row.count.toLocaleString('fa-IR')} مورد</small></span></button></li>)}</ul> : <p className={styles.notice}>هنوز فهرست سازگاری ندارید؛ یک مجموعهٔ شخصی بسازید.</p>)}
        {message && <p className={styles.notice} role={failed ? 'alert' : 'status'}>{message}</p>}
        {failed && !rows && <button type="button" className="ea-btn" onClick={() => setVersion(value => value + 1)}>تلاش دوباره</button>}
      </div><footer className={styles.footer}><Link href="/dashboard/collections">ساخت و مدیریت مجموعه‌ها</Link><Link href="/dashboard/library">کتابخانهٔ من</Link></footer>
    </dialog>}
  </div>
}
