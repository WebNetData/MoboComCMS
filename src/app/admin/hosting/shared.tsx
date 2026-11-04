'use client'

import Link from '@/components/AppLink'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import './hosting-admin.css'

export type AdminPrice = { cycle: string; currency: string; amountMinor: string; setupMinor: string }
export type AdminProduct = {
  id: number; slug: string; name: string; tagline: string; description: string; kind: string; fulfillment: string
  providerId: number | null; providerPlan: string; cpuCores: number; ramMb: number; diskGb: number; diskType: string
  trafficGb: number; bandwidthMbps: number; sites: number; mailboxes: number; databases: number; ipv4: number; location: string
  features: string[]; allowTraffic: boolean; trafficPackGb: number; trafficPackMinor: string; allowUpgrade: boolean
  stoppedHourlyMinor: string; active: boolean; featured: boolean; sort: number; prices: AdminPrice[]
}
export type AdminProvider = {
  id: number; name: string; family: string; driver: string; url: string; username: string; location: string; capacity: number
  active: boolean; hasSecret: boolean; products: number; built: boolean
  lastCheckAt: string | null; lastCheckOk: boolean | null; lastCheckMessage: string
}
export type HostingData = { products: AdminProduct[]; providers: AdminProvider[] }

const TABS = [
  { href: '/admin/hosting/services', label: 'سرویس‌های مشتریان' },
  { href: '/admin/hosting', label: 'محصولات و پلن‌ها', exact: true },
  { href: '/admin/hosting/domains', label: 'دامنه‌ها' },
  { href: '/admin/hosting/tlds', label: 'پسوند و قیمت دامنه' },
  { href: '/admin/hosting/providers', label: 'سامانه‌های متصل' },
]

export function HostingShell({ title, hint, actions, children }: { title: string; hint: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  return <div className="sa hx-admin" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های میزبانی">{TABS.map((tab) => {
      const on = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
      return <Link key={tab.href} href={tab.href} className={on ? 'is-active' : ''} aria-current={on ? 'page' : undefined}>{tab.label}</Link>
    })}</nav>
    <header className="sa-head">
      <div><h1>{title}</h1><p className="sa-hint">{hint}</p></div>
      {actions && <div className="sa-head-actions">{actions}</div>}
    </header>
    {children}
  </div>
}

/** Whole toman with Persian digits and separators, as in the rest of the Admin. */
export const toman = (value: string | number) => `${Number(value || 0).toLocaleString('fa-IR')} تومان`
