'use client'

import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import { usePathname } from '@/platform/routing/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { iranianUnit } from '@/shared/money/format'

// Shared pieces of the store admin: section tabs, JSON loader, money and
// persian date formatting, status labels.

export const fa = (value: number) => value.toLocaleString('fa-IR')
export const faDate = (value: string | Date, time = false) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Tehran' }).format(new Date(value))
export const faDay = (day: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

export function Money({ value, currency }: { value: number; currency: string }) {
  const unit = iranianUnit(currency, 'fa-IR')
  return <span className="sa-money"><b className="num">{unit ? Math.round(value).toLocaleString('fa-IR') : new Intl.NumberFormat('fa-IR', { style: 'currency', currency }).format(value)}</b>{unit && <small>{unit}</small>}</span>
}

const TABS = [
  { href: '/admin/store', label: 'داشبورد', exact: true },
  { href: '/admin/store/orders', label: 'سفارش‌ها' },
  { href: '/admin/store/returns', label: 'لغو و مرجوعی' },
  { href: '/admin/store/print', label: 'چاپ کارت حضوری' },
  { href: '/admin/store/shipments', label: 'مرسوله‌ها' },
  { href: '/admin/store/products', label: 'محصولات' },
  { href: '/admin/store/inventory', label: 'انبار' },
  { href: '/admin/store/brands', label: 'برندها' },
  { href: '/admin/store/customers', label: 'مشتریان' },
  { href: '/admin/store/marketing', label: 'بازاریابی و وفاداری' },
  { href: '/admin/store/feeds', label: 'ترب و ایمالز' },
  { href: '/admin/store/currency', label: 'نرخ ارز' },
  { href: '/admin/store/settings', label: 'ویترین' },
]

export function StoreShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const permissions = (session?.user as { permissions?: string[] } | undefined)?.permissions || []
  const specialist = permissions.includes('store.orders.handle') && !permissions.includes('orders.manage')
  return <div className="sa" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های فروشگاه">{TABS.filter(tab => !specialist || tab.href === '/admin/store/orders' || tab.href === '/admin/store/print').map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head"><h1>{title}</h1>{actions && <div className="sa-head-actions">{actions}</div>}</header>
    {children}
  </div>
}

/** GET a JSON admin endpoint; `reload` refetches. */
export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const reload = useCallback(async () => {
    if (!url) return
    setLoading(true)
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError(String(body?.error || 'بارگذاری انجام نشد')); return }
      setError(''); setData(body as T)
    } catch { setError('ارتباط با سرور برقرار نشد') } finally { setLoading(false) }
  }, [url])
  useEffect(() => { void reload() }, [reload])
  return { data, error, loading, reload, setData }
}

export async function send<T = unknown>(url: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown, headers: Record<string, string> = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json().catch(() => null)
    return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'عملیات انجام نشد') }
  } catch { return { ok: false, error: 'ارتباط با سرور برقرار نشد' } }
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return <p className={`sa-notice is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null
  return <nav className="sa-pager" aria-label="صفحه‌بندی">
    <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>قبلی</button>
    <span className="num">{fa(page)} از {fa(pages)}</span>
    <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>بعدی</button>
  </nav>
}

export const RETURN_TONE: Record<string, string> = { REQUESTED: 'is-warn', APPROVED: 'is-info', REFUNDED: 'is-ok', REJECTED: 'is-bad', WITHDRAWN: '' }
export const STATE_TONE: Record<string, string> = { info: 'is-info', warn: 'is-warn', ok: 'is-ok', bad: 'is-bad' }
