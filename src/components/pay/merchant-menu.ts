import type { ShellGroup } from '@/components/shell/ShellNav'

export const merchantGroups: ShellGroup[] = [
  { id: 'overview', title: 'پیشخوان پذیرنده', icon: 'layout', flat: true, items: [{ href: '/pay/merchant', label: 'نمای کلی', icon: 'layout', exact: true }] },
  { id: 'finance', caption: 'حساب پذیرندگی', title: 'دریافت و تسویه', icon: 'wallet', items: [
    { href: '/pay/merchant/payments', label: 'پرداخت‌ها', icon: 'receipt' },
    { href: '/pay/merchant/settlements', label: 'تسویه‌ها', icon: 'bank' },
    { href: '/pay/merchant/reports', label: 'گزارش‌های مالی', icon: 'chart' },
  ] },
  { id: 'business', title: 'کسب‌وکار و پایانه‌ها', icon: 'terminal', items: [
    { href: '/pay/merchant/terminals', label: 'پایانه‌ها', icon: 'terminal' },
    { href: '/pay/merchant/operations', label: 'عملیات ربات', icon: 'activity' },
  ] },
  { id: 'integration', caption: 'ابزارها و ارتباطات', title: 'اتصال سرویس‌ها', icon: 'code', items: [
    { href: '/pay/merchant/webhooks', label: 'وبهوک‌ها', icon: 'globe' },
    { href: '/pay/merchant/api', label: 'راهنمای API', icon: 'code' },
  ] },
  { id: 'support', title: 'تیکت و پشتیبانی', icon: 'ticket', flat: true, items: [{ href: '/pay/merchant/support', label: 'تیکت و پشتیبانی', icon: 'ticket' }] },
]
