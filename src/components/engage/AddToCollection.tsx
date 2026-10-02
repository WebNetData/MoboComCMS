'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Row = { id: number; title: string; _count: { items: number } }

export default function AddToCollection({ item, loggedIn }: { item: string; loggedIn: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function toggle() {
    if (!loggedIn) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return }
    if (open) { setOpen(false); return }
    setOpen(true); setMessage('')
    const response = await fetch('/api/collections').catch(() => null)
    if (!response?.ok) { setMessage(fa ? 'فهرست مجموعه‌ها بارگذاری نشد.' : 'Could not load collections.'); return }
    setRows(await response.json())
  }

  async function add(id: number) {
    setBusy(id); setMessage('')
    try {
      const response = await fetch(`/api/collections/${id}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Request failed')
      setMessage(result.added ? (fa ? 'به مجموعه اضافه شد.' : 'Added to collection.') : (fa ? 'از قبل در مجموعه بود.' : 'Already in collection.'))
    } catch (cause) { setMessage((cause as Error).message) } finally { setBusy(null) }
  }

  return <div className="collections-picker"><button type="button" className="ea-btn" aria-expanded={open} onClick={() => void toggle()}><span aria-hidden="true">▦</span>{fa ? 'افزودن به مجموعه' : 'Add to collection'}</button>{open && <div className="collections-picker-menu"><strong>{fa ? 'مجموعهٔ مقصد' : 'Choose collection'}</strong>{rows ? rows.length ? rows.map((row) => <button type="button" key={row.id} disabled={busy !== null} onClick={() => void add(row.id)}>{row.title}<small>{row._count.items}</small></button>) : <p>{fa ? 'هنوز مجموعه‌ای ندارید.' : 'No collections yet.'}</p> : <p>{fa ? 'در حال بارگذاری…' : 'Loading…'}</p>}<Link href="/dashboard/collections">{fa ? 'ساخت مجموعهٔ تازه' : 'Create collection'}</Link>{message && <p role="status">{message}</p>}</div>}</div>
}
