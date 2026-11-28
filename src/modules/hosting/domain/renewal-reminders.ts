import type { RenewalInvoice } from './workspace'

export const renewalDueFilters = ['ALL', 'OVERDUE', 'NEXT_7', 'NEXT_30'] as const
export const renewalInvoiceFilters = ['ALL', 'UNPAID', 'NONE', 'PAID'] as const
export type RenewalDueFilter = typeof renewalDueFilters[number]
export type RenewalInvoiceFilter = typeof renewalInvoiceFilters[number]

export type RenewalReminderDelivery = {
  recordedAt: string
  channels: {
    channel: 'sms' | 'email' | 'push'
    status: 'QUEUED' | 'DELIVERED' | 'SKIPPED' | 'RETRYING' | 'FAILED'
    reason: string | null
  }[]
}

export type RenewalReminderRow = {
  id: number
  label: string
  recipient: string
  userId: number
  dueAt: string
  invoice: RenewalInvoice | null
  delivery: RenewalReminderDelivery | null
  eligible: boolean
}

export type RenewalReminderPreview = { items: RenewalReminderRow[]; nextCursor: number | null }
export type RenewalReminderSelection = { id: number; userId: number; dueAt: string; invoiceNumber: string | null }
export type RenewalReminderResult = {
  id: number
  status: 'QUEUED' | 'ALREADY_RECORDED' | 'SKIPPED' | 'FAILED'
  message: string
}
