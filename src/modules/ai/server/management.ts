import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { allowedDepartmentSlugs } from '@/modules/support/server/department-access'
import { tehranDay } from '@/shared/time/day'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import { crmFollowUpCustomer, mayManageFollowUps } from '@/modules/livechat/server/crm-follow-ups'
import { currentAdminHasPermission, type AuthedUser } from '@/modules/identity/server/access'
import type { ManagementReport, ManagementSection, ManagementSignal } from '../domain/management'

type Section = Pick<ManagementSection, 'id' | 'label' | 'href'> & {
  permissions: readonly string[]
  module?: string
  read: (actor: AuthedUser, now: Date) => Promise<ManagementSignal[]>
}

const pending = { status: 'PENDING' }
const one = (id: string, label: string, detail: string, recommendation: string, count: Promise<number>, tone: ManagementSignal['tone'] = 'attention') =>
  count.then(value => [{ id, label, count: value, detail, recommendation, tone }])

function editorial(id: string, label: string, href: string, permission: string, count: () => Promise<number>): Section {
  return {
    id, label, href, permissions: [permission], module: id,
    read: () => one(id + '.review', 'محتوای در انتظار بازبینی', 'تعداد رکوردهایی که در صف بررسی این بخش‌اند.', 'موارد در انتظار را در پنل بخش بازبینی کنید.', count()),
  }
}

const sections: Section[] = [
  {
    id: 'site', label: 'عملیات سایت', href: '/admin/ai/site-operations', permissions: ['settings.manage'],
    read: (_actor, now) => one('site.jobs', 'کارهای پس‌زمینهٔ ناموفق', 'کارهای ناموفق ثبت‌شده در ۲۴ ساعت اخیر.', 'گروه خطا و علت احتمالی را در دستیار عملیات بررسی کنید.',
      db.backgroundJob.count({ where: { status: 'FAILED', finishedAt: { gte: new Date(now.getTime() - 86_400_000) } } }), 'urgent'),
  },
  {
    id: 'store', label: 'فروشگاه', href: '/admin/operations', module: 'store', permissions: ['orders.manage'],
    read: (_actor, now) => one('store.fulfilment', 'سفارش پرداخت‌شدهٔ منتظر پردازش', 'سفارش آنلاین پرداخت‌شده با تحویل در انتظار که بیش از ۲۴ ساعت تغییر نکرده است.', 'موجودی و مسئول تحویل را در مرکز عملیات سفارش بررسی کنید.',
      db.order.count({ where: { saleSource: 'ONLINE', productId: { not: null }, status: 'PAID', productDelivery: { is: { status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - 86_400_000) } } } } }), 'urgent'),
  },
  {
    id: 'support', label: 'پشتیبانی', href: '/admin/tickets', permissions: ['tickets.handle'],
    read: async (actor, now) => {
      const departments = await allowedDepartmentSlugs(actor)
      return one('support.stale', 'تیکت باز بدون تغییر اخیر', 'تیکت باز در دپارتمان‌های مجاز که بیش از ۲۴ ساعت به‌روزرسانی نشده است.', 'به سابقه و مسئول تیکت نگاه کنید و پاسخ یا پیگیری لازم را مشخص کنید.',
        db.ticket.count({ where: { status: 'OPEN', ...(departments === null ? {} : { department: { in: departments } }), updatedAt: { lt: new Date(now.getTime() - 86_400_000) } } }), 'urgent')
    },
  },
  {
    id: 'crm', label: 'مدیریت ارتباط با مشتریان', href: '/admin/crm/follow-ups', module: 'livechat', permissions: CRM_PERMISSIONS,
    read: (actor, now) => one('crm.overdue', 'پیگیری معوق', 'پیگیری باز با موعد گذشته، در محدودهٔ دسترسی شما.', 'موعد و مسئول پیگیری را در میز ارتباط با مشتریان مرور کنید.',
      db.crmFollowUp.count({ where: { status: 'OPEN', dueDay: { lt: tehranDay(now) }, user: crmFollowUpCustomer, ...(mayManageFollowUps(actor) ? {} : { assigneeId: actor.id }) } })),
  },
  {
    id: 'pay', label: 'موبوکام‌پی', href: '/admin/mobocom-pay', module: 'mobocom-pay', permissions: ['mobocom-pay.manage'],
    read: () => one('pay.delivery', 'تأیید ربات نیازمند بررسی', 'پرداخت‌های قطعی با نتیجهٔ نامشخص یا ارسال متوقف‌شده به ربات.', 'ابتدا نتیجهٔ سفارش را در پنل ربات بررسی کنید و از مسیر پیگیری تحویل اقدام کنید.',
      db.payBotDelivery.count({ where: { status: { in: ['UNKNOWN', 'BLOCKED'] }, payment: { status: 'PAID' } } }), 'urgent'),
  },
  {
    id: 'cloud', label: 'موبوکام کلاد', href: '/admin/hosting/operations', module: 'hosting', permissions: ['hosting.manage'],
    read: () => one('cloud.unknown', 'عملیات کلاد با نتیجهٔ نامشخص', 'درخواست‌های ثبت‌شده‌ای که نتیجهٔ ارائه‌دهنده برایشان مشخص نشده است.', 'وضعیت عملیات را با پنل ارائه‌دهنده تطبیق دهید.',
      db.hostingOperation.count({ where: { status: 'UNKNOWN' } }), 'urgent'),
  },
  editorial('journal', 'مجله', '/admin/posts', 'cms.posts', () => db.post.count({ where: pending })),
  editorial('music', 'موزیک', '/admin/music', 'music.manage', () => db.musicTrack.count({ where: pending })),
  editorial('cinema', 'فیلم و سریال', '/admin/cinema', 'cinema.manage', () => db.cinemaTitle.count({ where: pending })),
  editorial('games', 'بازی', '/admin/games', 'games.manage', () => db.gameTitle.count({ where: pending })),
  editorial('software', 'نرم‌افزار', '/admin/software', 'software.manage', () => db.softwareTitle.count({ where: pending })),
  {
    id: 'pages', label: 'صفحه‌ها', href: '/admin/pages', permissions: ['cms.pages'],
    read: () => one('pages.drafts', 'صفحهٔ پیش‌نویس', 'تعداد صفحه‌های در وضعیت پیش‌نویس.', 'پیش‌نویس‌های لازم برای انتشار را از فهرست صفحه‌ها بررسی کنید.', db.page.count({ where: { status: 'DRAFT' } })),
  },
  {
    id: 'forum', label: 'تالار گفتمان', href: '/admin/forum', module: 'forum', permissions: ['forum.moderate'],
    read: () => one('forum.flags', 'گزارش کاربر در انتظار بازبینی', 'تعداد گزارش‌های ثبت‌شدهٔ تالار در انتظار تصمیم.', 'شواهد و گفتگو را در بخش مدیریت تالار بررسی کنید.', db.forumFlag.count({ where: pending })),
  },
  {
    id: 'reviews', label: 'نظرها و امتیازها', href: '/admin/reviews', module: 'reviews', permissions: ['reviews.moderate'],
    read: () => one('reviews.pending', 'نظر در انتظار بازبینی', 'صف بررسی نظرهای عمومی محتوا و محصول.', 'نظرهای منتظر را در پنل بررسی نظرها مرور کنید.', db.itemReview.count({ where: { ...pending, itemType: { not: 'business' } } })),
  },
]

export const managementSectionExists = (id: string) => sections.some(section => section.id === id)

export async function collectManagement(actor: AuthedUser, selected?: string, now = new Date()): Promise<ManagementReport> {
  const scoped = sections.filter(section => (!selected || section.id === selected) &&
    section.permissions.some(permission => currentAdminHasPermission(actor, permission)))
  const rows = await Promise.all(scoped.map(async ({ id, label, href, module, read }): Promise<ManagementSection | null> => {
    try {
      if (module && !await isModuleEnabled(module)) return null
      const signals = await read(actor, now)
      return { id, label, href, signals, state: signals.some(signal => signal.count > 0) ? 'attention' : 'clear' }
    } catch {
      return { id, label, href, signals: [], state: 'unavailable' }
    }
  }))
  return { checkedAt: now.toISOString(), sections: rows.filter(row => row !== null) }
}
