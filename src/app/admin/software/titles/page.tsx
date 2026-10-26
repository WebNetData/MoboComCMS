'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields, inSection } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { SoftwareShell } from '../shared'
import { useSectionLists } from '../../cms/useSectionLists'
import { platformFamilies } from '@/modules/software/domain/vocabulary'

export default function AdminSoftwarePage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  // The owner's lists (licence types, platforms with their family, app stores); inactive ones are listed for the
  // titles that already have them.
  const lists = useSectionLists('software', true)
  const option = (entry: { code: string; name: string; nameEn: string; icon: string; active: boolean }) => ({ value: entry.code, label: `${entry.icon ? `${entry.icon} ` : ''}${fa ? entry.name : entry.nameEn || entry.name}${entry.active ? '' : L(' (غیرفعال)', ' (inactive)')}` })
  const licenses = (lists.LICENSE || []).map(option)
  const platforms = (lists.PLATFORM || []).map(option)
  const stores = (lists.APP_STORE || []).map(option)
  // A title's platforms decide its own fields: a desktop program asks for requirements, an install guide and an
  // archive password; a mobile app for its package id, oldest system and app stores. Until a known platform is
  // chosen both are shown; a hidden field keeps its value.
  const families = (form: Record<string, unknown>) => platformFamilies(form.platforms, lists.PLATFORM || [])
  const undecided = (form: Record<string, unknown>) => !families(form).has('DESKTOP') && !families(form).has('MOBILE')
  const isDesktop = (form: Record<string, unknown>) => families(form).has('DESKTOP') || undecided(form)
  const isMobile = (form: Record<string, unknown>) => families(form).has('MOBILE') || undecided(form)
  const fields: MediaField[] = [
    ...inSection(L('اطلاعات اصلی', 'Basics'), [
      { key: 'title', label: L('نام نرم‌افزار', 'Name'), required: true, table: true },
      { key: 'titleEn', label: L('نام انگلیسی (برای نشانی)', 'English name'), dir: 'ltr' },
      { key: 'version', label: L('نسخه', 'Version'), dir: 'ltr', placeholder: '2.4.1', table: true },
      { key: 'license', label: L('مجوز', 'License'), type: 'select', options: licenses, hint: L('انواع مجوز را در زبانهٔ «فهرست‌ها» مدیریت کنید.', 'Manage licence types under Lists.') },
      { key: 'size', label: L('حجم', 'Size'), placeholder: '85 MB', dir: 'ltr' },
      { key: 'releasedAt', label: L('تاریخ انتشار نسخه', 'Version release date'), type: 'date' },
      { key: 'website', label: L('وب‌سایت سازنده', 'Developer website'), dir: 'ltr', wide: true },
    ]),
    ...inSection(L('سازنده و ناشر', 'Developer & publisher'), [
      { key: 'developer', label: L('سازنده', 'Developer'), type: 'studio', hint: L('از سازندگان ثبت‌شده انتخاب کنید تا صفحهٔ سازنده این نرم‌افزار را نشان دهد؛ نام تازه هنگام ذخیره ساخته می‌شود.', 'Pick a listed studio so its page lists this title; a new name is created on save.') },
      { key: 'publisher', label: L('ناشر', 'Publisher'), type: 'studio' },
    ]),
    ...inSection(L('پلتفرم‌ها', 'Platforms'), [
      { key: 'platforms', label: L('پلتفرم‌ها', 'Platforms'), type: 'chips', options: platforms, table: (row) => String(row.platforms || ''), hint: L('پلتفرم‌های دسکتاپ فیلدهای «سیستم مورد نیاز و نصب» و پلتفرم‌های موبایل فیلدهای «اپلیکیشن موبایل» را باز می‌کنند. پلتفرم‌ها و نوعشان را در زبانهٔ «فهرست‌ها» مدیریت کنید.', 'Desktop platforms open the requirements and install fields, mobile ones the mobile app fields. Manage platforms under Lists.') },
    ]),
    ...inSection(L('اپلیکیشن موبایل', 'Mobile app'), [
      { key: 'packageId', label: L('شناسهٔ بسته (Package / Bundle ID)', 'Package / bundle id'), dir: 'ltr', placeholder: 'com.example.app', when: isMobile },
      { key: 'minOs', label: L('حداقل نسخهٔ سیستم‌عامل', 'Minimum OS version'), dir: 'ltr', placeholder: 'Android 8.0', when: isMobile },
      { key: 'appStores', label: L('دریافت از فروشگاه‌ها', 'App store pages'), type: 'records', when: isMobile, recordKeys: [{ key: 'store', label: L('فروشگاه', 'Store'), options: stores }, { key: 'url', label: L('نشانی صفحهٔ اپ در فروشگاه', 'App page address'), dir: 'ltr', wide: true }], hint: L('فروشگاه‌ها را در زبانهٔ «فهرست‌ها» مدیریت کنید.', 'Manage app stores under Lists.') },
    ]),
    ...inSection(L('سیستم مورد نیاز و نصب', 'Requirements & installation'), [
      { key: 'requirements', label: L('سیستم مورد نیاز', 'System requirements'), type: 'textarea', wide: true, when: isDesktop },
      { key: 'installGuide', label: L('راهنمای نصب و فعال‌سازی', 'Installation guide'), type: 'richtext', wide: true, upload: 'software', when: isDesktop },
    ]),
    ...inSection(L('دسته‌بندی', 'Categories'), [
      { key: 'terms', label: L('دسته‌بندی و زیردسته', 'Categories'), type: 'terms', taxonomy: 'software' },
      { key: 'category', label: L('برچسب دسته در درخت پلتفرم‌ها', 'Category label in the platform tree'), placeholder: L('امنیت، ابزار، گرافیک…', 'Security, Utilities…'), hint: L('زیر هر پلتفرم در فهرست کناری بخش نرم‌افزار نمایش داده می‌شود.', 'Shown under each platform in the software sidebar.') },
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
    ...inSection(L('فایل‌ها و دانلود', 'Files & downloads'), [
      { key: 'archivePassword', label: L('رمز فایل فشرده (اختیاری)', 'Archive password (optional)'), dir: 'ltr', placeholder: 'mobocom.ir', when: isDesktop },
      { key: 'links', label: L('لینک‌های دانلود', 'Download links'), type: 'links', upload: 'software' },
    ]),
    ...inSection(L('انتشار و دسترسی', 'Publishing & access'), [access, status, featured, publishedAt, slug]),
  ]
  return <SoftwareShell><MediaCrud type="software" paywall={{ ownerType: 'software', noun: 'این نرم‌افزار' }} title={L('نرم‌افزارها', 'Software')} subtitle={L('نسخه، مجوز، سازنده، پلتفرم، فیلدهای دسکتاپ یا موبایل، تصاویر، تغییرات و لینک دانلود.', 'Version, license, studio, platforms, desktop or mobile fields, screenshots, changelog and downloads.')} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/software/${row.slug}` : null)} /></SoftwareShell>
}
