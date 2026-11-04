import { db } from '@/platform/database/prisma'
import { getModuleStates } from '@/extensions/server/modules'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import { getActiveMembership } from '@/modules/membership/server/membership'
import { ensureUserProfile } from '@/modules/identity/server/profile'
import { normalizeLinks } from '@/modules/identity/domain/profile'
import { itemCards, type ItemCard } from '@/modules/content/server/registry'
import { isItemType, itemKey, type ItemRef } from '@/modules/content/domain/items'
import { memberPromptWorkspace } from '@/modules/prompts/server/prompts'
import { userOpensSection } from '@/modules/account/server/section-access'

/** What a service order is for (a form, VIP, content), named as its invoice names it. */
const orderName = (meta: string | null) => { let parsed: Record<string, unknown> = {}; try { parsed = JSON.parse(meta || '{}') } catch { parsed = {} } return parsed.kind ? invoiceSubject({ kind: 'BILLING', meta: parsed, siteName: '', amountText: '' }).title : '' }

// Account home: one call assembling what a member needs at a glance —
// profile, membership, money, orders, inbox, community and games —
// from the enabled modules only.

const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

type Check = { key: string; label: string; href: string; done: boolean }

export async function accountOverview(userId: number, now = new Date()) {
  const modules = { ...await getModuleStates() }
  if (modules.vpn !== false && !await userOpensSection('vpn', userId)) modules.vpn = false
  const on = (id: string) => modules[id] !== false
  const since84 = new Date(now.getTime() - 84 * DAY)
  const since7 = new Date(now.getTime() - 7 * DAY)
  const [user, profile, membership, wallets, unpaid, notifications, unreadNotifications, openTickets] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, createdAt: true, phoneVerifiedAt: true, telegramId: true, avatarColor: true } }),
    ensureUserProfile(userId),
    on('membership') ? getActiveMembership(userId, now) : Promise.resolve(null),
    db.walletAccount.findMany({ where: { userId }, select: { currency: true, balanceMinor: true } }),
    db.invoice.findMany({ where: { userId, status: 'UNPAID' }, select: { totalMinor: true, walletAppliedMinor: true, currency: true } }),
    db.userNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, titleFa: true, bodyFa: true, href: true, readAt: true, createdAt: true, kind: true } }),
    db.userNotification.count({ where: { userId, readAt: null } }),
    db.ticket.count({ where: { userId, status: { in: ['OPEN', 'PENDING'] } } }).catch(() => 0),
  ])
  if (!user) return null

  // Profile completeness (links to the exact place to fix each gap).
  let links: unknown[] = []
  try { links = normalizeLinks(JSON.parse(profile.links)) } catch { links = [] }
  const checks: Check[] = [
    { key: 'avatar', label: 'تصویر پروفایل', href: '/dashboard/public-profile', done: !!profile.avatar },
    { key: 'cover', label: 'تصویر کاور', href: '/dashboard/public-profile', done: !!profile.cover },
    { key: 'headline', label: 'تیتر کوتاه', href: '/dashboard/public-profile', done: !!profile.headline },
    { key: 'bio', label: 'معرفی', href: '/dashboard/public-profile', done: !!profile.bio },
    { key: 'links', label: 'شبکهٔ اجتماعی', href: '/dashboard/public-profile', done: links.length > 0 },
    { key: 'phone', label: 'تأیید شمارهٔ موبایل', href: '/dashboard/profile', done: !!user.phoneVerifiedAt },
    { key: 'telegram', label: 'اتصال تلگرام', href: '/dashboard/profile', done: !!user.telegramId },
  ]
  const done = checks.filter((check) => check.done).length

  // Money
  const money = new Map<string, { balance: number; unpaid: number; unpaidCount: number }>()
  for (const w of wallets) { const c = normalizeCurrency(w.currency); money.set(c, { balance: legacyNumber(w.balanceMinor, c), unpaid: 0, unpaidCount: 0 }) }
  for (const inv of unpaid) {
    const c = normalizeCurrency(inv.currency)
    const row = money.get(c) || { balance: 0, unpaid: 0, unpaidCount: 0 }
    row.unpaid += legacyNumber(inv.totalMinor - inv.walletAppliedMinor, c); row.unpaidCount++
    money.set(c, row)
  }

  // Orders (store workflow when the store is on; any order otherwise)
  const orders = await db.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, meta: true, status: true, createdAt: true, currency: true, totalMinor: true, productDelivery: { select: { status: true } }, lines: { select: { name: true, image: true }, take: 3 }, product: { select: { name: true, image: true } }, plan: { select: { name: true } } } }).catch(() => [])
  const inProgress = await db.order.count({ where: { userId, status: 'PAID', productDelivery: { status: { in: ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED'] } } } }).catch(() => 0)

  // Community
  const community = on('community') ? await (async () => {
    const [followers7, likes7, comments7, following] = await Promise.all([
      db.userFollow.count({ where: { followingId: userId, createdAt: { gte: since7 } } }),
      db.communityLike.count({ where: { post: { authorId: userId }, createdAt: { gte: since7 } } }),
      db.communityComment.count({ where: { post: { authorId: userId }, authorId: { not: userId }, status: 'VISIBLE', createdAt: { gte: since7 } } }),
      db.userFollow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 2000 }),
    ])
    const posts = following.length ? await db.communityPost.findMany({ where: { authorId: { in: following.map((f) => f.followingId) }, status: 'VISIBLE' }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, content: true, createdAt: true, likeCount: true, commentCount: true, author: { select: { name: true, userProfile: { select: { username: true, avatar: true } }, avatarColor: true } } } }) : []
    return {
      followers7, likes7, comments7,
      feed: posts.map((post) => ({ id: post.id, text: post.content.slice(0, 160), createdAt: post.createdAt.toISOString(), likes: post.likeCount, comments: post.commentCount, author: { name: post.author.name || post.author.userProfile?.username || '', username: post.author.userProfile?.username || '', avatar: post.author.userProfile?.avatar || '', avatarColor: post.author.avatarColor } })),
    }
  })() : null

  // Games
  const games = on('games') ? await (async () => {
    const [grouped, wanted] = await Promise.all([
      db.gameLibrary.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
      db.gameLibrary.findMany({ where: { userId, status: 'WANT', game: { status: 'PUBLISHED', audienceGroups: '', releaseDate: { gt: now } } }, orderBy: { game: { releaseDate: 'asc' } }, take: 4, select: { game: { select: { title: true, slug: true, cover: true, releaseDate: true } } } }),
    ])
    return {
      counts: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Record<string, number>,
      upcoming: wanted.map((row) => ({ title: row.game.title, slug: row.game.slug, cover: row.game.cover, releaseDate: row.game.releaseDate!.toISOString(), days: Math.ceil((row.game.releaseDate!.getTime() - now.getTime()) / DAY) })),
    }
  })() : null

  // Favorites
  const favoriteRows = on('reviews') ? await db.itemFavorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 6, select: { itemType: true, itemId: true } }).catch(() => []) : []
  const favoriteCount = on('reviews') ? await db.itemFavorite.count({ where: { userId } }).catch(() => 0) : 0
  const cards = await itemCards(favoriteRows.flatMap((row) => (isItemType(row.itemType) ? [{ type: row.itemType, id: row.itemId } as ItemRef] : []))).catch(() => new Map<string, ItemCard>())

  // 12-week contribution calendar: posts, comments, forum posts, reviews, orders.
  const [posts, comments, forumPosts, reviews, orderDays] = await Promise.all([
    on('community') ? db.communityPost.findMany({ where: { authorId: userId, createdAt: { gte: since84 } }, select: { createdAt: true } }) : [],
    on('community') ? db.communityComment.findMany({ where: { authorId: userId, createdAt: { gte: since84 } }, select: { createdAt: true } }) : [],
    on('forum') ? db.forumPost.findMany({ where: { userId, createdAt: { gte: since84 } }, select: { createdAt: true } }).catch(() => []) : [],
    db.itemReview.findMany({ where: { userId, createdAt: { gte: since84 } }, select: { createdAt: true } }).catch(() => []),
    db.order.findMany({ where: { userId, createdAt: { gte: since84 } }, select: { createdAt: true } }).catch(() => []),
  ])
  const days = Array.from({ length: 84 }, (_, i) => tehranDay(new Date(now.getTime() - (83 - i) * DAY)))
  const counts = new Map(days.map((d) => [d, 0]))
  for (const row of [...posts, ...comments, ...forumPosts, ...reviews, ...orderDays]) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }

  const unreadMessages = on('forum') ? await db.forumConversationUser.findMany({ where: { userId, left: false, archived: false }, select: { lastRead: true, conversation: { select: { postCount: true } } } }).then((rows) => rows.filter((row) => row.conversation.postCount > row.lastRead).length).catch(() => 0) : 0

  return {
    modules: { store: on('store'), community: on('community'), games: on('games'), forum: on('forum'), membership: on('membership'), reviews: on('reviews'), vpn: on('vpn') },
    user: { name: user.name || profile.username, email: user.email, joinedAt: user.createdAt.toISOString(), avatarColor: user.avatarColor },
    profile: { username: profile.username, avatar: profile.avatar, cover: profile.cover, headline: profile.headline, verified: profile.verified, followers: profile.followerCount, following: profile.followingCount, posts: profile.postCount, percent: Math.round((done / checks.length) * 100), missing: checks.filter((check) => !check.done) },
    vip: membership ? { endsAt: membership.endsAt.toISOString(), daysLeft: Math.max(0, Math.ceil((membership.endsAt.getTime() - now.getTime()) / DAY)) } : null,
    money: [...money].map(([currency, row]) => ({ currency, ...row })),
    orders: { inProgress, recent: orders.map((order) => ({ id: order.id, url: order.product ? `/dashboard/orders/${order.id}` : '/dashboard/orders', title: order.lines[0]?.name || order.product?.name || order.plan?.name || orderName(order.meta) || `سفارش #${order.id}`, more: Math.max(0, order.lines.length - 1), image: order.lines[0]?.image || order.product?.image || '', status: order.status, fulfilment: order.productDelivery?.status || '', createdAt: order.createdAt.toISOString(), total: legacyNumber(order.totalMinor, normalizeCurrency(order.currency)), currency: normalizeCurrency(order.currency) })) },
    inbox: { unread: unreadNotifications, messages: unreadMessages, tickets: openTickets, recent: notifications.map((n) => ({ id: n.id, title: n.titleFa, body: n.bodyFa, href: n.href, read: !!n.readAt, createdAt: n.createdAt.toISOString(), kind: n.kind })) },
    community, games, prompts: on('prompt-master') ? await memberPromptWorkspace(userId) : null,
    favorites: { count: favoriteCount, recent: favoriteRows.flatMap((row) => { const card = isItemType(row.itemType) ? cards.get(itemKey({ type: row.itemType, id: row.itemId })) : undefined; return card ? [{ title: card.title, url: card.url, image: card.image, type: card.type }] : [] }) },
    activity: { days, counts: days.map((d) => counts.get(d)!) },
  }
}
