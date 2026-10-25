'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { categoryOptions } from '@/modules/site/domain/categories'
import { useI18n } from '@/i18n/LocaleProvider'
import { JournalShell } from '../journal/shared'

type Category = { id: number; slug: string; name: string; nameEn: string; parentId: number | null }
const empty = { slug: '', name: '', nameEn: '', parentId: '' }

export default function AdminPostCatsPage() {
  const { locale } = useI18n(); const fa = locale === 'fa'; const L = (en: string, persian: string) => fa ? persian : en
  const [categories, setCategories] = useState<Category[]>([])
  const [expanded, setExpanded] = useState<number[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/cms?type=postcats', { cache: 'no-store' })
    if (response.ok) setCategories(await response.json())
  }, [])
  useEffect(() => { void load() }, [load])

  const byParent = useMemo(() => {
    const map = new Map<number | null, Category[]>()
    for (const category of categories) { const key = category.parentId ?? null; map.set(key, [...(map.get(key) || []), category]) }
    for (const rows of map.values()) rows.sort((a, b) => (fa ? a.name : a.nameEn || a.name).localeCompare(fa ? b.name : b.nameEn || b.name, fa ? 'fa' : 'en'))
    return map
  }, [categories, fa])
  const matches = useMemo(() => new Set(categories.filter(category => `${category.name} ${category.nameEn} ${category.slug}`.toLowerCase().includes(query.toLowerCase().trim())).map(category => category.id)), [categories, query])
  const visible = (category: Category): boolean => !query.trim() || matches.has(category.id) || (byParent.get(category.id) || []).some(visible)

  function select(category: Category) { setEditing(category.id); setForm({ slug: category.slug, name: category.name, nameEn: category.nameEn, parentId: category.parentId ? String(category.parentId) : '' }); setMessage('') }
  function newChild(category?: Category) { setEditing(null); setForm({ ...empty, parentId: category ? String(category.id) : '' }); if (category && !expanded.includes(category.id)) setExpanded(current => [...current, category.id]); setMessage('') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setMessage('')
    try { const response = await fetch('/api/admin/cms?type=postcats', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editing, parentId: form.parentId || null }) }); const data = await response.json().catch(() => null); if (!response.ok) throw Error(data?.error || L('Could not save category.', 'دسته‌بندی ذخیره نشد.')); await load(); if (!editing && form.parentId) setExpanded(current => [...new Set([...current, Number(form.parentId)])]); setMessage(L('Category saved.', 'دسته‌بندی ذخیره شد.')) }
    catch (error) { setMessage(error instanceof Error ? error.message : L('Could not save.', 'ذخیره ممکن نشد.')) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!editing || !window.confirm(L('Delete this category?', 'این دسته‌بندی حذف شود؟'))) return
    setBusy(true); setMessage('')
    try { const response = await fetch(`/api/admin/cms?type=postcats&id=${editing}`, { method: 'DELETE' }); const data = await response.json().catch(() => null); if (!response.ok) throw Error(data?.error || L('Could not delete category.', 'حذف ممکن نشد.')); setEditing(null); setForm({ ...empty }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : L('Could not delete.', 'حذف ممکن نشد.')) }
    finally { setBusy(false) }
  }

  function branch(parentId: number | null, depth = 0): React.ReactNode {
    if (depth > 30) return null
    return (byParent.get(parentId) || []).filter(visible).map(category => { const children = byParent.get(category.id) || []; const open = !!query.trim() || expanded.includes(category.id); return <div key={category.id} className="journal-tree-node"><div className={`journal-tree-row ${editing === category.id ? 'is-selected' : ''}`} style={{ paddingInlineStart: `${12 + depth * 19}px` }}><button type="button" className="journal-tree-toggle" aria-label={open ? L('Collapse', 'بستن') : L('Expand', 'باز کردن')} disabled={!children.length} onClick={() => setExpanded(current => open ? current.filter(id => id !== category.id) : [...current, category.id])}>{children.length ? (open ? '⌄' : '›') : '·'}</button><button type="button" className="journal-tree-name" onClick={() => select(category)}><strong>{fa ? category.name : category.nameEn || category.name}</strong><small><bdi dir="ltr">/{category.slug}</bdi> · {children.length ? `${children.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} ${L('children', 'زیرشاخه')}` : L('no children', 'بدون زیرشاخه')}</small></button><button type="button" className="journal-tree-add" title={L('Add subcategory', 'افزودن زیرشاخه')} onClick={() => newChild(category)}>+</button></div>{open && branch(category.id, depth + 1)}</div> })
  }
  return <JournalShell><section className="journal-category-admin"><header className="ticket-ops-header"><div><span className="ticket-eyebrow">مجله</span><h1>{L('Category tree', 'درخت دسته‌بندی مجله')}</h1><p>{L('Create as many nested levels as you need; assign articles to several categories.', 'هر تعداد سطح زیرشاخه بسازید و هر نوشته را به چند دسته‌بندی مرتبط کنید.')}</p></div><button type="button" className="btn btn-primary" onClick={() => newChild()}>+ {L('Root category', 'دستهٔ اصلی')}</button></header>{message && <p className="ticket-alert" role="status">{message}</p>}<div className="journal-category-grid"><div className="journal-category-tree"><div className="journal-category-tree-head"><h2>{L('Structure', 'ساختار دسته‌ها')}</h2><span>{categories.length}</span></div><input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={L('Search categories…', 'جست‌وجوی دسته‌ها…')} />{categories.length ? <div className="journal-tree-list">{branch(null)}</div> : <p className="ticket-empty">{L('No categories yet.', 'هنوز دسته‌بندی‌ای وجود ندارد.')}</p>}</div><form className="journal-category-editor" onSubmit={save}><span className="ticket-eyebrow">{editing ? L('EDIT CATEGORY', 'ویرایش دسته') : L('NEW CATEGORY', 'دستهٔ جدید')}</span><h2>{editing ? (fa ? categories.find(item => item.id === editing)?.name : categories.find(item => item.id === editing)?.nameEn) : L('Create a category', 'ساخت دسته‌بندی')}</h2><label className="ticket-field">{L('Parent category', 'دستهٔ مادر')}<select className="input" value={form.parentId} onChange={event => setForm({ ...form, parentId: event.target.value })}><option value="">{L('None — root category', 'بدون مادر — دستهٔ اصلی')}</option>{categoryOptions(categories, locale, editing || undefined).map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label className="ticket-field">{L('Persian name', 'نام فارسی')}<input className="input" dir="rtl" required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label className="ticket-field">{L('English name', 'نام انگلیسی')}<input className="input" dir="ltr" maxLength={100} value={form.nameEn} onChange={event => setForm({ ...form, nameEn: event.target.value })} /></label><label className="ticket-field">{L('URL key', 'شناسه نشانی')}<input className="input" dir="ltr" required pattern="[a-z0-9][a-z0-9-]*" value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value.toLowerCase() })} /></label><div className="journal-category-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? L('Saving…', 'در حال ذخیره…') : L('Save category', 'ذخیره دسته‌بندی')}</button>{editing && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>{L('Delete', 'حذف')}</button>}</div></form></div></section></JournalShell>
}
