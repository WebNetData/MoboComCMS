'use client'

import { useI18n } from '@/i18n/LocaleProvider'

export default function TicketStatusBadge({ value }: { value: string }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const labels: Record<string, [string, string, string]> = {
    OPEN: ['Awaiting support reply', 'در انتظار پاسخ', 'badge-amber'],
    PENDING: ['Answered', 'پاسخ داده شده', 'badge-green'],
    CLOSED: ['Closed', 'بسته شده', 'badge-gray'],
  }
  const [english, persian, style] = labels[value] || [value, value, 'badge-gray']
  return <span className={`badge ${style}`}>{fa ? persian : english}</span>
}
