// Safe for browser forms; validation and Node-only business normalization stay separate.
export { REPORT_REASONS as BUSINESS_REPORT_REASONS } from '@/modules/community/domain/community'
export const PROOF_STATUS_LABELS: Record<string, string> = { PENDING: 'در انتظار بررسی', APPROVED: 'مدرک بررسی‌شده', REJECTED: 'تأیید نشد', WITHDRAWN: 'پس‌گرفته‌شده' }
