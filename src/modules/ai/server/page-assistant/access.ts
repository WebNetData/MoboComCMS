import type { NextRequest } from 'next/server'
import { requireAdmin, requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { authorPermissionOf } from '@/modules/identity/domain/sections'
import { moduleGuard } from '@/extensions/server/modules'
import { adminAssistantPath, pageTarget, type PageRecordKind, type PageTarget } from '../../domain/page-assistant'
import type { AiPurpose } from '../../domain/routing'
import { AiError } from '../error'

type Area = { label: string; prefix: string; module?: string; permission?: string; purpose: AiPurpose; kinds?: PageRecordKind[]; examples: string[] }
const content = (prefix: string, label: string, module: string | undefined, permission: string, purpose: AiPurpose, ...kinds: PageRecordKind[]): Area => ({ prefix, label, module, permission, purpose, kinds, examples: ['برای بهترشدن این محتوا چه پیشنهادی داری؟', 'عنوان و خلاصهٔ مناسب پیشنهاد بده', 'برای آماده‌سازی انتشار چه چیزهایی را بررسی کنم؟'] })
const AREAS: Area[] = [
  content('/admin/posts', 'نوشته‌های مجله', 'journal', 'cms.posts', 'editor', 'posts'),
  content('/admin/pages', 'صفحه‌های سایت', undefined, 'cms.pages', 'pages', 'pages'),
  content('/admin/products', 'محصولات فروشگاه', 'store', 'cms.products', 'store', 'products'),
  content('/admin/software', 'نرم‌افزار', 'software', 'software.manage', 'software', 'software'),
  content('/admin/games', 'بازی‌ها', 'games', 'games.manage', 'games', 'games'),
  content('/admin/cinema/titles', 'فیلم و سریال', 'cinema', 'cinema.manage', 'cinema', 'cinema-titles'),
  content('/admin/music/tracks', 'آهنگ‌ها', 'music', 'music.manage', 'music', 'music-tracks'),
  content('/admin/music/albums', 'آلبوم‌ها', 'music', 'music.manage', 'music', 'music-albums'),
  content('/admin/music/library', 'کتابخانهٔ موزیک', 'music', 'music.manage', 'music', 'music-tracks', 'music-albums'),
  { prefix: '/admin/store/orders', label: 'سفارش‌های فروشگاه', module: 'store', permission: 'orders.manage', purpose: 'operations', kinds: ['orders'], examples: ['وضعیت این سفارش چه معنایی دارد؟', 'اقدام بعدی مجاز برای بررسی سفارش چیست؟'] },
  { prefix: '/admin/design-studio', label: 'طراحی سایت', permission: 'cms.pages', purpose: 'builder', examples: ['برای چیدمان این صفحه پیشنهاد بده', 'طرح را برای موبایل چطور بهتر کنم؟'] },
  { prefix: '/admin/builder', label: 'صفحه‌ساز', permission: 'cms.pages', purpose: 'builder', examples: ['برای ساخت هدر و فوتر راهنمایی کن', 'برای نمایش موبایل چه چیزهایی را بررسی کنم؟'] },
]
const settingsAreas = ['settings', 'studio', 'security', 'updates', 'maintenance', 'extensions', 'sms', 'email', 'telegram', 'monitoring', 'permalinks']
const at = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

export async function pageAssistantAccess(req: NextRequest, input: { path?: unknown; target?: unknown }) {
  const path = adminAssistantPath(input.path)
  if (!path) throw new AiError('مسیر صفحهٔ مدیریت معتبر نیست', 422)
  const off = await moduleGuard('ai-assistant'); if (off) throw new AiError('دستیار هوش مصنوعی غیرفعال است', 423)
  const area: Area = AREAS.find(a => at(path, a.prefix)) || { prefix: '/admin', label: settingsAreas.some(key => at(path, '/admin/' + key)) ? 'تنظیمات سایت' : 'راهنمای مدیریت موبوکام', permission: settingsAreas.some(key => at(path, '/admin/' + key)) ? 'settings.manage' : undefined, purpose: 'admin', examples: ['در این بخش چه کاری می‌توانم انجام بدهم؟', 'برای انجام این کار از کدام ابزار موبوکام استفاده کنم؟'] }
  if (area.module && await moduleGuard(area.module)) throw new AiError('بخش مربوط به این صفحه غیرفعال است', 423)
  const scope = area.permission ? await requireContentScope(req, area.permission, authorPermissionOf(area.permission)) : null
  const actor = scope?.admin || (!area.permission ? await requireAdmin(req) : null)
  if (!actor) throw new AiError('دسترسی به دستیار این بخش ندارید', 403)
  const raw = input.target as Partial<PageTarget> | undefined
  let target = raw ? pageTarget(raw.kind, raw.id) : null
  if (raw && !target || target && !area.kinds?.includes(target.kind)) throw new AiError('مورد انتخابی با صفحهٔ فعلی سازگار نیست', 422)
  const routedMatch = path.match(/^\/admin\/(?:store\/orders|games)\/(\d+)$/)
  if (routedMatch) {
    const routed = pageTarget(path.startsWith('/admin/games/') ? 'games' : 'orders', routedMatch[1])
    if (!routed || target && (target.id !== routed.id || target.kind !== routed.kind)) throw new AiError('شناسهٔ مورد با صفحه سازگار نیست', 422)
    target = routed
  }
  // A server/sensitive page remains guide-only; no diagnostics, settings values or secrets are read.
  if (at(path, '/admin/server') && (!await requirePerm(req, 'server.manage') || !await requirePerm(req, 'settings.manage'))) throw new AiError('دسترسی به راهنمای سرور ندارید', 403)
  return { actor, authorId: scope?.authorId ?? null, area, view: { actorId: actor.id, path, label: area.label, purpose: area.purpose, target, recordLabel: target ? `${area.label} · ${target.id}` : '', examples: area.examples } }
}
