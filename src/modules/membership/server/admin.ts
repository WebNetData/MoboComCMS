import { db } from '@/platform/database/prisma'
import { getModuleSettings, getModuleStates } from '@/extensions/server/modules'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { membershipHealth, summarizeMemberships } from '@/modules/membership/domain/membership'

// VIP admin read models: the membership dashboard and a one-page overview of
// everything VIP unlocks across the enabled sections.

const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function membershipDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [periods, plans] = await Promise.all([
    db.userMembership.findMany({ select: { userId: true, kind: true, source: true, startsAt: true, endsAt: true, revokedAt: true, planId: true, orderId: true, createdAt: true, amountMinor: true, currency: true } }),
    db.membershipPlan.findMany({ select: { id: true, name: true, days: true, priceMinor: true, currency: true, active: true, tier: { select: { name: true, color: true, rank: true } } } }),
  ])
  const summary = summarizeMemberships(periods, now)
  const health = membershipHealth(periods, now)
  // Revenue: paid VIP orders (purchase periods carry their order id).
  const orderIds = periods.filter((row) => row.source === 'PURCHASE' && row.orderId && row.createdAt >= since).map((row) => row.orderId!)
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds }, status: 'PAID' }, select: { totalMinor: true, currency: true } }) : []
  const revenue = new Map<string, number>()
  for (const order of orders) { const currency = normalizeCurrency(order.currency); revenue.set(currency, (revenue.get(currency) || 0) + legacyNumber(order.totalMinor, currency)) }
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const grants = new Map(days.map((day) => [day, 0]))
  for (const row of periods) if (!row.revokedAt && row.createdAt >= since) { const key = tehranDay(row.createdAt); if (grants.has(key)) grants.set(key, grants.get(key)! + 1) }
  const expiringIds = summary.expiringUsers.slice(0, 12).map((row) => row.userId)
  const users = expiringIds.length ? await db.user.findMany({ where: { id: { in: expiringIds } }, select: { id: true, email: true, name: true } }) : []
  const byId = new Map(users.map((user) => [user.id, user]))
  const planName = new Map(plans.map((plan) => [plan.id, plan.name]))
  return {
    kpis: { active: summary.active, joined30: summary.joined, renewed30: summary.renewed, expiring7: summary.expiring, lapsed30: summary.lapsed, plans: plans.filter((plan) => plan.active).length, orders30: orders.length },
    revenue: [...revenue].map(([currency, amount]) => ({ currency, amount })),
    health: { churnPercent: health.churnPercent, trials: health.trials, converted: health.converted, conversionPercent: health.conversionPercent, recurring: health.recurring.map((row) => ({ currency: row.currency, amount: legacyNumber(row.amountMinor, row.currency) })) },
    tiers: Object.values(summary.byPlan.reduce<Record<string, { name: string; color: string; rank: number; count: number }>>((all, row) => { const tier = plans.find((plan) => plan.id === row.planId)?.tier; const name = tier?.name || 'بدون سطح'; all[name] = { name, color: tier?.color || '', rank: tier?.rank ?? 0, count: (all[name]?.count || 0) + row.count }; return all }, {})).sort((a, b) => b.rank - a.rank),
    series: days.map((day) => ({ day, value: grants.get(day)! })),
    sources: Object.entries(summary.bySource).map(([source, count]) => ({ source, count })),
    plans: summary.byPlan.map((row) => ({ name: planName.get(row.planId) || `#${row.planId}`, count: row.count })),
    expiring: summary.expiringUsers.slice(0, 12).map((row) => ({ userId: row.userId, email: byId.get(row.userId)?.email || '', name: byId.get(row.userId)?.name || '', endsAt: row.endsAt.toISOString(), days: Math.max(0, Math.ceil((row.endsAt.getTime() - now.getTime()) / DAY)) })),
  }
}

type PerkRow = { key: string; section: string; label: string; count: number | null; state?: string; href: string; module: string }

/** Where VIP matters, section by section: exclusive items, member prices, gated downloads and gift days. */
export async function vipPerksOverview(): Promise<PerkRow[]> {
  const modules = await getModuleStates()
  const on = (id: string) => modules[id] !== false
  const safe = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback)
  const [posts, titles, tracks, albums, software, games, forums, memberLinks, productPrices, productGifts, planGifts, music, membership] = await Promise.all([
    safe(db.post.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.cinemaTitle.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.musicTrack.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.musicAlbum.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.softwareTitle.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.gameTitle.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.forumCategory.count({ where: { access: 'MEMBERS' } }), 0),
    safe(db.mediaLink.groupBy({ by: ['ownerType'], where: { access: 'MEMBERS', disabled: false }, _count: { _all: true } }), [] as { ownerType: string; _count: { _all: number } }[]),
    safe(db.product.count({ where: { memberPriceMinor: { gt: 0 } } }), 0),
    safe(db.product.count({ where: { vipGiftDays: { gt: 0 } } }), 0),
    safe(db.plan.count({ where: { vipGiftDays: { gt: 0 } } }), 0),
    safe(getModuleSettings('music'), {} as Record<string, unknown>),
    safe(getModuleSettings('membership'), {} as Record<string, unknown>),
  ])
  const links = (types: string[]) => memberLinks.filter((row) => types.includes(row.ownerType)).reduce((sum, row) => sum + row._count._all, 0)
  const rows: PerkRow[] = [
    { key: 'posts', module: 'journal', section: 'مجله', label: 'مطالب ویژهٔ اعضا (بقیه فقط پیش‌نمایش می‌بینند)', count: posts, href: '/admin/posts' },
    { key: 'teaser', module: 'membership', section: 'مجله', label: 'درصد متنی که غیرعضوها از مطلب ویژه می‌بینند', count: null, state: `${Number(membership['teaser-percent'] ?? 30).toLocaleString('fa-IR')}٪`, href: '/admin/sections/membership' },
    { key: 'titles', module: 'cinema', section: 'فیلم و سریال', label: 'فیلم و سریال ویژهٔ اعضا', count: titles, href: '/admin/cinema/titles' },
    { key: 'cinema-links', module: 'cinema', section: 'فیلم و سریال', label: 'لینک‌های دانلود/پخش ویژهٔ اعضا', count: links(['title', 'episode']), href: '/admin/cinema/titles' },
    { key: 'tracks', module: 'music', section: 'موزیک', label: 'آهنگ و آلبوم ویژهٔ اعضا', count: tracks + albums, href: '/admin/music/library' },
    { key: 'hq', module: 'music', section: 'موزیک', label: 'کیفیت ۳۲۰ فقط برای اعضا', count: null, state: music['hq-members-only'] === false ? 'خاموش' : 'روشن', href: '/admin/sections/music' },
    { key: 'music-dl', module: 'music', section: 'موزیک', label: 'دانلود آهنگ فقط برای اعضا', count: null, state: music['download-members-only'] === true ? 'روشن' : 'خاموش', href: '/admin/sections/music' },
    { key: 'software', module: 'software', section: 'نرم‌افزار', label: 'نرم‌افزار ویژهٔ اعضا', count: software, href: '/admin/software/titles' },
    { key: 'software-links', module: 'software', section: 'نرم‌افزار', label: 'لینک‌های دانلود ویژهٔ اعضا', count: links(['software']), href: '/admin/software/titles' },
    { key: 'games', module: 'games', section: 'بازی', label: 'بازی با دانلود ویژهٔ اعضا', count: games + links(['game', 'gameupdate']), href: '/admin/games/titles' },
    { key: 'forum', module: 'forum', section: 'تالار گفتمان', label: 'دسته‌های ویژهٔ اعضا', count: forums, href: '/admin/forum' },
    { key: 'prices', module: 'store', section: 'فروشگاه', label: 'محصول با قیمت ویژهٔ اعضا', count: productPrices, href: '/admin/store/products' },
    { key: 'gifts', module: 'store', section: 'فروشگاه', label: 'محصولی که روز VIP هدیه می‌دهد', count: productGifts, href: '/admin/store/products' },
    { key: 'plan-gifts', module: 'vpn', section: 'سرویس VPN', label: 'پلن VPN که روز VIP هدیه می‌دهد', count: planGifts, href: '/admin/plans' },
  ]
  return rows.filter((row) => on(row.module))
}
