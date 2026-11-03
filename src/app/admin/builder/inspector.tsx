'use client'

import { useEffect, useState } from 'react'
import { BOX_ICONS, WIDGET_LABELS, type BuilderDoc, type BuilderWidget, type WidgetType } from '@/modules/site/domain/builder'
import {
  addColumn, applyWidgetStyle, equalizeColumns, getSection, getWidget, nudgeSection, nudgeWidget,
  patchColumn, patchSection, patchSectionStyle, patchWidget, removeColumn, type Sel, type WidgetRef, patchAdvanced } from './state'
import CoverField from '@/app/admin/cms/CoverField'
import AdvancedStyleFields from './advanced-style'

type Field = {
  key: string
  en: string
  fa: string
  kind: 'text' | 'area' | 'rich' | 'url' | 'image' | 'select' | 'items' | 'toggle' | 'template' | 'post-category' | 'product-category'
  hint?: [string, string]
  ltr?: boolean
  rows?: number
  options?: { value: string; en: string; fa: string }[]
}

const limitOptions = [{ value: '2', en: '2 items', fa: '۲ مورد' }, { value: '3', en: '3 items', fa: '۳ مورد' }, { value: '4', en: '4 items', fa: '۴ مورد' }, { value: '6', en: '6 items', fa: '۶ مورد' }]
const feedLimits = [...limitOptions, { value: '8', en: '8 items', fa: '۸ مورد' }, { value: '9', en: '9 items', fa: '۹ مورد' }, { value: '12', en: '12 items', fa: '۱۲ مورد' }]

const FIELDS: Partial<Record<WidgetType, Field[]>> = {
  'icon-box': [
    { key: 'icon', en: 'Icon', fa: 'آیکن', kind: 'select', options: BOX_ICONS.map((name) => ({ value: name, en: name, fa: name })) },
    { key: 'layout', en: 'Layout', fa: 'چیدمان', kind: 'select', options: [{ value: 'top', en: 'Icon on top', fa: 'آیکن بالا' }, { value: 'side', en: 'Icon at the side', fa: 'آیکن کنار' }] },
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 3 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 3, ltr: true },
    { key: 'href', en: 'Link (optional)', fa: 'پیوند (اختیاری)', kind: 'url', ltr: true },
  ],
  tabs: [{ key: 'items', en: 'Tabs', fa: 'تب‌ها', kind: 'items' }],
  testimonials: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'items', en: 'Testimonials', fa: 'نظرها', kind: 'items' },
  ],
  counters: [{ key: 'items', en: 'Counters', fa: 'شمارنده‌ها', kind: 'items' }],
  gallery: [
    { key: 'columns', en: 'Columns', fa: 'ستون‌ها', kind: 'select', options: ['2', '3', '4', '5'].map((value) => ({ value, en: value, fa: value })) },
    { key: 'items', en: 'Pictures', fa: 'تصویرها', kind: 'items' },
  ],
  carousel: [{ key: 'items', en: 'Slides', fa: 'اسلایدها', kind: 'items' }],
  slides: [
    { key: 'height', en: 'Height', fa: 'ارتفاع', kind: 'select', options: [{ value: 'sm', en: 'Short', fa: 'کوتاه' }, { value: 'md', en: 'Medium', fa: 'متوسط' }, { value: 'lg', en: 'Tall', fa: 'بلند' }, { value: 'full', en: 'Full screen', fa: 'تمام‌صفحه' }] },
    { key: 'effect', en: 'Transition', fa: 'جلوهٔ گذار', kind: 'select', options: [{ value: 'slide', en: 'Slide', fa: 'کشویی' }, { value: 'fade', en: 'Fade', fa: 'محو' }, { value: 'zoom', en: 'Fade with slow zoom', fa: 'محو با زوم آرام' }] },
    { key: 'autoplay', en: 'Autoplay', fa: 'پخش خودکار', kind: 'select', options: [{ value: '0', en: 'Off', fa: 'خاموش' }, { value: '4', en: 'Every 4 s', fa: 'هر ۴ ثانیه' }, { value: '6', en: 'Every 6 s', fa: 'هر ۶ ثانیه' }, { value: '8', en: 'Every 8 s', fa: 'هر ۸ ثانیه' }, { value: '10', en: 'Every 10 s', fa: 'هر ۱۰ ثانیه' }] },
    { key: 'overlay', en: 'Shade over the picture', fa: 'سایهٔ روی تصویر', kind: 'select', options: [{ value: 'none', en: 'None', fa: 'بدون' }, { value: 'soft', en: 'Soft', fa: 'ملایم' }, { value: 'strong', en: 'Strong', fa: 'پررنگ' }, { value: 'brand', en: 'Brand colour', fa: 'رنگ برند' }] },
    { key: 'align', en: 'Text position', fa: 'جای متن', kind: 'select', options: [{ value: 'start', en: 'Start', fa: 'ابتدا' }, { value: 'center', en: 'Centre', fa: 'وسط' }, { value: 'end', en: 'End', fa: 'انتها' }] },
    { key: 'items', en: 'Slides', fa: 'اسلایدها', kind: 'items' },
  ],
  pricing: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'items', en: 'Plans', fa: 'پلن‌ها', kind: 'items' },
  ],
  countdown: [
    { key: 'until', en: 'Date and time (e.g. 2027-03-20T20:00)', fa: 'تاریخ و ساعت (مثلاً 2027-03-20T20:00)', kind: 'text', ltr: true },
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'done', en: 'Text when it is over (FA)', fa: 'متن پس از پایان (فا)', kind: 'text' },
    { key: 'doneEn', en: 'Text when it is over (EN)', fa: 'متن پس از پایان (EN)', kind: 'text', ltr: true },
  ],
  social: [{ key: 'items', en: 'Links', fa: 'پیوندها', kind: 'items' }],
  progress: [{ key: 'items', en: 'Bars', fa: 'نوارها', kind: 'items' }],
  heading: [
    { key: 'level', en: 'Level', fa: 'سطح', kind: 'select', options: [{ value: 'h1', en: 'H1', fa: 'H1' }, { value: 'h2', en: 'H2', fa: 'H2' }, { value: 'h3', en: 'H3', fa: 'H3' }, { value: 'h4', en: 'H4', fa: 'H4' }, { value: 'p', en: 'Paragraph', fa: 'پاراگراف' }] },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'text' },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'text', ltr: true },
  ],
  text: [
    { key: 'html', en: 'HTML (FA)', fa: 'HTML (فا)', kind: 'rich', rows: 8 },
    { key: 'htmlEn', en: 'HTML (EN)', fa: 'HTML (EN)', kind: 'rich', rows: 8, ltr: true },
  ],
  image: [
    { key: 'src', en: 'Image', fa: 'تصویر', kind: 'image' },
    { key: 'alt', en: 'Alt text', fa: 'متن جایگزین', kind: 'text' },
    { key: 'href', en: 'Link', fa: 'پیوند', kind: 'url', ltr: true },
    { key: 'label', en: 'Link text (FA)', fa: 'متن دکمه (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Link text (EN)', fa: 'متن دکمه (EN)', kind: 'text', ltr: true },
  ],
  button: [
    { key: 'label', en: 'Label (FA)', fa: 'متن (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Label (EN)', fa: 'متن (EN)', kind: 'text', ltr: true },
    { key: 'href', en: 'URL', fa: 'نشانی', kind: 'url', ltr: true },
    { key: 'variant', en: 'Variant', fa: 'ظاهر', kind: 'select', options: [{ value: 'primary', en: 'Primary', fa: 'اصلی' }, { value: 'ghost', en: 'Ghost', fa: 'ساده' }, { value: 'link', en: 'Text link', fa: 'پیوند متنی' }] },
    { key: 'secondaryLabel', en: 'Second label (FA)', fa: 'دکمه دوم (فا)', kind: 'text' },
    { key: 'secondaryLabelEn', en: 'Second label (EN)', fa: 'دکمه دوم (EN)', kind: 'text', ltr: true },
    { key: 'secondaryHref', en: 'Second URL', fa: 'نشانی دوم', kind: 'url', ltr: true },
  ],
  divider: [],
  spacer: [],
  video: [
    { key: 'url', en: 'Video URL', fa: 'نشانی ویدیو', kind: 'url', ltr: true, hint: ['YouTube, Aparat and Vimeo links are converted to their player automatically.', 'لینک یوتیوب، آپارات و ویمئو خودکار به پخش‌کننده تبدیل می‌شود.'] },
    { key: 'title', en: 'Title', fa: 'عنوان', kind: 'text' },
  ],
  stats: [{ key: 'items', en: 'Items', fa: 'موارد', kind: 'items' }],
  list: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'items', en: 'Cards', fa: 'کارت‌ها', kind: 'items' },
  ],
  faq: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'items', en: 'Questions', fa: 'پرسش‌ها', kind: 'items' },
  ],
  html: [
    { key: 'advanced', en: 'Advanced mode — allow JavaScript (site admins only)', fa: 'حالت پیشرفته — اجازه جاوااسکریپت (فقط مدیر کل سایت)', kind: 'toggle' },
    { key: 'html', en: 'HTML', fa: 'HTML', kind: 'rich', rows: 8, ltr: true },
    { key: 'css', en: 'CSS', fa: 'CSS', kind: 'rich', rows: 6, ltr: true },
    { key: 'js', en: 'JavaScript (advanced mode only)', fa: 'جاوااسکریپت (فقط حالت پیشرفته)', kind: 'rich', rows: 6, ltr: true },
  ],
  template: [{ key: 'templateId', en: 'Template', fa: 'قالب', kind: 'template', hint: ['Edits to the saved template appear everywhere it is used.', 'تغییر قالب ذخیره‌شده در همه جاهایی که استفاده شده اعمال می‌شود.'] }],
  hero: [
    { key: 'eyebrow', en: 'Eyebrow (FA)', fa: 'بالاتیتر (فا)', kind: 'text' },
    { key: 'eyebrowEn', en: 'Eyebrow (EN)', fa: 'بالاتیتر (EN)', kind: 'text', ltr: true },
    { key: 'title', en: 'Title (FA)', fa: 'تیتر (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'تیتر (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 3 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 3, ltr: true },
    { key: 'src', en: 'Image', fa: 'تصویر', kind: 'image' },
    { key: 'alt', en: 'Image alt text', fa: 'متن جایگزین تصویر', kind: 'text' },
    { key: 'label', en: 'Primary button (FA)', fa: 'دکمه اصلی (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Primary button (EN)', fa: 'دکمه اصلی (EN)', kind: 'text', ltr: true },
    { key: 'href', en: 'Primary URL', fa: 'نشانی دکمه', kind: 'url', ltr: true },
    { key: 'secondaryLabel', en: 'Second button (FA)', fa: 'دکمه دوم (فا)', kind: 'text' },
    { key: 'secondaryLabelEn', en: 'Second button (EN)', fa: 'دکمه دوم (EN)', kind: 'text', ltr: true },
    { key: 'secondaryHref', en: 'Second URL', fa: 'نشانی دوم', kind: 'url', ltr: true },
  ],
  cta: [
    { key: 'title', en: 'Title (FA)', fa: 'تیتر (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'تیتر (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 3 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 3, ltr: true },
    { key: 'label', en: 'Button (FA)', fa: 'دکمه (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Button (EN)', fa: 'دکمه (EN)', kind: 'text', ltr: true },
    { key: 'href', en: 'Button URL', fa: 'نشانی دکمه', kind: 'url', ltr: true },
  ],
  plans: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'limit', en: 'Max plans', fa: 'حداکثر پلن', kind: 'select', options: limitOptions },
  ],
  posts: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'category', en: 'Category', fa: 'دسته‌بندی', kind: 'post-category', hint: ['“This section / post” follows the section or article the block is shown on.', '«همین بخش / همین پست» مطابق بخش یا مقاله‌ای که بلوک در آن نمایش داده می‌شود عمل می‌کند.'] },
    { key: 'limit', en: 'Max posts', fa: 'حداکثر مطلب', kind: 'select', options: feedLimits },
  ],
  products: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'category', en: 'Category', fa: 'دسته‌بندی', kind: 'product-category' },
    { key: 'kind', en: 'Product kind', fa: 'نوع محصول', kind: 'select', options: [{ value: '', en: 'All products', fa: 'همه' }, { value: 'VIRTUAL', en: 'Digital only', fa: 'فقط مجازی' }, { value: 'PHYSICAL', en: 'Physical only', fa: 'فقط فیزیکی' }] },
    { key: 'limit', en: 'Max products', fa: 'حداکثر محصول', kind: 'select', options: feedLimits },
  ],
  network: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 3 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 3, ltr: true },
  ],
  form: [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'slug', en: 'Form ID (slug)', fa: 'شناسه فرم', kind: 'text', ltr: true, hint: ['Slug of a published form (Forms & submissions). Empty = the first published form.', 'شناسهٔ یک فرم منتشرشده از بخش «فرم‌ها». خالی = اولین فرم منتشرشده.'] },
  ],
  media: [
    { key: 'source', en: 'Feed', fa: 'فهرست', kind: 'select', options: [
      { value: 'music-new', en: 'Music · new songs', fa: 'موزیک · جدیدترین آهنگ‌ها' },
      { value: 'music-top', en: 'Music · top chart', fa: 'موزیک · پربازدیدترین‌ها' },
      { value: 'music-albums', en: 'Music · albums', fa: 'موزیک · آلبوم‌ها' },
      { value: 'cinema-movies', en: 'Cinema · new movies', fa: 'سینما · فیلم‌های جدید' },
      { value: 'cinema-series', en: 'Cinema · new series', fa: 'سینما · سریال‌های جدید' },
      { value: 'cinema-top', en: 'Cinema · top IMDb', fa: 'سینما · برترین IMDb' },
      { value: 'cinema-dubbed', en: 'Cinema · Persian dub', fa: 'سینما · دوبله فارسی' },
      { value: 'cinema-vip', en: 'Cinema · VIP only', fa: 'سینما · ویژه VIP' },
      { value: 'games-new', en: 'Games · latest', fa: 'بازی · تازه‌ها' },
      { value: 'games-top', en: 'Games · top rated', fa: 'بازی · برترین‌ها' },
    ] },
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'limit', en: 'Max items', fa: 'حداکثر مورد', kind: 'select', options: [{ value: '4', en: '4 items', fa: '۴ مورد' }, { value: '6', en: '6 items', fa: '۶ مورد' }, { value: '8', en: '8 items', fa: '۸ مورد' }, { value: '10', en: '10 items', fa: '۱۰ مورد' }, { value: '12', en: '12 items', fa: '۱۲ مورد' }, { value: '16', en: '16 items', fa: '۱۶ مورد' }] },
  ],
  'vip-cta': [
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text', hint: ['Empty = default copy. Hidden automatically when the VIP module is off.', 'خالی = متن پیش‌فرض. اگر ماژول VIP خاموش باشد خودکار پنهان می‌شود.'] },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 2 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 2, ltr: true },
    { key: 'label', en: 'Button (FA)', fa: 'دکمه (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Button (EN)', fa: 'دکمه (EN)', kind: 'text', ltr: true },
  ],
}

const ITEM_KEYS: Record<string, Field[]> = {
  tabs: [
    { key: 'title', en: 'Tab (FA)', fa: 'تب (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Tab (EN)', fa: 'تب (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 3 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 3, ltr: true },
  ],
  testimonials: [
    { key: 'quote', en: 'Quote (FA)', fa: 'متن نظر (فا)', kind: 'area', rows: 3 },
    { key: 'quoteEn', en: 'Quote (EN)', fa: 'متن نظر (EN)', kind: 'area', rows: 3, ltr: true },
    { key: 'name', en: 'Name', fa: 'نام', kind: 'text' },
    { key: 'role', en: 'Role (FA)', fa: 'سمت (فا)', kind: 'text' },
    { key: 'roleEn', en: 'Role (EN)', fa: 'سمت (EN)', kind: 'text', ltr: true },
    { key: 'avatar', en: 'Picture address (optional)', fa: 'نشانی عکس (اختیاری)', kind: 'text', ltr: true },
  ],
  counters: [
    { key: 'value', en: 'Number', fa: 'عدد', kind: 'text', ltr: true },
    { key: 'suffix', en: 'Suffix (+, %, k)', fa: 'پسوند (+، ٪، k)', kind: 'text' },
    { key: 'label', en: 'Label (FA)', fa: 'برچسب (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Label (EN)', fa: 'برچسب (EN)', kind: 'text', ltr: true },
  ],
  gallery: [
    { key: 'src', en: 'Picture address', fa: 'نشانی تصویر', kind: 'text', ltr: true },
    { key: 'alt', en: 'Alternative text', fa: 'متن جایگزین', kind: 'text' },
  ],
  slides: [
    { key: 'src', en: 'Background picture address', fa: 'نشانی تصویر پس‌زمینه', kind: 'text', ltr: true },
    { key: 'eyebrow', en: 'Eyebrow', fa: 'روتیتر', kind: 'text' },
    { key: 'title', en: 'Title', fa: 'تیتر', kind: 'text' },
    { key: 'text', en: 'Text', fa: 'متن', kind: 'area', rows: 2 },
    { key: 'label', en: 'Button', fa: 'دکمه', kind: 'text' },
    { key: 'href', en: 'Button link', fa: 'پیوند دکمه', kind: 'text', ltr: true },
    { key: 'label2', en: 'Second button', fa: 'دکمهٔ دوم', kind: 'text' },
    { key: 'href2', en: 'Second button link', fa: 'پیوند دکمهٔ دوم', kind: 'text', ltr: true },
  ],
  carousel: [
    { key: 'src', en: 'Picture address', fa: 'نشانی تصویر', kind: 'text', ltr: true },
    { key: 'alt', en: 'Alternative text', fa: 'متن جایگزین', kind: 'text' },
    { key: 'title', en: 'Caption (FA)', fa: 'زیرنویس (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Caption (EN)', fa: 'زیرنویس (EN)', kind: 'text', ltr: true },
    { key: 'href', en: 'Link (optional)', fa: 'پیوند (اختیاری)', kind: 'text', ltr: true },
  ],
  pricing: [
    { key: 'title', en: 'Plan (FA)', fa: 'نام پلن (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Plan (EN)', fa: 'نام پلن (EN)', kind: 'text', ltr: true },
    { key: 'price', en: 'Price (FA)', fa: 'قیمت (فا)', kind: 'text' },
    { key: 'priceEn', en: 'Price (EN)', fa: 'قیمت (EN)', kind: 'text', ltr: true },
    { key: 'period', en: 'Period (FA)', fa: 'دوره (فا)', kind: 'text' },
    { key: 'periodEn', en: 'Period (EN)', fa: 'دوره (EN)', kind: 'text', ltr: true },
    { key: 'features', en: 'Features (one per line) (FA)', fa: 'ویژگی‌ها (هر خط یکی) (فا)', kind: 'area', rows: 4 },
    { key: 'featuresEn', en: 'Features (one per line) (EN)', fa: 'ویژگی‌ها (هر خط یکی) (EN)', kind: 'area', rows: 4, ltr: true },
    { key: 'label', en: 'Button (FA)', fa: 'دکمه (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Button (EN)', fa: 'دکمه (EN)', kind: 'text', ltr: true },
    { key: 'href', en: 'Button link', fa: 'پیوند دکمه', kind: 'text', ltr: true },
    { key: 'featured', en: 'Highlight (write 1)', fa: 'برجسته (۱ بنویسید)', kind: 'text', ltr: true },
  ],
  social: [
    { key: 'network', en: 'Network (telegram, instagram, x, youtube, aparat, linkedin, whatsapp, github, email, website)', fa: 'شبکه (telegram، instagram، x، youtube، aparat، linkedin، whatsapp، github، email، website)', kind: 'text', ltr: true },
    { key: 'href', en: 'Address', fa: 'نشانی', kind: 'text', ltr: true },
  ],
  progress: [
    { key: 'label', en: 'Label (FA)', fa: 'برچسب (فا)', kind: 'text' },
    { key: 'labelEn', en: 'Label (EN)', fa: 'برچسب (EN)', kind: 'text', ltr: true },
    { key: 'value', en: 'Percent (0–100)', fa: 'درصد (۰ تا ۱۰۰)', kind: 'text', ltr: true },
  ],
  stats: [{ key: 'value', en: 'Value', fa: 'مقدار', kind: 'text' }, { key: 'label', en: 'Label (FA)', fa: 'برچسب (فا)', kind: 'text' }, { key: 'labelEn', en: 'Label (EN)', fa: 'برچسب (EN)', kind: 'text', ltr: true }],
  list: [
    { key: 'icon', en: 'Icon / emoji', fa: 'آیکون / ایموجی', kind: 'text', ltr: true },
    { key: 'title', en: 'Title (FA)', fa: 'عنوان (فا)', kind: 'text' },
    { key: 'titleEn', en: 'Title (EN)', fa: 'عنوان (EN)', kind: 'text', ltr: true },
    { key: 'text', en: 'Text (FA)', fa: 'متن (فا)', kind: 'area', rows: 2 },
    { key: 'textEn', en: 'Text (EN)', fa: 'متن (EN)', kind: 'area', rows: 2, ltr: true },
  ],
  faq: [
    { key: 'q', en: 'Question (FA)', fa: 'پرسش (فا)', kind: 'text' },
    { key: 'qEn', en: 'Question (EN)', fa: 'پرسش (EN)', kind: 'text', ltr: true },
    { key: 'a', en: 'Answer (FA)', fa: 'پاسخ (فا)', kind: 'area', rows: 2 },
    { key: 'aEn', en: 'Answer (EN)', fa: 'پاسخ (EN)', kind: 'area', rows: 2, ltr: true },
  ],
}

type L = (en: string, fa: string) => string

function Row({ label, children, ltr }: { label: string; children: React.ReactNode; ltr?: boolean }) {
  return <label className="bld-field"><span>{label}</span><div dir={ltr ? 'ltr' : undefined}>{children}</div></label>
}

function ItemsField({ value, onChange, widgetType, L }: { value: string; onChange: (next: string) => void; widgetType: WidgetType; L: L }) {
  let items: Record<string, string>[] = []
  let broken = false
  try {
    const parsed = JSON.parse(value || '[]')
    if (Array.isArray(parsed)) items = parsed.map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, string>) : {}))
    else broken = true
  } catch { broken = true }
  const keys = ITEM_KEYS[widgetType] || ITEM_KEYS.list
  const emit = (next: Record<string, string>[]) => onChange(JSON.stringify(next))
  if (broken) {
    return <label className="bld-field is-error"><span>{L('Items (JSON array)', 'موارد (آرایه JSON)')}</span>
      <textarea className="textarea bld-json" dir="ltr" rows={6} value={value} onChange={(event) => onChange(event.target.value)} />
      <small>{L('Invalid JSON — fix it or click reset.', 'JSON نامعتبر است — اصلاح کنید یا بازنشانی کنید.')}</small>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => emit([{}])}>{L('Reset', 'بازنشانی')}</button>
    </label>
  }
  return <div className="bld-items">
    <div className="bld-items-head"><span>{L('Items', 'موارد')}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => emit([...items, Object.fromEntries(keys.map((key) => [key.key, '']))])}>＋ {L('Add', 'افزودن')}</button></div>
    {items.length === 0 && <p className="muted text-sm">{L('No items yet.', 'هنوز موردی نیست.')}</p>}
    {items.map((item, index) => <div className="bld-item" key={index}>
      <div className="bld-item-head">
        <b>#{index + 1}</b>
        <div>
          <button type="button" aria-label={L('Move up', 'بالا')} disabled={index === 0} onClick={() => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; emit(next) }}>↑</button>
          <button type="button" aria-label={L('Move down', 'پایین')} disabled={index === items.length - 1} onClick={() => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; emit(next) }}>↓</button>
          <button type="button" aria-label={L('Delete', 'حذف')} onClick={() => emit(items.filter((_, i) => i !== index))}>×</button>
        </div>
      </div>
      {keys.map((key) => key.kind === 'area'
        ? <label key={key.key} className="bld-item-row"><span>{L(key.en, key.fa)}</span><textarea dir={key.ltr ? 'ltr' : undefined} rows={key.rows || 2} value={item[key.key] || ''} onChange={(event) => emit(items.map((entry, i) => (i === index ? { ...entry, [key.key]: event.target.value } : entry)))} /></label>
        : <label key={key.key} className="bld-item-row"><span>{L(key.en, key.fa)}</span><input className="input" dir={key.ltr ? 'ltr' : undefined} value={item[key.key] || ''} onChange={(event) => emit(items.map((entry, i) => (i === index ? { ...entry, [key.key]: event.target.value } : entry)))} /></label>)}
    </div>)}
  </div>
}

type TemplateOption = { id: string; label: string }
type CategoryRow = { id: number; name: string; nameEn: string; slug: string }

let catalogCache: Promise<{ post: CategoryRow[]; product: CategoryRow[] }> | null = null
function loadCatalog() {
  catalogCache ||= fetch('/api/admin/theme-templates', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => ({ post: data?.postCategories || [], product: data?.productCategories || [] }))
    .catch(() => ({ post: [], product: [] }))
  return catalogCache
}

function CategoryPicker({ source, value, L, onChange }: { source: 'post' | 'product'; value: string; L: L; onChange: (next: string) => void }) {
  const [rows, setRows] = useState<CategoryRow[] | null>(null)
  useEffect(() => { let alive = true; void loadCatalog().then((data) => { if (alive) setRows(data[source]) }); return () => { alive = false } }, [source])
  const known = !value || value.startsWith('@') || !rows || rows.some((row) => row.slug === value)
  return <select aria-label={L('Item', 'انتخاب مورد')} className="select" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">{source === 'post' ? L('Latest from all categories', 'آخرین‌ها از همه دسته‌ها') : L('All categories', 'همه دسته‌ها')}</option>
    <option value="@section">{source === 'post' ? L('This section / post category', 'همین بخش / دستهٔ همین پست') : L('This section / product category', 'همین بخش / دستهٔ همین محصول')}</option>
    {!known && <option value={value}>{value}</option>}
    {(rows || []).map((row) => <option key={row.id} value={row.slug}>{L(row.nameEn || row.name, row.name)}</option>)}
  </select>
}

function TemplatePicker({ pageId, value, L, onChange }: { pageId: string; value: string; L: L; onChange: (next: string) => void }) {
  const [options, setOptions] = useState<{ bundled: TemplateOption[]; mine: TemplateOption[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetch(`/api/admin/builder/templates?pageId=${encodeURIComponent(pageId)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setOptions({
          bundled: (data.bundled || []).map((entry: { id: string; fa: string; en: string }) => ({ id: entry.id, label: L(entry.en, entry.fa) })),
          mine: (data.mine || []).filter((entry: { kind?: string }) => entry.kind !== 'post').map((entry: { id: string; name: string; nameEn?: string }) => ({ id: entry.id, label: L(entry.nameEn || entry.name, entry.name) })),
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [pageId, L])
  const known = !value || !options || [...options.bundled, ...options.mine].some((entry) => entry.id === value)
  return <select aria-label={L('Pattern', 'انتخاب الگو')} className="select" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">{options ? L('— choose a template —', '— انتخاب قالب —') : L('Loading…', 'در حال بارگذاری…')}</option>
    {!known && <option value={value}>{value} ({L('missing', 'حذف‌شده')})</option>}
    {options && options.mine.length > 0 && <optgroup label={L('My templates', 'قالب‌های من')}>{options.mine.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>}
    {options && <optgroup label={L('Built-in', 'آماده')}>{options.bundled.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>}
  </select>
}

function WidgetFields({ widget, pageId, L, onProp, onBusy }: { widget: BuilderWidget; pageId: string; L: L; onProp: (key: string, value: string) => void; onBusy: (busy: boolean) => void }) {
  const fields = FIELDS[widget.type] || []
  if (!fields.length) return <p className="muted text-sm">{L('This block has no content fields — tune it in the Style section.', 'این بلوک تنظیم محتوایی ندارد؛ از بخش استایل استفاده کنید.')}</p>
  return <>{fields.map((field) => {
    const value = widget.props[field.key] ?? ''
    const hint = field.hint ? <small className="muted text-sm">{L(field.hint[0], field.hint[1])}</small> : null
    if (field.kind === 'toggle') return <label className="bld-switch bld-field" key={field.key}>
      <input type="checkbox" checked={value === '1'} onChange={(event) => onProp(field.key, event.target.checked ? '1' : '')} />
      <span>{L(field.en, field.fa)}</span>
    </label>
    if (field.kind === 'post-category' || field.kind === 'product-category') return <label className="bld-field" key={field.key}><span>{L(field.en, field.fa)}</span>
      <CategoryPicker source={field.kind === 'post-category' ? 'post' : 'product'} value={value} L={L} onChange={(next) => onProp(field.key, next)} />
      {hint}
    </label>
    if (field.kind === 'template') return <label className="bld-field" key={field.key}><span>{L(field.en, field.fa)}</span>
      <TemplatePicker pageId={pageId} value={value} L={L} onChange={(next) => onProp(field.key, next)} />
      {hint}
    </label>
    if (field.key === 'js' && widget.type === 'html' && widget.props.advanced !== '1') return <label className="bld-field is-disabled" key={field.key}><span>{L(field.en, field.fa)}</span>
      <textarea className="textarea bld-code mono" dir="ltr" rows={3} value="" readOnly placeholder={L('Enable advanced mode to run JavaScript.', 'برای اجرای جاوااسکریپت حالت پیشرفته را روشن کنید.')} />
    </label>
    if (field.kind === 'items') return <ItemsField key={field.key} value={value} widgetType={widget.type} L={L} onChange={(next) => onProp(field.key, next)} />
    if (field.kind === 'image') return <div className="bld-field" key={field.key}><span>{L(field.en, field.fa)}</span>
      <CoverField mode="section" value={value} title={widget.props.title || widget.props.text || widget.type} onChange={(next) => onProp(field.key, next)} onBusy={onBusy} />
    </div>
    if (field.kind === 'select') return <Row key={field.key} label={L(field.en, field.fa)} ltr>
      <select className="select" value={value} onChange={(event) => onProp(field.key, event.target.value)}>
        {(field.options || []).map((option) => <option key={option.value} value={option.value} data-vip={option.value === 'cinema-vip' ? '' : undefined}>{L(option.en, option.fa)}</option>)}
      </select>
    </Row>
    if (field.kind === 'area' || field.kind === 'rich') return <label className="bld-field" key={field.key}><span>{L(field.en, field.fa)}</span>
      <textarea className={`textarea ${field.kind === 'rich' ? 'bld-code mono' : ''}`} dir={field.ltr ? 'ltr' : undefined} rows={field.rows || 3} value={value} onChange={(event) => onProp(field.key, event.target.value)} />
    </label>
    return <label className="bld-field" key={field.key}><span>{L(field.en, field.fa)}</span>
      <input className="input" dir={field.ltr ? 'ltr' : undefined} value={value} onChange={(event) => onProp(field.key, event.target.value)} />
      {hint}
    </label>
  })}</>
}

const visibilityOptions = (L: L) => <>
  <option value="none">{L('All devices', 'همه دستگاه‌ها')}</option>
  <option value="mobile">{L('Hide on mobile', 'مخفی در موبایل')}</option>
  <option value="desktop">{L('Hide on desktop', 'مخفی در دسکتاپ')}</option>
</>

type InspectorProps = {
  pageId: string
  doc: BuilderDoc
  sel: Sel | null
  fa: boolean
  L: L
  onBusy: (busy: boolean) => void
  onChange: (next: BuilderDoc, newSel?: Sel, history?: boolean) => void
  onDuplicate: () => void
  onRemove: () => void
}

export default function Inspector({ pageId, doc, sel, L, onBusy, onChange, onDuplicate, onRemove }: InspectorProps) {
  if (!sel) return <div className="builder-panel builder-inspector"><h2>{L('Settings', 'تنظیمات')}</h2><p className="muted">{L('Select a section, column or block on the canvas.', 'یک بخش یا بلوک را روی بوم انتخاب کنید.')}</p></div>

  if (sel.kind === 'section') {
    const section = getSection(doc, sel.sectionId)
    if (!section) return <aside className="builder-panel builder-inspector"><h2>{L('Settings', 'تنظیمات')}</h2><p className="muted">{L('This element belongs to a template or the page layout and cannot be edited here.', 'این عنصر متعلق به قالب یا چیدمان صفحه است و اینجا قابل ویرایش نیست.')}</p></aside>
    return <aside className="builder-panel builder-inspector">
      <h2>{L('Section', 'بخش')}</h2>
      <div className="bld-fields">
        <label className="bld-field"><span>{L('Anchor id (optional)', 'شناسه لنگر (اختیاری)')}</span>
          <input className="input mono" dir="ltr" value={section.anchor} onChange={(event) => onChange(patchSection(doc, section.id, { anchor: event.target.value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 64) }), sel, false)} />
        </label>
        <label className="bld-field"><span>{L('Surface', 'پس‌زمینه')}</span>
          <select className="select" value={section.style.tone} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { tone: event.target.value as never }), sel)}>
            <option value="none">{L('Default', 'پیش‌فرض')}</option>
            <option value="light">{L('Light', 'روشن')}</option>
            <option value="dark">{L('Dark', 'تیره')}</option>
            <option value="accent">{L('Accent', 'رنگی')}</option>
          </select>
        </label>
        <label className="bld-field"><span>{L('Background color', 'رنگ پس‌زمینه')}</span>
          <div className="bld-color" dir="ltr">
            <input type="color" value={section.style.bg || '#ffffff'} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { bg: event.target.value }), sel, false)} />
            <input aria-label={L('Background colour', 'رنگ پس‌زمینه')} className="input mono" dir="ltr" placeholder="#RRGGBB" value={section.style.bg} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { bg: event.target.value }), sel, false)} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(patchSectionStyle(doc, section.id, { bg: '' }), sel)}>{L('Clear', 'حذف')}</button>
          </div>
        </label>
        <label className="bld-field"><span>{L('Background image', 'تصویر پس‌زمینه')}</span>
          <CoverField mode="section" value={section.style.bgImage} title={section.anchor || 'section'} onChange={(next) => onChange(patchSectionStyle(doc, section.id, { bgImage: next }), sel, false)} onBusy={onBusy} />
        </label>
        <label className="bld-field"><span>{L('Vertical padding', 'فاصله عمودی')} · {section.style.paddingY}px</span>
          <input type="range" min={0} max={200} step={4} value={section.style.paddingY} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { paddingY: Number(event.target.value) }), sel, false)} />
        </label>
        <label className="bld-field"><span>{L('Content width', 'عرض محتوا')}</span>
          <select className="select" value={section.style.width || 'boxed'} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { width: event.target.value as never }), sel)}>
            <option value="boxed">{L('Boxed (site width)', 'کادر سایت')}</option>
            <option value="narrow">{L('Narrow (reading width)', 'باریک (عرض خواندن)')}</option>
            <option value="full">{L('Full width', 'تمام‌عرض')}</option>
          </select>
        </label>
        <label className="bld-field"><span>{L('Column alignment', 'تراز عمودی ستون‌ها')}</span>
          <select className="select" value={section.style.valign || 'start'} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { valign: event.target.value as never }), sel)}>
            <option value="start">{L('Top', 'بالا')}</option>
            <option value="center">{L('Middle', 'وسط')}</option>
            <option value="end">{L('Bottom', 'پایین')}</option>
            <option value="stretch">{L('Equal height', 'هم‌ارتفاع')}</option>
          </select>
        </label>
        <label className="bld-field"><span>{L('Visibility', 'نمایش')}</span>
          <select className="select" value={section.style.hideOn || 'none'} onChange={(event) => onChange(patchSectionStyle(doc, section.id, { hideOn: event.target.value as never }), sel)}>{visibilityOptions(L)}</select>
        </label>
        <div className="bld-field"><span>{L('Columns', 'ستون‌ها')} ({section.columns.length}/4)</span>
          <div className="bld-cols">
            {section.columns.map((column) => <div className="bld-col-row" key={column.id}>
              <button type="button" className={`btn btn-sm ${sel.kind === 'section' && column.id ? '' : 'btn-ghost'}`} onClick={() => onChange(doc, { kind: 'column', sectionId: section.id, columnId: column.id }, false)}>{column.width}%</button>
              <input aria-label={L('Column width', 'عرض ستون')} type="range" min={5} max={100} step={5} value={column.width} onChange={(event) => onChange(patchColumn(doc, section.id, column.id, { width: Number(event.target.value) }), sel, false)} />
              <button aria-label={L('Remove column', 'حذف ستون')} type="button" className="btn btn-ghost btn-sm" disabled={section.columns.length <= 1} onClick={() => { onChange(removeColumn(doc, section.id, column.id), { kind: 'section', sectionId: section.id }) }}>×</button>
            </div>)}
            <div className="bld-col-row">
              <button type="button" className="btn btn-ghost btn-sm" disabled={section.columns.length >= 4} onClick={() => onChange(addColumn(doc, section.id), sel)}>＋ {L('Column', 'ستون')}</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={section.columns.length <= 1} onClick={() => onChange(equalizeColumns(doc, section.id), sel)}>{L('Equal widths', 'عرض برابر')}</button>
            </div>
          </div>
        </div>
        <AdvancedStyleFields key={section.id} section value={section.adv} L={L} onChange={(adv, history) => onChange(patchAdvanced(doc, { sectionId: section.id }, adv), sel, !!history)} />
      </div>
      <div className="bld-actions">
        <button type="button" className="btn btn-ghost btn-sm" aria-label={L('Move up', 'انتقال به بالا')} disabled={doc.sections[0]?.id === section.id} onClick={() => onChange(nudgeSection(doc, section.id, -1), sel)}>↑</button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={L('Move down', 'انتقال به پایین')} disabled={doc.sections[doc.sections.length - 1]?.id === section.id} onClick={() => onChange(nudgeSection(doc, section.id, 1), sel)}>↓</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}>{L('Duplicate', 'تکثیر')}</button>
        <button type="button" className="btn btn-ghost btn-sm bld-danger" onClick={onRemove}>{L('Delete section', 'حذف بخش')}</button>
      </div>
    </aside>
  }

  if (sel.kind === 'column') {
    const section = getSection(doc, sel.sectionId)
    const column = section?.columns.find((col) => col.id === sel.columnId)
    if (!section || !column) return null
    return <aside className="builder-panel builder-inspector">
      <h2>{L('Column', 'ستون')}</h2>
      <label className="bld-field"><span>{L('Width', 'عرض')} · {column.width}%</span>
        <input type="range" min={5} max={100} step={5} value={column.width} onChange={(event) => onChange(patchColumn(doc, section.id, column.id, { width: Number(event.target.value) }), sel, false)} />
      </label>
      <p className="muted text-sm">{L(`${column.widgets.length} blocks inside.`, `${column.widgets.length} بلوک داخل این ستون.`)}</p>
      <div className="bld-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={section.columns.length <= 1} onClick={() => onChange(removeColumn(doc, section.id, column.id), { kind: 'section', sectionId: section.id })}>{L('Delete column', 'حذف ستون')}</button>
      </div>
    </aside>
  }

  const ref: WidgetRef = { sectionId: sel.sectionId, columnId: sel.columnId, widgetId: sel.widgetId }
  const widget = getWidget(doc, ref)
  const column = getSection(doc, ref.sectionId)?.columns.find((col) => col.id === ref.columnId)
  if (!widget) return <aside className="builder-panel builder-inspector"><h2>{L('Settings', 'تنظیمات')}</h2><p className="muted">{L('This element belongs to a template or the page layout and cannot be edited here.', 'این عنصر متعلق به قالب یا چیدمان صفحه است و اینجا قابل ویرایش نیست.')}</p></aside>
  const label = WIDGET_LABELS[widget.type]
  return <aside className="builder-panel builder-inspector">
    <h2>{L(label.en, label.fa)}</h2>
    <div className="bld-fields">
      <WidgetFields
        widget={widget}
        pageId={pageId}
        L={L}
        onBusy={onBusy}
        onProp={(key, value) => {
          const next = patchWidget(doc, ref, { props: { ...widget.props, [key]: value } })
          onChange(next, sel, false)
        }}
      />
      <details className="bld-style" open>
        <summary>{L('Style', 'استایل')}</summary>
        <label className="bld-field"><span>{L('Alignment', 'چیدمان')}</span>
          <select className="select" value={widget.style.align} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { align: event.target.value as never }), sel, false)}>
            <option value="start">{L('Start', 'ابتدا')}</option>
            <option value="center">{L('Center', 'وسط')}</option>
            <option value="end">{L('End', 'انتها')}</option>
          </select>
        </label>
        <label className="bld-field"><span>{L('Width', 'عرض')} · {widget.style.width ? `${widget.style.width}%` : L('auto', 'خودکار')}</span>
          <input type="range" min={0} max={100} step={5} value={widget.style.width} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { width: Number(event.target.value) }), sel, false)} />
        </label>
        <label className="bld-field"><span>{L('Vertical padding', 'فاصله عمودی')} · {widget.style.paddingY}px</span>
          <input type="range" min={0} max={160} step={4} value={widget.style.paddingY} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { paddingY: Number(event.target.value) }), sel, false)} />
        </label>
        <label className="bld-field"><span>{L('Corner radius', 'گردی گوشه')} · {widget.style.radius}px</span>
          <input type="range" min={0} max={48} step={2} value={widget.style.radius} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { radius: Number(event.target.value) }), sel, false)} />
        </label>
        <label className="bld-field"><span>{L('Surface', 'پس‌زمینه')}</span>
          <select className="select" value={widget.style.tone} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { tone: event.target.value as never }), sel, false)}>
            <option value="none">{L('None', 'بدون')}</option>
            <option value="light">{L('Light card', 'کارت روشن')}</option>
            <option value="dark">{L('Dark card', 'کارت تیره')}</option>
            <option value="accent">{L('Accent card', 'کارت رنگی')}</option>
          </select>
        </label>
        <label className="bld-field"><span>{L('Visibility', 'نمایش')}</span>
          <select className="select" value={widget.style.hideOn || 'none'} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { hideOn: event.target.value as never }), sel)}>{visibilityOptions(L)}</select>
        </label>
        <label className="bld-field"><span>{L('Text color', 'رنگ متن')}</span>
          <div className="bld-color" dir="ltr">
            <input type="color" value={widget.style.color || '#000000'} onChange={(event) => onChange(applyWidgetStyle(doc, ref, { color: event.target.value }), sel, false)} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(applyWidgetStyle(doc, ref, { color: '' }), sel)}>{L('Auto', 'خودکار')}</button>
          </div>
        </label>
      </details>
      <AdvancedStyleFields key={widget.id} value={widget.adv} L={L} onChange={(adv, history) => onChange(patchAdvanced(doc, ref, adv), sel, !!history)} />
    </div>
    <div className="bld-actions">
      <button type="button" className="btn btn-ghost btn-sm" aria-label={L('Move up', 'انتقال به بالا')} disabled={column?.widgets[0]?.id === widget.id} onClick={() => onChange(nudgeWidget(doc, ref, -1), sel)}>↑</button>
      <button type="button" className="btn btn-ghost btn-sm" aria-label={L('Move down', 'انتقال به پایین')} disabled={column?.widgets[column.widgets.length - 1]?.id === widget.id} onClick={() => onChange(nudgeWidget(doc, ref, 1), sel)}>↓</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}>{L('Duplicate', 'تکثیر')}</button>
      <button type="button" className="btn btn-ghost btn-sm bld-danger" onClick={onRemove}>{L('Delete block', 'حذف بلوک')}</button>
    </div>
  </aside>
}
