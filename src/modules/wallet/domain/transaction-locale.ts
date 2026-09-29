const labels: Record<string, { en: string; fa: string }> = {
  TOPUP: { en: 'Wallet top-up', fa: 'شارژ کیف پول' },
  PURCHASE: { en: 'Purchase', fa: 'خرید' },
  REFUND: { en: 'Refund', fa: 'بازپرداخت' },
  ADMIN_CREDIT: { en: 'Account credit', fa: 'افزایش موجودی' },
  ADMIN_DEBIT: { en: 'Account debit', fa: 'کسر موجودی' },
  RENEWAL: { en: 'Renewal', fa: 'تمدید' },
  REFERRAL: { en: 'Referral reward', fa: 'پاداش دعوت' },
  GIFT_CARD: { en: 'Gift card', fa: 'کارت هدیه' },
  LOYALTY: { en: 'Club points', fa: 'امتیاز باشگاه مشتریان' },
}

export function transactionLabel(type: string, locale: 'en' | 'fa'): string {
  return (labels[type] || { en: 'Transaction', fa: 'تراکنش' })[locale]
}
