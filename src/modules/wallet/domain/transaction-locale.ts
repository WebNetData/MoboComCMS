const labels: Record<string, { en: string; fa: string }> = {
  TOPUP: { en: 'Wallet top-up', fa: 'شارژ کیف پول' },
  PURCHASE: { en: 'Purchase', fa: 'خرید' },
  REFUND: { en: 'Refund', fa: 'بازپرداخت' },
  ADMIN_CREDIT: { en: 'Account credit', fa: 'افزایش موجودی' },
  ADMIN_DEBIT: { en: 'Account debit', fa: 'کسر موجودی' },
  RENEWAL: { en: 'Renewal', fa: 'تمدید' },
}

export function transactionLabel(type: string, locale: 'en' | 'fa'): string {
  return (labels[type] || { en: 'Transaction', fa: 'تراکنش' })[locale]
}
