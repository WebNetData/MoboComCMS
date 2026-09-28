'use client'

import Link from '@/components/AppLink'
import { usePathname, useRouter } from '@/platform/routing/navigation'
import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { COMPARE_EVENT, clearCompare, readCompare, removeCompare, type CompareEntry } from '@/components/engage/compare-store'

const href = (entries: CompareEntry[]) => `/compare?items=${entries.map((entry) => entry.key).join(',')}`

/** Floating bar with the items waiting to be compared (hidden on the compare page itself). */
export function CompareTray() {
  const enabled = useModuleEnabled('compare')
  const pathname = usePathname()
  const [entries, setEntries] = useState<CompareEntry[]>([])
  useEffect(() => {
    const sync = () => setEntries(readCompare())
    sync()
    window.addEventListener(COMPARE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(COMPARE_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  if (!enabled || !entries.length || pathname.startsWith('/compare') || pathname.startsWith('/admin')) return null
  return (
    <aside className="cmp-tray" aria-label="فهرست مقایسه">
      <ul>{entries.map((entry) => (
        <li key={entry.key}>
          {entry.image ? <img src={entry.image} alt="" /> : <span aria-hidden="true">{entry.title.slice(0, 1)}</span>}
          <span className="cmp-tray-title">{entry.title}</span>
          <button type="button" onClick={() => removeCompare(entry.key)} aria-label={`حذف ${entry.title} از مقایسه`}>✕</button>
        </li>
      ))}</ul>
      <div className="cmp-tray-actions">
        {entries.length > 1 ? <Link href={href(entries)} className="btn btn-primary btn-sm">مقایسهٔ {entries.length.toLocaleString('fa-IR')} مورد</Link> : <span className="muted">یک مورد دیگر اضافه کنید</span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearCompare}>پاک کردن</button>
      </div>
    </aside>
  )
}

/** /compare without ?items: open the stored list (or show the empty state). */
export function CompareRedirect() {
  const router = useRouter()
  const [empty, setEmpty] = useState(false)
  useEffect(() => {
    const entries = readCompare()
    if (entries.length) router.replace(href(entries))
    else setEmpty(true)
  }, [router])
  return empty ? null : <p className="muted" role="status">در حال بارگذاری فهرست مقایسه…</p>
}

/** Keeps the stored list in sync after removing a column on the compare page. */
export function RemoveColumn({ itemKey, keys }: { itemKey: string; keys: string[] }) {
  const router = useRouter()
  return (
    <button type="button" className="cmp-remove" aria-label="حذف از مقایسه" onClick={() => {
      removeCompare(itemKey)
      const rest = keys.filter((key) => key !== itemKey)
      router.push(rest.length ? `/compare?items=${rest.join(',')}` : '/compare')
    }}>✕</button>
  )
}

/** "Only differences" switch: hides rows whose values are all the same. */
export function DiffToggle() {
  const [on, setOn] = useState(false)
  useEffect(() => { document.querySelector('.cmp-table')?.classList.toggle('only-diff', on) }, [on])
  return <label className="studio-switch cmp-diff"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />فقط تفاوت‌ها</label>
}
