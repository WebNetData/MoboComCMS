import { extensionCatalog } from '@/extensions/generated/catalog'

/**
 * Staff roles by the job a person does (owner 2026-11-13: «نقش‌ها را اصولی کن؛ کارشناس فرم، صندوق‌دار و…»). One
 * source for the ready roles the Admin offers, what each job is for and what every permission is called. A ready role
 * is a starting point: once made it is an ordinary Role row the owner may edit. Staff roles are not member groups
 * (account/site-groups): a group gives members benefits and section access on the site, a role opens the Admin.
 *
 * Kept free of rbac.ts imports (rbac derives its presets from here). Permissions a plugin adds are named by its
 * manifest; a template that needs a module is offered only while that module is on.
 */

export type StaffCategory = 'management' | 'sales' | 'service' | 'finance' | 'content' | 'partners'
export const STAFF_CATEGORIES: readonly { id: StaffCategory; title: string; hint: string }[] = [
  { id: 'management', title: 'مدیریت', hint: 'دسترسی گسترده؛ فقط به افراد مورد اعتماد' },
  { id: 'sales', title: 'فروش، فروشگاه و صندوق', hint: 'فروش آنلاین و حضوری، سفارش و انبار' },
  { id: 'service', title: 'خدمات و پشتیبانی', hint: 'درخواست‌ها، تعمیر، تیکت و گفت‌وگو با مشتری' },
  { id: 'finance', title: 'مالی', hint: 'صورتحساب، پرداخت و گزارش مالی' },
  { id: 'content', title: 'محتوا و جامعه', hint: 'هر بخش محتوا مدیر خودش را دارد' },
  { id: 'partners', title: 'همکاران بیرونی', hint: 'نمایندگان فروش' },
]

export type StaffRoleTemplate = {
  /** Also the role's slug when made from the template. */
  id: string
  title: string
  /** What this person does, in the owner's words: shown on the card. */
  job: string
  category: StaffCategory
  /** Without dashboard.view (every staff role gets it). Ignored for full access. */
  permissions: readonly string[]
  /** Every permission, including those added by plugins later ("*"). */
  fullAccess?: boolean
  /** Offered only while this module is on. */
  module?: string
}

const SECTION_MANAGERS = ['music.manage', 'cinema.manage', 'games.manage', 'software.manage', 'forum.moderate', 'reviews.moderate'] as const

export const STAFF_ROLE_TEMPLATES: readonly StaffRoleTemplate[] = [
  { id: 'admin', title: 'مدیر کل', job: 'همهٔ بخش‌ها و تنظیمات سایت، همراه دسترسی‌هایی که افزونه‌های بعدی اضافه می‌کنند', category: 'management', permissions: [], fullAccess: true },
  { id: 'site-deputy', title: 'معاون کل سایت', job: 'همان دسترسی مدیر کل برای جانشین؛ نقش مدیر کل را نمی‌تواند تغییر دهد', category: 'management', permissions: [], fullAccess: true },
  { id: 'backup', title: 'جانشین مدیر محتوا و تنظیمات', job: 'همهٔ بخش‌های محتوا، صفحه‌ها، محصولات و تنظیمات؛ بدون مالی، کاربران و نقش‌ها', category: 'management', permissions: ['cms.pages', 'cms.posts', 'cms.products', 'settings.manage', ...SECTION_MANAGERS] },

  { id: 'store-manager', title: 'مدیر فروشگاه', job: 'محصولات، انبار، سفارش‌ها، فروش حضوری، مرجوعی و گزارش فروش', category: 'sales', permissions: ['cms.products', 'orders.manage'] },
  { id: 'cashier', title: 'صندوق‌دار مغازه', job: 'پیشخوان فروش حضوری، صندوق و شیفت خودش و چاپ برچسب قفسه؛ بدون مرجوعی، گزارش و سفارش‌های دیگر', category: 'sales', permissions: ['instore.sell'], module: 'instore' },
  { id: 'order-specialist', title: 'کارشناس سفارش', job: 'فقط سفارش‌هایی که به او سپرده می‌شود: آماده‌سازی، تحویل در فروشگاه و چاپ کارت', category: 'sales', permissions: ['store.orders.handle'], module: 'store' },

  { id: 'form-specialist', title: 'کارشناس فرم و خدمات', job: 'درخواست‌ها و فرم‌هایی که به او سپرده شده، پذیرش حضوری تعمیر و چاپ رسید', category: 'service', permissions: ['forms.handle'] },
  { id: 'support', title: 'پشتیبان', job: 'تیکت‌ها، کاربران، سفارش‌ها و صورتحساب‌ها', category: 'service', permissions: ['users.manage', 'subs.manage', 'orders.manage', 'invoices.manage', 'tickets.handle'] },
  { id: 'chat-agent', title: 'کارشناس گفت‌وگوی آنلاین', job: 'پاسخ به گفت‌وگوی آنلاین و دیدن پروندهٔ مشتری', category: 'service', permissions: ['support.chat'], module: 'livechat' },

  { id: 'accountant', title: 'حسابدار', job: 'امور مالی، صورتحساب‌ها و سفارش‌ها', category: 'finance', permissions: ['finance.manage', 'invoices.manage', 'orders.manage'] },

  { id: 'content-manager', title: 'سردبیر کل محتوا', job: 'مجله و همهٔ بخش‌های محتوا با هم', category: 'content', permissions: ['cms.posts', ...SECTION_MANAGERS] },
  { id: 'magazine-manager', title: 'مدیر مجله', job: 'نوشته‌ها، دسته‌ها و دیدگاه‌های مجله', category: 'content', permissions: ['cms.posts'] },
  { id: 'music-manager', title: 'مدیر موزیک', job: 'آهنگ، آلبوم، هنرمند و پلی‌لیست', category: 'content', permissions: ['music.manage'] },
  { id: 'cinema-manager', title: 'مدیر فیلم و سریال', job: 'عنوان‌ها، فصل‌ها، قسمت‌ها و لینک‌ها', category: 'content', permissions: ['cinema.manage'] },
  { id: 'games-manager', title: 'مدیر بازی', job: 'بازی‌ها، به‌روزرسانی‌ها و مجموعه‌ها', category: 'content', permissions: ['games.manage'] },
  { id: 'software-manager', title: 'مدیر نرم‌افزار', job: 'نرم‌افزارها و نسخه‌ها', category: 'content', permissions: ['software.manage'] },
  { id: 'forum-manager', title: 'مدیر تالار گفتمان', job: 'همهٔ انجمن‌ها، گروه‌ها و تنظیمات تالار', category: 'content', permissions: ['forum.moderate'] },

  { id: 'reseller', title: 'نماینده', job: 'ساخت و مدیریت اشتراک‌های مشتریان خودش', category: 'partners', permissions: ['subs.manage'], module: 'reseller' },
]

export const staffTemplate = (id: string) => STAFF_ROLE_TEMPLATES.find(template => template.id === id)

/** What each core permission opens; a plugin's permissions are named in its manifest. */
export const CORE_PERMISSION_LABELS: Record<string, string> = {
  'dashboard.view': 'ورود به پنل و پیشخوان',
  'users.manage': 'کاربران و پروندهٔ مشتری',
  'subs.manage': 'اشتراک‌های VPN',
  'orders.manage': 'همهٔ سفارش‌ها، فروش حضوری و مرجوعی',
  'finance.manage': 'امور مالی و هزینه‌ها',
  'invoices.manage': 'صورتحساب‌ها و رسیدها',
  'gateways.manage': 'درگاه‌ها و حساب‌های بانکی',
  'plans.manage': 'پلن‌ها و کدهای تخفیف',
  'panels.manage': 'پنل‌های VPN',
  'tickets.handle': 'تیکت‌ها',
  'tickets.departments.manage': 'دپارتمان‌های تیکت',
  'settings.manage': 'تنظیمات سایت',
  'cms.pages': 'صفحه‌ها و ساخت فرم',
  'forms.handle': 'پاسخ فرم‌ها و پذیرش خدمات',
  'automation.manage': 'اتوماسیون و ارتباط با مشتری',
  'cms.posts': 'مجله (نوشته‌ها و دیدگاه‌ها)',
  'cms.products': 'محصولات و انبار',
  'roles.manage': 'نقش‌ها و دسترسی کارکنان',
  'resellers.manage': 'نمایندگان فروش',
  'audit.view': 'گزارش فعالیت‌ها',
  'imports.manage': 'ورود گروهی اطلاعات',
  'media.manage': 'کتابخانهٔ رسانه',
  'extensions.code': 'کد افزونه و قالب (اعتماد کامل سرور)',
}

const PLUGIN_PERMISSION_LABELS = new Map(extensionCatalog.flatMap(manifest => (manifest.permissions || []).map(permission => [permission.id, permission.label] as const)))

/** A permission's name for people: core, then the manifest that adds it, else its id. "*" is everything. */
export function permissionLabel(id: string): string {
  if (id === '*') return 'همهٔ بخش‌ها و دسترسی‌های سایت'
  return CORE_PERMISSION_LABELS[id] || PLUGIN_PERMISSION_LABELS.get(id) || id
}
