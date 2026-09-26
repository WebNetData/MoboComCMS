'use client'
import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function CategoryPicker({ label, options, value, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string[]; onChange: (value: string[]) => void
}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [query, setQuery] = useState('')
  const selected = new Set(value.map(String))
  const visible = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <fieldset className="cms-category-picker">
    <legend className="sr-only">{label}</legend>
    <div className="cms-category-toolbar"><input type="search" className="input" value={query} onChange={event => setQuery(event.target.value)} aria-label={fa ? 'جست‌وجوی دسته‌بندی' : 'Search categories'} placeholder={fa ? 'جست‌وجوی دسته یا زیر‌دسته…' : 'Search categories…'} /><span className="muted text-sm">{selected.size} {fa ? 'انتخاب‌شده' : 'selected'}</span></div>
    <div className="cms-category-options">{visible.map(option => <label key={option.value}><input type="checkbox" checked={selected.has(option.value)} onChange={event => onChange(event.target.checked ? [...selected, option.value] : [...selected].filter(id => id !== option.value))} /><span>{option.label}</span></label>)}
      {!visible.length && <p className="muted text-sm">{fa ? 'دسته‌بندی‌ای پیدا نشد.' : 'No categories found.'}</p>}
    </div>
    <p className="muted text-xs">{fa ? 'می‌توانید چند دسته یا زیر‌دسته را هم‌زمان انتخاب کنید.' : 'Select one or more categories or subcategories.'}</p>
  </fieldset>
}
