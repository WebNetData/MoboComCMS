'use client'

import { useI18n } from '@/i18n/LocaleProvider'

const CLASS_MAP: Record<string, string> = {
  ACTIVE: 'badge-green',
  PAID: 'badge-green',
  OPEN: 'badge-green',
  DISABLED: 'badge-gray',
  CANCELLED: 'badge-gray',
  CLOSED: 'badge-gray',
  EXPIRED: 'badge-amber',
  TRAFFIC_EXHAUSTED: 'badge-amber',
  PENDING: 'badge-amber',
  FAILED: 'badge-red',
  BANNED: 'badge-red',
  ADMIN: 'badge-purple',
  CUSTOMER: 'badge-gray',
}

export default function StatusBadge({ value }: { value: string }) {
  const { t } = useI18n()
  const key = `st${value}` as keyof typeof t
  const label = (t as Record<string, string>)[key] || value
  return <span className={`badge ${CLASS_MAP[value] || 'badge-gray'}`}>{label}</span>
}
