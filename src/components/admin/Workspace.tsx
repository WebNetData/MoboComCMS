'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from '@/components/AppLink'
import { ADMIN_GO, shortcutFor } from '@/modules/identity/domain/saved-views'

type View = { id: number; name: string; href: string }

/**
 * The workspace tools of the admin panel: a staff member's saved views (this page with its filters, under a
 * name) and the keyboard shortcuts. Shortcuts never act while a field is being typed in.
 */
export default function AdminWorkspace({ fa, canGo }: { fa: boolean; canGo: (href: string) => boolean }) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams()
  const [views, setViews] = useState<View[]>([])
  const [open, setOpen] = useState<'' | 'views' | 'help'>('')
  const [message, setMessage] = useState('')
  const pending = useRef(0)
  const L = (faText: string, en: string) => (fa ? faText : en)
  const here = `${pathname}${search.toString() ? `?${search}` : ''}`

  const load = useCallback(() => fetch('/api/admin/views', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((body) => { if (body) setViews(body.views) }).catch(() => undefined), [])
  useEffect(() => { void load() }, [load])

  const save = useCallback(async () => {
    const name = window.prompt(L('نامی برای این نما (همین صفحه با فیلترهایش):', 'A name for this view (this page with its filters):'), '')
    if (!name?.trim()) return
    const response = await fetch('/api/admin/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, href: here }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setViews(body.views); setMessage(L('نما ذخیره شد.', 'View saved.')); setOpen('views') } else setMessage(body?.error || L('ذخیره انجام نشد.', 'Could not save.'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, fa])

  async function remove(view: View) {
    const response = await fetch(`/api/admin/views?id=${view.id}`, { method: 'DELETE' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setViews(body.views)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (event.key === 'Escape' && open) { setOpen(''); return }
      const action = shortcutFor({ key: event.key, typing, modifier: event.ctrlKey || event.metaKey || event.altKey, pending: Date.now() - pending.current < 1500 })
      pending.current = 0
      if (!action) return
      if (action.kind === 'wait') { pending.current = Date.now(); return }
      event.preventDefault()
      if (action.kind === 'go') { if (canGo(action.href)) router.push(action.href) }
      else if (action.kind === 'search') document.querySelector<HTMLInputElement>('.admin-nav-search input')?.focus()
      else if (action.kind === 'help') setOpen((current) => (current === 'help' ? '' : 'help'))
      else if (action.kind === 'views') setOpen((current) => (current === 'views' ? '' : 'views'))
      else void save()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, router, canGo, save])

  return <div className="aw">
    <div className="aw-bar">
      <button type="button" className="aw-btn" aria-expanded={open === 'views'} onClick={() => setOpen(open === 'views' ? '' : 'views')}>{L('نماهای من', 'My views')}{views.length > 0 && <em>{views.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</em>}</button>
      <button type="button" className="aw-btn" aria-expanded={open === 'help'} onClick={() => setOpen(open === 'help' ? '' : 'help')} aria-label={L('میان‌برهای صفحه‌کلید', 'Keyboard shortcuts')}>?</button>
    </div>
    {open === 'views' && <div className="aw-panel" role="dialog" aria-label={L('نماهای ذخیره‌شده', 'Saved views')}>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>{L('ذخیرهٔ همین صفحه', 'Save this page')}</button>
      {message && <p className="aw-note" role="status">{message}</p>}
      {views.length ? <ul>{views.map((view) => <li key={view.id}><Link href={view.href} onClick={() => setOpen('')} aria-current={view.href === here ? 'page' : undefined}>{view.name}</Link><button type="button" aria-label={L(`حذف نمای ${view.name}`, `Delete ${view.name}`)} onClick={() => void remove(view)}>×</button></li>)}</ul>
        : <p className="aw-note">{L('هنوز نمایی ذخیره نکرده‌اید. صفحه‌ای را با فیلتر دلخواه باز کنید و همین‌جا ذخیره‌اش کنید.', 'No saved view yet. Open a page with the filters you want and save it here.')}</p>}
    </div>}
    {open === 'help' && <div className="aw-panel" role="dialog" aria-label={L('میان‌برهای صفحه‌کلید', 'Keyboard shortcuts')}>
      <dl>
        <div><dt><kbd>/</kbd></dt><dd>{L('جست‌وجوی بخش‌ها', 'Find a section')}</dd></div>
        <div><dt><kbd>s</kbd></dt><dd>{L('ذخیرهٔ همین صفحه به‌عنوان نما', 'Save this page as a view')}</dd></div>
        <div><dt><kbd>v</kbd></dt><dd>{L('نماهای من', 'My views')}</dd></div>
        {ADMIN_GO.filter((item) => canGo(item.href)).map((item) => <div key={item.key}><dt><kbd>g</kbd> <kbd>{item.key}</kbd></dt><dd>{fa ? item.fa : item.en}</dd></div>)}
        <div><dt><kbd>?</kbd></dt><dd>{L('همین راهنما', 'This help')}</dd></div>
      </dl>
    </div>}
  </div>
}
