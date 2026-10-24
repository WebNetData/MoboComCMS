'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields, inSection } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { SoftwareShell } from '../shared'

export default function AdminSoftwarePage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const fields: MediaField[] = [
    ...inSection(L('اطلاعات اصلی', 'Basics'), [
      { key: 'title', label: L('نام نرم‌افزار', 'Name'), required: true, table: true },
      { key: 'titleEn', label: L('نام انگلیسی (برای نشانی)', 'English name'), dir: 'ltr' },
      { key: 'version', label: L('نسخه', 'Version'), dir: 'ltr', placeholder: '2.4.1', table: true },
      { key: 'developer', label: L('سازنده', 'Developer') },
      { key: 'publisher', label: L('ناشر', 'Publisher') },
      { key: 'license', label: L('مجوز', 'License'), type: 'select', options: [
        { value: 'FREE', label: L('رایگان', 'Free') }, { value: 'FREEMIUM', label: L('رایگان با امکانات پولی', 'Freemium') },
        { value: 'TRIAL', label: L('آزمایشی', 'Trial') }, { value: 'PAID', label: L('پولی', 'Paid') }, { value: 'OPEN_SOURCE', label: L('متن‌باز', 'Open source') },
      ] },
      { key: 'platforms', label: L('پلتفرم‌ها (با ویرگول)', 'Platforms (comma separated)'), placeholder: 'Windows, macOS, Android', dir: 'ltr', table: true },
      { key: 'size', label: L('حجم', 'Size'), placeholder: '85 MB', dir: 'ltr' },
      { key: 'releasedAt', label: L('تاریخ انتشار نسخه', 'Version release date'), type: 'date' },
      { key: 'website', label: L('وب‌سایت سازنده', 'Developer website'), dir: 'ltr', wide: true },
    ]),
    ...inSection(L('دسته‌بندی', 'Categories'), [
      { key: 'terms', label: L('دسته‌بندی و زیردسته', 'Categories'), type: 'terms', taxonomy: 'software' },
      { key: 'category', label: L('برچسب دسته (قدیمی، برای جست‌وجو)', 'Legacy category label'), placeholder: L('امنیت، ابزار، گرافیک…', 'Security, Utilities…') },
    ]),
    ...inSection(L('آیکون و تصاویر', 'Icon & images'), [
      { key: 'icon', label: L('آیکون (مربعی)', 'Icon (square)'), type: 'image', frame: 'square', table: true },
      { key: 'cover', label: L('تصویر معرفی و اشتراک‌گذاری (افقی، اختیاری)', 'Showcase and share image (landscape, optional)'), type: 'image' },
      { key: 'screenshots', label: L('تصاویر صفحه (اسکرین‌شات)', 'Screenshots'), type: 'records', recordKeys: [{ key: 'src', label: L('نشانی تصویر', 'Image URL'), dir: 'ltr', wide: true }] },
    ]),
    ...inSection(L('معرفی', 'Description'), [
      { key: 'summary', label: L('خلاصه', 'Summary'), type: 'textarea', wide: true },
      { key: 'content', label: L('معرفی کامل', 'Description'), type: 'richtext', wide: true, upload: 'software' },
      { key: 'features', label: L('ویژگی‌های کلیدی', 'Key features'), type: 'richtext', wide: true, upload: 'software' },
      { key: 'changelog', label: L('تغییرات نسخه', 'Changelog'), type: 'richtext', wide: true, upload: 'software' },
    ]),
    ...inSection(L('نصب و پیش‌نیازها', 'Installation & requirements'), [
      { key: 'installGuide', label: L('راهنمای نصب', 'Installation guide'), type: 'richtext', wide: true, upload: 'software' },
      { key: 'requirements', label: L('پیش‌نیازها', 'Requirements'), type: 'textarea', wide: true },
    ]),
    ...inSection(L('فایل‌ها و دانلود', 'Files & downloads'), [
      { key: 'archivePassword', label: L('رمز فایل فشرده (اختیاری)', 'Archive password (optional)'), dir: 'ltr', placeholder: 'mobocom.ir' },
      { key: 'links', label: L('لینک‌های دانلود', 'Download links'), type: 'links', upload: 'software' },
    ]),
    ...inSection(L('انتشار و دسترسی', 'Publishing & access'), [access, status, featured, publishedAt, slug]),
  ]
  return <SoftwareShell><MediaCrud type="software" paywall={{ ownerType: 'software', noun: 'این نرم‌افزار' }} title={L('نرم‌افزارها', 'Software')} subtitle={L('نسخه، مجوز، پلتفرم، تصاویر، تغییرات و لینک دانلود.', 'Version, license, platforms, screenshots, changelog and VIP-aware downloads.')} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/software/${row.slug}` : null)} /></SoftwareShell>
}
