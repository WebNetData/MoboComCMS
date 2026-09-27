'use client'

import { useState } from 'react'

const LEVELS: { id: string; label: string; hint: string }[] = [
  { id: 'WATCHING', label: '🔔 دنبال‌کردن', hint: 'برای هر موضوع و پاسخ تازه اعلان بگیرید' },
  { id: 'WATCHING_FIRST', label: '✦ نخستین پیام', hint: 'فقط برای موضوع‌های تازه اعلان بگیرید' },
  { id: 'TRACKING', label: '👁 پیگیری', hint: 'شمار خوانده‌نشده‌ها را ببینید' },
  { id: 'NORMAL', label: '○ عادی', hint: 'فقط پاسخ و نام‌بردن از شما' },
  { id: 'MUTED', label: '🔕 بی‌صدا', hint: 'موضوع‌های این دسته در فهرست‌های کلی نیاید' },
]

/** Category notification level (Discourse's bell on a category page). */
export default function CategoryWatch({ categoryId, initial }: { categoryId: number; initial: string }) {
  const [level, setLevel] = useState(initial)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  async function choose(next: string) {
    setOpen(false)
    const response = await fetch(`/api/forum/categories/${categoryId}/level`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: next }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { setLevel(data.level); setError('') } else setError(data?.error || 'انجام نشد')
  }
  const current = LEVELS.find((item) => item.id === level) || LEVELS[3]
  return <span className="fx-pop fx-cat-watch">
    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>{current.label}</button>
    {open && <span className="fx-menu fx-menu-list fx-levels" role="menu">{LEVELS.map((item) => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === level} className={item.id === level ? 'is-active' : ''} onClick={() => void choose(item.id)}><b>{item.label}</b><small>{item.hint}</small></button>)}</span>}
    {error && <small className="error-text" role="alert">{error}</small>}
  </span>
}
