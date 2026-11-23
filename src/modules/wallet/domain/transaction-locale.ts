const labels: Record<string, { en: string; fa: string }> = {
  PAY_CREDIT: { en: 'MoboComPay proceeds', fa: 'درآمد تأییدشدهٔ موبوکام‌پی' },
  PAY_RESERVE: { en: 'MoboComPay settlement reserve', fa: 'رزرو تسویهٔ موبوکام‌پی' },
  PAY_RELEASE: { en: 'MoboComPay reserve released', fa: 'بازگشت رزرو تسویهٔ موبوکام‌پی' },
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
