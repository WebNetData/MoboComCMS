'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Sale = { id: number; resellerId: number; reseller: string; bot: string; telegramUserId: string; offer: { nameFa: string; nameEn: string }; status: string; retailPrice: number; currency: string; orderId: number | null; subscriptionId: number | null; createdAt: string; lastError: string; reviewedAt: string | null; reviewDecision: string; reviewerUserId: number | null; reviewerTelegramId: string }
const statuses = ['', 'REVIEW', 'NEEDS_REVIEW', 'PROVISIONING', 'FULFILLED', 'REJECTED', 'CANCELLED']

export default function ResellerSalesPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const label = (en: string, persian: string) => fa ? persian : en
  const [rows, setRows] = useState<Sale[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/reseller-sales${status ? `?status=${status}` : ''}`, { cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'Could not load'); setRows(data.sales || []); setError('') }).catch(e => setError(e instanceof Error ? e.message : 'Could not load')).finally(() => setLoading(false))
  }, [status])
  return <section className="ticket-ops"><header className="ticket-ops-header"><div><span className="ticket-eyebrow">MOBOCOMCMS / RESELLERS</span><h1>{label('Reseller bot sales', 'فروش ربات‌های نمایندگان')}</h1><p>{label('Monitor receipts, wallet-backed provisioning and orders needing manual review.', 'رسیدها، ساخت سرویس از کیف پول و سفارش‌های نیازمند بررسی را پیگیری کنید.')}</p></div></header>
    <div className="card"><div className="flex items-center justify-between gap-4 flex-wrap mb-5"><h2 className="h3">{label('Recent orders', 'سفارش‌های اخیر')}</h2><select className="input" style={{ maxWidth: 220 }} value={status} onChange={event => setStatus(event.target.value)}><option value="">{label('All statuses', 'همه وضعیت‌ها')}</option>{statuses.slice(1).map(value => <option key={value} value={value}>{value}</option>)}</select></div>{error && <p className="error-text">{error}</p>}{loading ? <p className="muted">{label('Loading…', 'در حال بارگذاری…')}</p> : !rows.length ? <p className="muted">{label('No sales found.', 'سفارشی پیدا نشد.')}</p> : <div className="overflow-x-auto"><table className="data"><thead><tr><th>#</th><th>{label('Reseller / bot', 'نماینده / ربات')}</th><th>{label('Offer', 'پلن')}</th><th>{label('Customer', 'مشتری')}</th><th>{label('Card amount', 'مبلغ کارت')}</th><th>{label('Status', 'وضعیت')}</th><th>{label('Order', 'سفارش')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.id}<div className="muted text-xs">{new Date(row.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</div></td><td>{row.reseller}<div className="muted text-xs" dir="ltr">@{row.bot}</div></td><td>{fa ? row.offer.nameFa : row.offer.nameEn}</td><td dir="ltr">{row.telegramUserId}</td><td dir="ltr">{row.retailPrice} {row.currency}</td><td><span className={`badge ${row.status === 'FULFILLED' ? 'badge-green' : row.status === 'NEEDS_REVIEW' ? 'badge-red' : 'badge-purple'}`}>{row.status}</span>{row.reviewedAt && <p className="muted text-xs mt-1">{row.reviewDecision} · {row.reviewerUserId ? `User #${row.reviewerUserId}` : row.reviewerTelegramId ? `Telegram ${row.reviewerTelegramId}` : '—'}</p>}{row.lastError && <p className="text-red-400 text-xs mt-1">{row.lastError}</p>}</td><td>{row.orderId ? <Link href="/admin/orders" className="text-sky-400">#{row.orderId}</Link> : '—'}</td></tr>)}</tbody></table></div>}</div>
  </section>
}
