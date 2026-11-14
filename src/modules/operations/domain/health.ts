import type { BackupHealth } from '@/modules/notifications/domain/backup-health'

export type HealthAction = { id: string; tone: 'ok' | 'warning' | 'danger'; title: string; detail: string; href: string; action: string }
type Input = { database: boolean; cacheDegraded: boolean; failedJobs: number; stalledJobs: number; backup: BackupHealth }

/** Factual signals only. Every action returns to its existing owner; this read model never retries or restores. */
export function healthActions(input: Input): HealthAction[] {
  const items: HealthAction[] = []
  if (!input.database) items.push({ id: 'database', tone: 'danger', title: 'ارتباط پایگاه داده برقرار نیست', detail: 'اطلاعات این نما ممکن است کامل نباشد؛ اتصال و گزارش سرور را بررسی کنید.', href: '/admin/incidents', action: 'بررسی رخدادها' })
  if (input.cacheDegraded) items.push({ id: 'cache', tone: 'warning', title: 'کش مشترک در دسترس نیست', detail: 'برنامه از حافظهٔ همین نمونه استفاده می‌کند؛ اتصال Redis را بررسی کنید.', href: '/admin/monitoring', action: 'جزئیات اتصال' })
  if (input.failedJobs > 0) items.push({ id: 'jobs', tone: 'danger', title: `${input.failedJobs.toLocaleString('fa-IR')} کار پس‌زمینه ناموفق`, detail: 'شامل پردازش و ارسال اعلان‌ها؛ پیش از تلاش دوباره علت هر کار را بررسی کنید.', href: '#monitoring-jobs', action: 'بررسی صف و خطاها' })
  if (input.stalledJobs > 0) items.push({ id: 'stalled', tone: 'warning', title: `${input.stalledJobs.toLocaleString('fa-IR')} کار با قفل قدیمی`, detail: 'بیش از ۱۰ دقیقه از قفل اجرا گذشته است؛ زمان‌بند و ادامهٔ پردازش را بررسی کنید.', href: '#monitoring-jobs', action: 'بررسی پردازش‌ها' })
  const backup = input.backup
  const descriptions: Record<BackupHealth['status'], [string, string]> = {
    available: ['فایل بکاپ اخیر موجود است', 'وجود فایل به‌تنهایی تأیید صحت آرشیو یا امکان بازیابی امروز نیست.'],
    disabled: ['بکاپ خودکار غیرفعال است', 'تنظیمات نگهداری و برنامهٔ بکاپ را بررسی کنید.'],
    unconfigured: ['بکاپ به تنظیم نیاز دارد', 'پایگاه داده یا کلید رمزگذاری سرور آماده نیست.'],
    running: ['بکاپ در حال اجراست', 'نتیجه پس از پایان پردازش در سامانهٔ بکاپ ثبت می‌شود.'],
    failed: ['آخرین عملیات بکاپ نیازمند رسیدگی است', 'خطای بکاپ، ارسال یا آزمون بازیابی ثبت شده است.'],
    stale: ['بکاپ اخیر تأیید نشده است', 'فایل ثبت‌شده در ۲۴ ساعت اخیر موجود نیست یا زمان اجرای بکاپ غیرعادی است.'],
    unavailable: ['وضعیت بکاپ در دسترس نیست', 'خواندن تنظیمات یا فایل بکاپ کامل نشد؛ آن را سالم فرض نکنید.'],
  }
  const [title, detail] = descriptions[backup.status]
  items.push({ id: 'backup', tone: backup.status === 'available' ? 'ok' : ['failed', 'unavailable'].includes(backup.status) ? 'danger' : 'warning', title, detail, href: '/admin/telegram', action: 'بکاپ و آزمون بازیابی' })
  if (backup.enabled && !backup.scheduler) items.push({ id: 'backup-scheduler', tone: 'warning', title: 'زمان‌بند بکاپ این اجرا خاموش است', detail: 'وجود فایل قبلی به معنی اجرای بکاپ‌های بعدی نیست.', href: '/admin/telegram', action: 'بررسی تنظیمات بکاپ' })
  return items
}
