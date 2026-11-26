import type { ShellGroup } from '@/components/shell/ShellNav'

export const cloudGroups: ShellGroup[] = [
  { id: 'overview', title: 'پیشخوان', icon: 'layout', flat: true, items: [{ href: '/cloud/dashboard', label: 'نمای کلی', icon: 'layout', exact: true }] },
  { id: 'services', caption: 'سرویس‌های ابری', title: 'سرویس‌های من', icon: 'server', items: [
    { href: '/cloud/dashboard/servers', label: 'سرورها', icon: 'server' },
    { href: '/cloud/dashboard/hosting', label: 'میزبانی', icon: 'database' },
    { href: '/cloud/dashboard/domains', label: 'دامنه‌ها', icon: 'globe' },
    { href: '/cloud/dashboard/new', label: 'سرویس جدید', icon: 'plus' },
  ] },
  { id: 'billing', caption: 'مالی و پشتیبانی', title: 'صورتحساب و سفارش', icon: 'receipt', items: [
    { href: '/cloud/dashboard/invoices', label: 'صورتحساب‌ها', icon: 'receipt' },
    { href: '/cloud/dashboard/orders', label: 'سفارش‌ها', icon: 'cart' },
    { href: '/dashboard/wallet', label: 'کیف پول', icon: 'wallet' },
  ] },
  { id: 'support', title: 'پشتیبانی', icon: 'ticket', flat: true, items: [{ href: '/cloud/dashboard/support', label: 'پشتیبانی', icon: 'ticket' }] },
  { id: 'account', caption: 'موبوکام', title: 'حساب کاربری', icon: 'user', flat: true, items: [{ href: '/dashboard', label: 'حساب کاربری', icon: 'user', exact: true }] },
  { id: 'public', title: 'بازگشت به ابر', icon: 'cloud', flat: true, items: [{ href: '/cloud', label: 'بازگشت به صفحه ابر', icon: 'cloud', exact: true }] },
]
