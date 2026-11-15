export const OTP_GROUPS = [
  { id: 'login', label: 'ورود و ثبت‌نام' },
  { id: 'verify', label: 'تأیید شماره' },
  { id: 'reset', label: 'بازیابی حساب' },
  { id: 'counter', label: 'تأیید خرید حضوری' },
  { id: 'repair', label: 'تأیید درخواست تعمیر' },
] as const
export type OtpGroup = typeof OTP_GROUPS[number]['id']
export interface OtpTemplate { text: string; pattern: string; param: string }
export type OtpTemplates = Partial<Record<OtpGroup, OtpTemplate>>

/** Ready texts are applied only by an explicit administrator action. */
export const SMS_READY_TEMPLATES = [
  { id: 'otp-login', label: 'ورود امن', group: 'login', text: 'کد ورود شما به {brand}: {code}\nاین کد را در اختیار دیگران نگذارید.' },
  { id: 'otp-verify', label: 'تأیید شماره', group: 'verify', text: 'کد تأیید شماره در {brand}: {code}\nاین کد را در اختیار دیگران نگذارید.' },
  { id: 'otp-reset', label: 'بازیابی حساب', group: 'reset', text: 'کد بازیابی حساب شما در {brand}: {code}\nاین کد را در اختیار دیگران نگذارید.' },
  { id: 'otp-counter', label: 'تأیید خرید حضوری', group: 'counter', text: 'کد تأیید خرید حضوری شما در {brand}: {code}\nاین کد را فقط برای تأیید خرید اعلام کنید.' },
  { id: 'otp-repair', label: 'تأیید درخواست خدمات', group: 'repair', text: 'پیگیری {service} در {brand}\nکد تأیید: {code}\nاعتبار: ۲ دقیقه؛ کد را در اختیار دیگران نگذارید.' },
  { id: 'form-stage', label: 'پیگیری درخواست', event: 'FORM_STAGE', text: '{name} عزیز، وضعیت {form}: {stage}\n{message}\n{link}\n{brand}' },
  { id: 'store-receipt', label: 'فاکتور خرید', event: 'STORE_RECEIPT', text: '{name} عزیز، فاکتور خرید شما آماده است.\n{link}\n{brand}' },
  { id: 'pickup', label: 'آمادهٔ تحویل', event: 'STORE_PICKUP_READY', text: '{name} عزیز، سفارش شما آمادهٔ تحویل است.\n{link}\n{brand}' },
  { id: 'order', label: 'وضعیت سفارش', event: 'ORDER_STATUS', text: '{name} عزیز، {title}\n{body}\n{link}\n{brand}' },
  { id: 'payment', label: 'تأیید پرداخت', event: 'PAYMENT_PAID', text: '{name} عزیز، {title}\n{link}\n{brand}' },
  { id: 'delivered', label: 'تحویل محصول', event: 'PRODUCT_DELIVERED', text: '{name} عزیز، {body}\n{link}\n{brand}' },
  { id: 'ticket', label: 'پاسخ پشتیبانی', event: 'TICKET_REPLY', text: '{name} عزیز، پاسخ درخواست پشتیبانی شما آماده است.\n{link}\n{brand}' },
] as const

export function otpGroup(purpose: string): OtpGroup {
  if (purpose === 'VERIFY') return 'verify'
  if (purpose === 'RESET') return 'reset'
  if (/^COUNTER:[1-9]\d*:[1-9]\d*$/.test(purpose)) return 'counter'
  if (/^REPAIR:[1-9]\d*$/.test(purpose)) return 'repair'
  return 'login'
}
