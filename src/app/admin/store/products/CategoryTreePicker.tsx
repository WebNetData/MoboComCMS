'use client'

import { useMemo, useState, type ReactNode } from 'react'

type Category = { id: number; name: string; parentId: number | null; kind?: string }

const faNum = (value: number) => value.toLocaleString('fa-IR')

/**
 * WordPress-like category ticks for a product: the whole tree of its half of the shop, any number of categories and
 * sub-categories ticked, one of them the main category (its path on the product page and its specification fields).
 * The first tick becomes the main one; unticking the main one passes the role to the next.
 */
export default function CategoryTreePicker({ categories, kind, main, extras, onChange }: {
  categories: Category[]; kind: string; main: string; extras: string[]; onChange: (main: string, extras: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const chosen = useMemo(() => new Set([main, ...extras].filter(Boolean)), [main, extras])
  // This half's categories (and any already chosen, so nothing chosen is hidden).
  const pool = useMemo(() => categories.filter((category) => !category.kind || category.kind === kind || chosen.has(String(category.id))), [categories, kind, chosen])
  const byParent = useMemo(() => {
    const map = new Map<number | null, Category[]>()
    for (const category of pool) {
      const parent = category.parentId && pool.some((item) => item.id === category.parentId) ? category.parentId : null
      map.set(parent, [...(map.get(parent) || []), category])
    }
    return map
  }, [pool])
  // While searching: the matches and the branches that lead to them.
  const needle = query.trim().toLocaleLowerCase()
  const shown = useMemo(() => {
    if (!needle) return null
    const keep = new Set<number>()
    for (const category of pool) if (category.name.toLocaleLowerCase().includes(needle)) {
      for (let at: Category | undefined = category, guard = 0; at && guard < 10; at = pool.find((item) => item.id === at!.parentId), guard++) keep.add(at.id)
    }
    return keep
  }, [needle, pool])
  const [closed, setClosed] = useState<Set<number>>(() => new Set())

  function toggle(id: string, on: boolean) {
    if (on) {
      if (!main) onChange(id, extras.filter((item) => item !== id))
      else if (id !== main && !extras.includes(id)) onChange(main, [...extras, id])
      return
    }
    if (id === main) { const [next = '', ...rest] = extras; onChange(next, rest) } else onChange(main, extras.filter((item) => item !== id))
  }
  const makeMain = (id: string) => onChange(id, [...extras.filter((item) => item !== id), ...(main ? [main] : [])])

  const branch = (parent: number | null, depth: number): ReactNode => {
    const list = (byParent.get(parent) || []).filter((category) => !shown || shown.has(category.id))
    if (!list.length || depth > 6) return null
    return <ul className={depth ? 'ctp-sub' : 'ctp-tree'}>{list.map((category) => {
      const id = String(category.id), kids = (byParent.get(category.id) || []).length, open = !!shown || !closed.has(category.id)
      const isMain = id === main, isOn = chosen.has(id)
      return <li key={category.id}>
        <div className={`ctp-row${isOn ? ' is-on' : ''}`}>
          {kids > 0
            ? <button type="button" className="ctp-fold" aria-expanded={open} aria-label={`${open ? 'بستن' : 'باز کردن'} ${category.name}`} onClick={() => setClosed((current) => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next })}>{open ? '▾' : '◂'}</button>
            : <span className="ctp-fold is-leaf" aria-hidden="true" />}
          <label className="ctp-check"><input type="checkbox" checked={isOn} onChange={(event) => toggle(id, event.target.checked)} /><span>{category.name}</span></label>
          {isOn && (isMain
            ? <span className="ctp-main">★ دستهٔ اصلی</span>
            : <button type="button" className="ctp-make" onClick={() => makeMain(id)} aria-label={`${category.name} دستهٔ اصلی شود`}>اصلی شود</button>)}
        </div>
        {kids > 0 && open && branch(category.id, depth + 1)}
      </li>
    })}</ul>
  }

  return <fieldset className="ctp">
    <legend className="sr-only">دسته‌بندی‌های محصول</legend>
    <div className="ctp-top">
      <input type="search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="جست‌وجو در دسته‌ها" placeholder="جست‌وجو در دسته‌ها…" />
      <small className="ctp-count">{chosen.size ? `${faNum(chosen.size)} دسته انتخاب شده` : 'بدون دسته'}</small>
    </div>
    <div className="ctp-box">
      {pool.length ? branch(null, 0) : <p className="ctp-empty">دسته‌ای برای این نوع محصول نیست؛ از «مدیریت دسته‌ها» بسازید.</p>}
      {shown && !shown.size && <p className="ctp-empty">دسته‌ای با این نام پیدا نشد.</p>}
    </div>
    <p className="sa-hint">محصول در همهٔ دسته‌های تیک‌خورده نمایش داده می‌شود. «دستهٔ اصلی» مسیر صفحهٔ محصول و فیلدهای مشخصات فنی را تعیین می‌کند.</p>
  </fieldset>
}
