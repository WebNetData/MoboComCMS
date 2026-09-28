'use client'

import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

export default function CheckoutError({
  code,
  message: _message,
  needed = 0,
  currency = 'USD',
}: {
  code: string
  message: string
  needed?: number
  currency?: string
}) {
  const { t, locale } = useI18n()
  const text =
    code === 'INSUFFICIENT_FUNDS' || code === 'WALLET_FAILED'
      ? `${t.walletInsufficient}${needed > 0 ? ` (${formatCurrency(needed, currency, locale === 'fa' ? 'fa-IR' : 'en-US')})` : ''}`
      : code === 'NO_GATEWAY' || code === 'GATEWAY_CURRENCY_MISMATCH'
        ? t.noGatewayConfigured
        : t.errGeneric
  const offerTopUp = code === 'INSUFFICIENT_FUNDS' || code === 'NO_GATEWAY'
  return (
    <div className="checkout-error">
      <span className="checkout-error-icon">⚠️</span>
      <p>{text}</p>
      <div className="checkout-error-actions">
        {offerTopUp && <Link href="/dashboard/wallet" className="btn btn-primary btn-sm">＋ {t.topUpWallet}</Link>}
        <Link href="/dashboard/invoices" className="btn btn-ghost btn-sm">{t.myInvoices}</Link>
      </div>
    </div>
  )
}
