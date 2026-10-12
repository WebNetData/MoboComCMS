'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { SoftwareShell } from '../shared'

export default function AdminSoftwarePage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const fields: MediaField[] = [
    { key: 'title', label: fa ? 'نام نرم‌افزار' : 'Name', required: true, table: true },
    { key: 'titleEn', label: fa ? 'نام انگلیسی (برای نشانی)' : 'English name', dir: 'ltr' },
    { key: 'version', label: fa ? 'نسخه' : 'Version', dir: 'ltr', placeholder: '2.4.1', table: true },
    { key: 'developer', label: fa ? 'سازنده' : 'Developer' },
    { key: 'publisher', label: fa ? 'ناشر' : 'Publisher' },
    { key: 'license', label: fa ? 'مجوز' : 'License', type: 'select', options: [
      { value: 'FREE', label: fa ? 'رایگان' : 'Free' }, { value: 'FREEMIUM', label: fa ? 'رایگان با امکانات پولی' : 'Freemium' },
      { value: 'TRIAL', label: fa ? 'آزمایشی' : 'Trial' }, { value: 'PAID', label: fa ? 'پولی' : 'Paid' }, { value: 'OPEN_SOURCE', label: fa ? 'متن‌باز' : 'Open source' },
    ] },
    { key: 'platforms', label: fa ? 'پلتفرم‌ها (با ویرگول)' : 'Platforms (comma separated)', placeholder: 'Windows, macOS, Android', dir: 'ltr', table: true },
    { key: 'terms', label: fa ? 'دسته‌بندی و زیردسته' : 'Categories', type: 'terms', taxonomy: 'software' },
    { key: 'category', label: fa ? 'برچسب دسته (قدیمی، برای جست‌وجو)' : 'Legacy category label', placeholder: fa ? 'امنیت، ابزار، گرافیک…' : 'Security, Utilities…' },
    { key: 'size', label: fa ? 'حجم' : 'Size', placeholder: '85 MB', dir: 'ltr' },
    { key: 'releasedAt', label: fa ? 'تاریخ انتشار نسخه' : 'Version release date', type: 'date' },
    { key: 'website', label: fa ? 'وب‌سایت سازنده' : 'Developer website', dir: 'ltr', wide: true },
    { key: 'icon', label: fa ? 'آیکون (مربعی)' : 'Icon (square)', type: 'image', table: true },
    { key: 'cover', label: fa ? 'تصویر شاخص (اختیاری)' : 'Cover image (optional)', type: 'image' },
    { key: 'summary', label: fa ? 'خلاصه' : 'Summary', type: 'textarea' },
    { key: 'content', label: fa ? 'معرفی کامل (HTML مجاز)' : 'Description (HTML allowed)', type: 'textarea' },
    { key: 'features', label: fa ? 'ویژگی‌های کلیدی (HTML مجاز، مثلاً فهرست)' : 'Key features (HTML allowed)', type: 'textarea' },
    { key: 'changelog', label: fa ? 'تغییرات نسخه (HTML مجاز)' : 'Changelog (HTML allowed)', type: 'textarea' },
    { key: 'installGuide', label: fa ? 'راهنمای نصب (HTML مجاز)' : 'Installation guide (HTML allowed)', type: 'textarea' },
    { key: 'archivePassword', label: fa ? 'رمز فایل فشرده (اختیاری)' : 'Archive password (optional)', dir: 'ltr', placeholder: 'mobocom.ir' },
    { key: 'requirements', label: fa ? 'پیش‌نیازها' : 'Requirements', type: 'textarea' },
    { key: 'screenshots', label: fa ? 'تصاویر' : 'Screenshots', type: 'records', recordKeys: [{ key: 'src', label: fa ? 'نشانی تصویر' : 'Image URL', dir: 'ltr', wide: true }] },
    { key: 'links', label: fa ? 'لینک‌های دانلود' : 'Download links', type: 'links', upload: 'software' },
    access, status, featured, publishedAt, slug,
  ]
  return <SoftwareShell><MediaCrud type="software" paywall={{ ownerType: 'software', noun: 'این نرم‌افزار' }} title={fa ? 'نرم‌افزارها' : 'Software'} subtitle={fa ? 'نسخه، مجوز، پلتفرم، تصاویر، تغییرات و لینک دانلود.' : 'Version, license, platforms, screenshots, changelog and VIP-aware downloads.'} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/software/${row.slug}` : null)} /></SoftwareShell>
}
