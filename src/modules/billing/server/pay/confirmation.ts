import type { PayConfirmation, PayReceiptReview } from '@/modules/billing/domain/pay'

type CollectionProof = { status: string; settlementMethod: string; notice?: { sourceType: string } | null }
export function collectionConfirmation(row: CollectionProof): PayConfirmation {
  if (row.status !== 'PAID') return { method: 'NONE', source: '' }
  if (row.settlementMethod === 'MANUAL') return { method: 'MANUAL', source: 'STAFF' }
  const source = row.notice?.sourceType
  return { method: row.settlementMethod === 'REVIEWED_NOTICE' ? 'BANK' : 'AUTO', source: source === 'SMS' || source === 'BALE' ? source : '' }
}
export function paymentConfirmation(row: { status: string; invoiceId: number | null; gatewayAttemptProvider: string }, collection?: CollectionProof, raw = ''): PayConfirmation {
  if (row.status !== 'PAID') return { method: 'NONE', source: '' }
  if (collection?.status === 'PAID') return collectionConfirmation(collection)
  if (row.invoiceId === null) return { method: 'BANK', source: 'BANK' }
  let receipt = false
  try {
    const source = JSON.parse(raw).source
    if (source === 'mobocom-pay-bank') return { method: 'BANK', source: 'BANK' }
    receipt = source === 'pay-receipt'
  } catch { /* No best-effort proof inference from unstructured text. */ }
  return receipt || ['CARD_TRANSFER','MANUAL'].includes(row.gatewayAttemptProvider)
    ? { method: 'MANUAL', source: 'STAFF' } : { method: 'PROVIDER', source: 'PROVIDER' }
}
export function receiptReviewResult(status: string, alreadyPaid: boolean, confirmation: PayConfirmation): PayReceiptReview {
  return { status, alreadyPaid, confirmation, message: alreadyPaid
    ? confirmation.method === 'AUTO'
      ? `این تراکنش قبلاً خودکار${confirmation.source === 'SMS' ? ' با پیامک' : confirmation.source === 'BALE' ? ' با بله' : ''} تأیید شده است؛ مبلغ دوباره به موجودی اضافه نشد.`
      : 'این تراکنش قبلاً تأیید شده است؛ مبلغ دوباره به موجودی اضافه نشد.'
    : status === 'APPROVED' ? 'وصول وجه تأیید شد؛ فقط مبلغ خالص به موجودی اضافه شد.' : 'رسید با دلیل ثبت‌شده رد شد.' }
}
