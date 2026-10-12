'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useState, type ReactNode } from 'react'
import { fa, faDay } from '../store/shared'

// Building blocks for content-section admins (cinema, music…): tabbed shell,
// daily bars chart, home-block (rail) editor and an ordered picker. All use
// the shared sa-* admin kit.

export type SectionTab = { href: string; label: string; exact?: boolean }

export function SectionShell({ tabs, label, title, actions, children }: { tabs: SectionTab[]; label: string; title?: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa ga" dir="rtl">
    <nav className="sa-tabs" aria-label={label}>{tabs.map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    {title && <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>}
    {children}
  </div>
}

/** One series of daily counts — hover/focus readout and a table view (RTL: newest on the left). */
export function DailyBars({ title, unit, series }: { title: string; unit: string; series: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...series.map((point) => point.value))
  const width = 720, height = 160, gap = 2
  const bar = (width - gap * (series.length - 1)) / Math.max(1, series.length)
  const shown = hover !== null ? series[hover] : null
  const total = series.reduce((sum, point) => sum + point.value, 0)
  return <section className="sa-card sa-chart">
    <header className="sa-card-head">
      <h2>{title}</h2>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={table} onClick={() => setTable((open) => !open)}>{table ? 'نمایش نمودار' : 'نمایش جدول'}</button>
    </header>
    {table ? <div className="sa-table-wrap"><table className="data"><thead><tr><th>روز</th><th>{unit}</th></tr></thead><tbody>{[...series].reverse().map((point) => <tr key={point.day}><td>{faDay(point.day)}</td><td className="num">{fa(point.value)}</td></tr>)}</tbody></table></div>
      : <div className="sa-chart-body">
        <div className="sa-chart-tip" aria-live="polite">{shown ? <><b>{faDay(shown.day)}</b><span className="num">{fa(shown.value)} {unit}</span></> : <small>مجموع {fa(total)} {unit} — برای جزئیات روی ستون‌ها بروید</small>}</div>
        <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={title} preserveAspectRatio="none">
          {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={0} x2={width} y1={height - ratio * height} y2={height - ratio * height} className="sa-gridline" />)}
          {series.map((point, index) => {
            const h = point.value ? Math.max(4, (point.value / max) * height) : 0
            const x = width - (index + 1) * bar - index * gap
            return <g key={point.day} tabIndex={0} role="img" aria-label={`${faDay(point.day)}: ${fa(point.value)} ${unit}`} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}>
              <rect x={x} y={0} width={bar} height={height} className="sa-hit" />
              {h > 0 && <path className={`sa-bar${hover === index ? ' is-hover' : ''}`} d={`M${x},${height} v${-(h - 4)} q0,-4 4,-4 h${Math.max(0, bar - 8)} q4,0 4,4 v${h - 4} z`} />}
            </g>
          })}
          <line x1={0} x2={width} y1={height} y2={height} className="sa-axis" />
          {series.length > 0 && <>
            <text x={width} y={height + 18} textAnchor="end" className="sa-tick">{faDay(series[0].day)}</text>
            <text x={0} y={height + 18} textAnchor="start" className="sa-tick">{faDay(series[series.length - 1].day)}</text>
          </>}
        </svg>
        <div className="sa-chart-scale"><small>بیشینه: {fa(max)} {unit} در روز</small></div>
      </div>}
  </section>
}

/** Order and visibility of a section home page's blocks. */
export function RailsEditor<K extends string>({ rails, labels, onChange }: { rails: { key: K; enabled: boolean }[]; labels: Record<K, string>; onChange: (rails: { key: K; enabled: boolean }[]) => void }) {
  const move = (index: number, delta: number) => {
    const next = [...rails]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return <ol className="ga-rails">{rails.map((rail, index) => <li key={rail.key} data-vip={rail.key === 'members' || rail.key === 'vipStrip' ? '' : undefined} className={rail.enabled ? '' : 'is-off'}>
    <span className="ga-rail-index num">{fa(index + 1)}</span>
    <label className="sa-check"><input type="checkbox" checked={rail.enabled} onChange={(e) => onChange(rails.map((r) => (r.key === rail.key ? { ...r, enabled: e.target.checked } : r)))} />{labels[rail.key]}</label>
    <span className="ga-rail-move"><button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`بالا بردن ${labels[rail.key]}`}>↑</button><button type="button" className="btn btn-ghost btn-sm" disabled={index === rails.length - 1} onClick={() => move(index, 1)} aria-label={`پایین بردن ${labels[rail.key]}`}>↓</button></span>
  </li>)}</ol>
}

export type PickItem = { id: number; title: string; image: string; sub?: string }

/** Ordered hand-picked items (slider, featured shelf) chosen from a list. */
export function OrderedPicker({ items, ids, max, placeholder, onChange }: { items: PickItem[]; ids: number[]; max: number; placeholder: string; onChange: (ids: number[]) => void }) {
  const [pick, setPick] = useState('')
  const byId = new Map(items.map((item) => [item.id, item]))
  return <>
    {ids.length ? <ul className="sa-rank">{ids.map((id, index) => { const item = byId.get(id); return <li key={id}>{item?.image ? <img src={item.image} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{item?.title || `#${fa(id)} (منتشر نشده)`}</b>{item?.sub && <small>{item.sub}</small>}</span>
      <button type="button" className="sa-link" disabled={index === 0} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }} aria-label={`بالا بردن ${item?.title || id}`}>↑</button>
      <button type="button" className="sa-link is-danger" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`حذف ${item?.title || id}`}>✕</button></li> })}</ul>
      : <p className="sa-hint">چیزی انتخاب نشده؛ خودکار پر می‌شود.</p>}
    {ids.length < max && <div className="ga-line"><select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={placeholder}><option value="">{placeholder}</option>{items.filter((item) => !ids.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}{item.sub ? ` — ${item.sub}` : ''}</option>)}</select><button type="button" className="btn btn-ghost btn-sm" disabled={!pick} onClick={() => { onChange([...ids, Number(pick)]); setPick('') }}>افزودن</button></div>}
  </>
}
