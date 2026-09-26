'use client'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'

export default function SiteManagementPage() {
  const { locale } = useI18n()
  const L = (fa: string, en: string) => locale === 'fa' ? fa : en
  const items = [
    ['/admin/theme-builder', 'sparkles', L('سازندهٔ قالب سایت', 'Theme builder'), L('هدر و فوتر اختصاصی، صفحه‌های کامل، بخش‌ها با آدرس کوتاه (مثل ‎/gaming) و قالب‌های پست و محصول با شرط نمایش.', 'Custom headers & footers, full pages, short-URL sections (e.g. /gaming) and post/product layouts with display rules.')],
    ['/admin/studio?tab=content', 'grid', L('صفحهٔ اصلی', 'Homepage'), L('عنوان‌ها، متن‌ها، تصویر اصلی، دکمه‌ها، ترتیب و نمایش بخش‌ها، برنامه‌ها و پرسش‌های متداول.', 'Headings, copy, hero image, buttons, section order and visibility, downloads and FAQs.')],
    ['/admin/builder/home', 'grid', L('صفحه‌ساز صفحه اصلی', 'Home page builder'), L('چیدمان بصری صفحه اصلی با بلوک‌ها و قالب‌های آماده؛ در صورت استفاده، جایگزین بخش‌های پیش‌فرض می‌شود.', 'Visually compose the homepage with blocks and prebuilt templates — takes over the default sections once you save.')],
    ['/admin/builder/blog', 'sliders', L('صفحه‌ساز مجله (وبلاگ)', 'Journal (blog) builder'), L('چیدمان صفحهٔ اصلی وبلاگ با پیش‌نمایش زنده؛ جست‌وجو و دسته‌بندی‌ها پابرجا می‌مانند.', 'Design the blog landing page with a live preview — search and category browsing stay intact.')],
    ['/admin/studio?tab=design', 'globe', L('طراحی و ظاهر سایت', 'Design & appearance'), L('رنگ‌های تیره و روشن، فونت، گِردی، لوگو، منوی بالا، فوتر و CSS سفارشی با پیش‌نمایش زنده.', 'Dark and light colors, fonts, radius, logo, header menu, footer and custom CSS with a live preview.')],
    ['/admin/studio?tab=themes', 'sliders', L('قالب‌ها', 'Themes'), L('انتخاب قالب فعال، نصب Design Theme از فایل JSON و مشاهدهٔ قالب‌های نصب‌شده.', 'Pick the active theme, install design themes from JSON files and review installed themes.')],
    ['/admin/pages', 'grid', L('صفحه‌های سایت', 'Site pages'), L('ایجاد و ویرایش صفحه، تصویر شاخص، متن فارسی و انگلیسی و چیدمان محتوا.', 'Create pages and manage featured images, bilingual content and layout.')],
    ['/admin/posts', 'sliders', L('نوشته‌ها و مجله', 'Articles & journal'), L('متن نوشته‌ها، تصویر کاور، دسته‌بندی و وضعیت انتشار.', 'Article content, covers, categories and publication status.')],
    ['/admin/plans', 'wallet', L('پلن‌ها و قیمت‌ها', 'Plans & pricing'), L('قیمت، حجم، مدت، تعداد دستگاه و پلن‌های قابل نمایش.', 'Prices, traffic allowances, durations, devices and plan availability.')],
    ['/admin/locations', 'globe', L('شبکهٔ سرورها', 'Server network'), L('کشورها، شهرها و موقعیت‌هایی که روی نقشه نمایش داده می‌شوند.', 'Countries, cities and locations displayed on the map.')],
    ['/admin/forms', 'chat', L('فرم‌ها و پاسخ‌ها', 'Forms & submissions'), L('ساخت فرم، اتصال به صفحه‌ها و بررسی پاسخ‌ها.', 'Build forms, attach them to pages and review submissions.')],
    ['/admin/settings', 'sliders', L('امکانات و تنظیمات عمومی', 'Features & settings'), L('فعال‌سازی فروشگاه و API، اطلاعات پشتیبانی و تنظیمات موتور جست‌وجو.', 'Storefront and API availability, support details and SEO settings.')],
  ]
  return <div><h1 className="h2 mb-4">{L('مرکز مدیریت وب‌سایت', 'Website management')}</h1><p className="muted mb-6">{L('بخش موردنظر را انتخاب کنید؛ تغییرات محتوایی و ظاهری سایت از اینجا در دسترس‌اند.', 'Choose the part of your website you want to update.')}</p><div className="admin-management-grid">{items.map(([href, icon, title, text]) => <Link className="card" href={href} key={href}><Icon name={icon} size={25}/><h2>{title}</h2><p>{text}</p><span className="text-link">{L('مدیریت این بخش ←', 'Manage section →')}</span></Link>)}</div></div>
}
