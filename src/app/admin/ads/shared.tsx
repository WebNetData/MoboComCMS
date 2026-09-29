'use client'

import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useId, useState, type ReactNode } from 'react'

export { Notice, fa, faDate, send, useJson } from '../store/shared'

const TABS = [
  { href: '/admin/ads', label: 'داشبورد', exact: true },
  { href: '/admin/ads/campaigns', label: 'کمپین‌ها' },
  { href: '/admin/ads/placements', label: 'جایگاه‌ها' },
  { href: '/admin/ads/packages', label: 'بسته‌های فروش' },
  { href: '/admin/ads/advertisers', label: 'تبلیغ‌دهنده‌ها' },
  { href: '/admin/ads/settings', label: 'تنظیمات' },
]

export function AdsShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa ad" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های تبلیغات">{TABS.map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}

export const STATUS_LABEL: Record<string, string> = { DRAFT: 'پیش‌نویس', PENDING: 'منتظر بررسی', ACTIVE: 'فعال', PAUSED: 'متوقف', ENDED: 'پایان‌یافته', REJECTED: 'ردشده' }
export const STATUS_TONE: Record<string, string> = { DRAFT: '', PENDING: 'is-warn', ACTIVE: 'is-ok', PAUSED: 'is-info', ENDED: '', REJECTED: 'is-bad' }
export const StatusChip = ({ status }: { status: string }) => <span className={`sa-state ${STATUS_TONE[status] || ''}`}>{STATUS_LABEL[status] || status}</span>

export type Day = { day: string; impressions: number; clicks: number }
const num = (value: number) => value.toLocaleString('fa-IR')
const short = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}M` : value >= 1000 ? `${(value / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}K` : num(value))
const dayLabel = (day: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

/** One measure over time as a line: light grid, a single mark colour, a hover read-out and a table for screen readers. */
export function Trend({ title, data, field, unit }: { title: string; data: Day[]; field: 'impressions' | 'clicks'; unit: string }) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const values = data.map((row) => row[field])
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(1, ...values)
  const W = 640, H = 170, PL = 8, PR = 8, PT = 14, PB = 24
  const x = (i: number) => PL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - PL - PR))
  const y = (value: number) => PT + (1 - value / max) * (H - PT - PB)
  const line = values.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`
  const ticks = [0, 0.5, 1].map((f) => ({ value: Math.round(max * f), y: y(max * f) }))
  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - PL) / (W - PL - PR)) * (data.length - 1)))))
  }
  const active = hover === null ? null : { i: hover, row: data[hover] }
  return <figure className="ad-chart">
    <figcaption><b>{title}</b><span className="num">{short(total)} <small>{unit}</small></span><button type="button" className="sa-link" onClick={() => setTable((v) => !v)} aria-pressed={table}>{table ? 'نمودار' : 'جدول'}</button></figcaption>
    {table
      ? <div className="ad-chart-table"><table className="data sa-table"><thead><tr><th>روز</th><th>{unit}</th></tr></thead><tbody>{data.map((row) => <tr key={row.day}><td>{dayLabel(row.day)}</td><td className="num">{num(row[field])}</td></tr>)}</tbody></table></div>
      : <div className="ad-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} onPointerMove={pick} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
          <title id={`${id}-t`}>{`${title}: مجموع ${num(total)} ${unit} در ${num(data.length)} روز`}</title>
          {ticks.map((tick) => <g key={tick.value}><line x1={PL} x2={W - PR} y1={tick.y} y2={tick.y} className="ad-grid" /><text x={W - PR} y={tick.y - 3} textAnchor="end" className="ad-tick">{short(tick.value)}</text></g>)}
          <path d={area} className="ad-area" />
          <path d={line} className="ad-line" fill="none" />
          {[0, data.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} className="ad-tick">{dayLabel(data[i].day)}</text>)}
          {active && <g><line x1={x(active.i)} x2={x(active.i)} y1={PT} y2={H - PB} className="ad-cursor" /><circle cx={x(active.i)} cy={y(values[active.i])} r={4} className="ad-dot" /></g>}
        </svg>
        {active && <div className="ad-tip" style={{ insetInlineStart: `${(x(active.i) / W) * 100}%` }} role="status"><b className="num">{num(active.row[field])}</b> {unit}<small>{dayLabel(active.row.day)}</small></div>}
      </div>}
  </figure>
}

/** Image chooser for banners: uploads through the media endpoint and returns the stored address. */
export function ImageField({ value, onChange, label, endpoint = '/api/admin/media' }: { value: string; onChange: (url: string) => void; label: string; endpoint?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true); setError('')
    const form = new FormData()
    form.append('file', file, file.name)
    const response = await fetch(endpoint, { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'بارگذاری نشد'); return }
    onChange(data.url)
  }
  return <div className="sa-field ad-image"><span>{label}</span>
    {value ? <div className="ad-image-preview"><img src={value} alt="" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>حذف</button></div> : null}
    <label className="btn btn-ghost btn-sm ad-upload">{busy ? 'در حال بارگذاری…' : value ? 'تعویض تصویر' : 'بارگذاری تصویر'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
    {error && <small className="error-text" role="alert">{error}</small>}
  </div>
}
