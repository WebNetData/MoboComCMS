import type { ShellGroup } from '@/components/shell/ShellNav'

export const cloudDashboardPath = '/cloud/dashboard'

export const cloudGroups: ShellGroup[] = [
  { id: 'overview', title: 'پیشخوان', icon: 'layout', flat: true, items: [{ href: cloudDashboardPath, label: 'نمای کلی', icon: 'layout', exact: true }] },
  { id: 'services', caption: 'زیرساخت', title: 'سرویس‌های ابری', icon: 'server', items: [
    { href: '/cloud/dashboard/services', label: 'همهٔ سرویس‌ها', icon: 'layers' },
    { href: '/cloud/dashboard/servers', label: 'سرورها', icon: 'server' },
    { href: '/cloud/dashboard/hosting', label: 'میزبانی', icon: 'database' },
    { href: '/cloud/dashboard/domains', label: 'دامنه‌ها', icon: 'globe' },
    { href: '/cloud/dashboard/new', label: 'سرویس جدید', icon: 'plus' },
  ] },
  { id: 'wallet', caption: 'مالی', title: 'کیف پول', icon: 'wallet', flat: true, items: [{ href: '/cloud/dashboard/wallet', label: 'کیف پول', icon: 'wallet' }] },
  { id: 'billing', title: 'صورتحساب و سفارش', icon: 'receipt', items: [
    { href: '/cloud/dashboard/invoices', label: 'صورتحساب‌ها', icon: 'receipt' },
    { href: '/cloud/dashboard/orders', label: 'سفارش‌ها', icon: 'cart' },
  ] },
  { id: 'support', caption: 'پشتیبانی و حساب', title: 'تیکت‌های پشتیبانی', icon: 'ticket', flat: true, items: [{ href: '/cloud/dashboard/support', label: 'تیکت‌های پشتیبانی', icon: 'ticket' }] },
  { id: 'account', title: 'تنظیمات حساب', icon: 'user', flat: true, items: [{ href: '/cloud/dashboard/account', label: 'تنظیمات حساب', icon: 'user' }] },
]

export function cloudMenuMatch(path: string, href: string, exact?: boolean) {
  return path === href || (!exact && path.startsWith(href + '/'))
}

export function cloudMenuLabel(path: string) {
  if (path === '/cloud/dashboard/payment/result') return 'نتیجهٔ پرداخت'
  return cloudGroups.flatMap(group => group.items).find(item => cloudMenuMatch(path, item.href, item.exact))?.label || 'نمای کلی'
}
