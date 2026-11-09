import { local as L, type SiteLink } from './types'

/** Editable site navigation; Hosting still owns availability, catalogues and orders. */
export const DEFAULT_CLOUD_NAVIGATION: SiteLink = {
  label: L('موبوکام کلاد', 'MoboCom Cloud'), href: '/cloud', icon: 'cloud', menuDisplay: 'mega', menuColumns: 3,
  description: L('میزبانی سایت، سرور و دامنه؛ انتخاب و مدیریت از یک حساب', 'Hosting, servers and domains, managed from one account'),
  children: [
    { label: L('هاست سایت', 'Web hosting'), href: '/hosting', icon: 'layers', description: L('پلن‌های میزبانی وب و کنترل‌پنل', 'Web hosting plans and control panels') },
    { label: L('سرور مجازی و ابری', 'Virtual and cloud servers'), href: '/servers', icon: 'server', description: L('بررسی سرورها، منابع و دوره‌های پرداخت', 'Compare servers, resources and billing cycles') },
    { label: L('ثبت و انتقال دامنه', 'Domain registration and transfer'), href: '/domains', icon: 'globe', description: L('جست‌وجو و سفارش دامنهٔ سایت', 'Search and order your domain') },
    { label: L('پنل موبوکام کلاد', 'Cloud dashboard'), href: '/dashboard/cloud', icon: 'cloud', description: L('سرویس‌ها، دامنه‌ها و تمدیدهای حساب شما', 'Your services, domains and renewals') },
    { label: L('ساخت سرویس تازه', 'Build a service'), href: '/dashboard/cloud/new', icon: 'plus', description: L('انتخاب سرویس و دیتاسنتر از داخل داشبورد', 'Choose a service and datacenter in your dashboard') },
    { label: L('پشتیبانی سرویس‌ها', 'Service support'), href: '/dashboard/tickets', icon: 'lifebuoy', description: L('ثبت درخواست و پیگیری پاسخ پشتیبانی', 'Open a ticket and follow up') },
  ],
}
