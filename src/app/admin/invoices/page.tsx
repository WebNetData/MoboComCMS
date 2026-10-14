'use client'

import { useCallback, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import InvoiceList from './InvoiceList'
import { RecurringPanel, RulesPanel } from './RecurringPanel'
import { money } from './desk'
import { BASE_CURRENCY } from '@/shared/money/client'

type Summary = { counts: Record<string, number>; paidTotal: number; closedByRule: number; expiring: number; currency: string; currencies: string[] }
const TABS = [['list', 'فاکتورها', 'receipt'], ['recurring', 'دوره‌ای', 'clock'], ['rules', 'بستن خودکار', 'shield']] as const

/** The invoice desk: every customer's invoices, recurring invoices and the rules that close unpaid ones. */
export default function AdminInvoicesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('list')
  const [summary, setSummary] = useState<Summary | null>(null)
  const onSummary = useCallback((value: Summary) => setSummary(value), [])
  const currency = summary?.currency || BASE_CURRENCY
  const counts = summary?.counts || {}

  return <div className="ivd">
    <header className="ivd-head">
      <div>
        <h1>فاکتورها</h1>
        <p>فاکتور همهٔ کاربران: دیدن، ساختن، ویرایش، ثبت پرداخت، باطل و حذف؛ فاکتورهای دوره‌ای و بستن خودکار.</p>
      </div>
      <Link href="/admin/finance" className="btn btn-ghost"><Icon name="chart" size={16} /> گزارش مالی</Link>
    </header>

    <div className="ivd-tiles">
      <div className="ivd-tile is-green"><span><Icon name="check" size={18} /></span><small>وصول‌شده</small><b className="num">{money(summary?.paidTotal || 0, currency)}</b></div>
      <div className="ivd-tile is-amber"><span><Icon name="clock" size={18} /></span><small>در انتظار پرداخت</small><b className="num">{(counts.UNPAID || 0).toLocaleString('fa-IR')}</b><em>{(summary?.expiring || 0).toLocaleString('fa-IR')} با مهلت</em></div>
      <div className="ivd-tile"><span><Icon name="receipt" size={18} /></span><small>پرداخت‌شده</small><b className="num">{(counts.PAID || 0).toLocaleString('fa-IR')}</b></div>
      <div className="ivd-tile is-red"><span><Icon name="shield" size={18} /></span><small>بسته‌شده با قانون</small><b className="num">{(summary?.closedByRule || 0).toLocaleString('fa-IR')}</b></div>
    </div>

    <nav className="ivd-tabs" role="tablist" aria-label="بخش‌های فاکتور">
      {TABS.map(([id, label, icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}><Icon name={icon} size={16} />{label}</button>)}
    </nav>

    {tab === 'list' && <InvoiceList onSummary={onSummary} />}
    {tab === 'recurring' && <RecurringPanel />}
    {tab === 'rules' && <RulesPanel />}
  </div>
}
