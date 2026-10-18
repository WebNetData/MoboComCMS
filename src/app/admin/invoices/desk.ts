import { BASE_CURRENCY, formatCurrency } from '@/shared/money/client'

// Plain helpers of the invoice desk (no components here).

export type Person = { id: number; email: string; name: string; avatar?: string }
export type Gateway = { id: number; name: string; fiat?: string; active?: boolean }

export const STATUS_LABEL: Record<string, string> = { UNPAID: 'پرداخت‌نشده', PAID: 'پرداخت‌شده', VOID: 'باطل', REFUNDED: 'بازپرداخت', DRAFT: 'پیش‌نویس' }
export const CURRENCIES = [...new Set([BASE_CURRENCY, 'IRT', 'IRR', 'USD', 'EUR'])]
export const CURRENCY_LABEL: Record<string, string> = { IRT: 'تومان ایران (IRT)', IRR: 'ریال ایران (IRR)', USD: 'دلار (USD)', EUR: 'یورو (EUR)' }

export const money = (amount: number, currency: string) => formatCurrency(amount || 0, currency, 'fa-IR')
const dateOnly = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' })
const dateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const jalali = (value: string | Date | null | undefined, withTime = false) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : (withTime ? dateTime : dateOnly).format(date)
}
/** A value for <input type="datetime-local"> in the browser's own time. */
export const localInput = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
/** A number typed into a field, or 0. */
export const numberOf = (value: string) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }

export async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  if (!response) return { ok: false, data: null, error: 'ارتباط با سرور برقرار نشد' }
  const data = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, data, error: (data && (data.error || data.message)) || 'خطایی رخ داد' }
  return { ok: true, data, error: '' }
}
