import { db } from '@/platform/database/prisma'
import { activeLists } from '@/modules/vocabulary/server/vocabulary'
import { CELEBRITY_ROLES } from '@/modules/celebrities/domain/celebrities'
import type { MegaColumn, MegaLink, SectionBarItem } from '@/modules/navigation/domain/megamenu'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { siteLinkDisabled } from '@/modules/site/config/visibility'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isModuleEnabled } from '@/extensions/server/modules'

const item = (key: string, label: string, href: string, icon: string): SectionBarItem => ({ key, label, href, icon, columns: [], features: [] })

/** The same public owner lists as the sections, never private records or new taxonomies. */
export const additionalSectionSources = {
  /**
   * The home bar is the site's hub (owner, 2026-10-28: "complete the home navbar"): discover, shop, community and
   * help, each a dropdown of the site's own pages, then the company pages. A link to a section that is off (or the
   * shop while it is off) is left out, and a dropdown left empty is dropped.
   */
  async home() {
    const [pages, legal, runtime, storeOn] = await Promise.all([
      db.page.findMany({ where: { status: 'PUBLISHED', OR: [{ slug: { in: ['about', 'contact'] } }, { showInNav: true }] }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, slug: true, title: true } }),
      db.page.findMany({ where: { status: 'PUBLISHED', slug: { in: ['faq', 'terms', 'refund', 'privacy'] } }, select: { slug: true, title: true } }),
      getPublicExtensionRuntime(), isStoreEnabled().catch(() => false),
    ])
    const on = (href: string) => !siteLinkDisabled(href, runtime) && (storeOn || !/^\/(?:products|cart|track|compare)(?:[/?#]|$)/.test(href))
    const links = (rows: [string, string, string][]): MegaLink[] => rows.filter(([, href]) => on(href)).map(([label, href, icon]) => ({ label, href, icon }))
    const column = (title: string, icon: string, rows: [string, string, string][]): MegaColumn[] => { const kept = links(rows); return kept.length ? [{ title, icon, links: kept }] : [] }
    const page = (slug: string) => legal.find(row => row.slug === slug)
    const hub = (key: string, label: string, href: string, icon: string, columns: MegaColumn[]): SectionBarItem[] => (columns.length ? [{ ...item(key, label, on(href) ? href : columns[0].links[0].href, icon), columns }] : [])
    const items = [
      ...hub('home-discover', 'کشف کنید', '/search', 'sparkles', [
        ...column('پرطرفدار', 'star', [['تقویم انتشار بازی', '/games/calendar', 'gamepad'], ['فیلم‌ها و سریال‌های تازه', '/cinema', 'film'], ['آهنگ‌های تازه', '/music', 'music'], ['آخرین نرم‌افزارها', '/software/browse', 'devices'], ['تازه‌های مجله', '/blog', 'book']]),
        ...column('مجموعه‌ها و ابزارها', 'layers', [['مجموعه‌های منتخب', '/collections', 'grid'], ['مقایسهٔ محصولات', '/compare', 'sliders'], ['علاقه‌مندی‌های من', '/favorites', 'heart'], ['جست‌وجوی پیشرفته', '/search', 'search']]),
      ]),
      ...hub('home-shop', 'خرید', '/products', 'bag', [
        ...column('فروشگاه', 'store', [['همهٔ محصولات', '/products', 'bag'], ['سبد خرید', '/cart', 'cart'], ['پیگیری سفارش', '/track', 'box'], ['باشگاه ویژه (VIP)', '/vip', 'crown']]),
        ...column('دانلود و کتابخانه', 'folder', [['بازی‌ها', '/games', 'gamepad'], ['نرم‌افزارها', '/software', 'devices'], ['مخزن فایل', '/repository', 'database']]),
      ]),
      ...hub('home-community', 'جامعه', '/feed', 'users', [
        ...column('گفت‌وگو و دنبال‌کردن', 'chat', [['تازه‌های جامعه', '/feed', 'rss'], ['تالار گفت‌وگو', '/forum', 'chat'], ['افراد', '/people', 'users']]),
        ...column('چهره‌ها و کسب‌وکارها', 'star', [['هنرمندان', '/celebrities', 'star'], ['کسب‌وکارها و نظرها', '/businesses', 'globe']]),
      ]),
      ...hub('home-help', 'راهنما و پشتیبانی', '/dashboard/tickets', 'lifebuoy', [
        ...column('کمک', 'lifebuoy', [['پشتیبانی و تیکت', '/dashboard/tickets', 'ticket'], ...(page('faq') ? [[page('faq')!.title, '/p/faq', 'book'] as [string, string, string]] : []), ['خبرنامه', '/newsletter', 'mail']]),
        ...column('قوانین و همکاری', 'shield', [...(page('terms') ? [[page('terms')!.title, '/p/terms', 'shield'] as [string, string, string]] : []), ...(page('refund') ? [[page('refund')!.title, '/p/refund', 'receipt'] as [string, string, string]] : []), ...(page('privacy') ? [[page('privacy')!.title, '/p/privacy', 'lock'] as [string, string, string]] : []), ['تبلیغات در موبوکام', '/advertise', 'megaphone']]),
      ]),
      ...pages.map(p => item(`c${p.id}`, p.title, `/p/${p.slug}`, p.slug === 'contact' ? 'chat' : 'book')),
    ]
    const quick = links([['حساب من', '/dashboard', 'user'], ['پیگیری سفارش', '/track', 'box']]).map(({ label, href, icon }) => ({ label, href, icon }))
    return { nodes: pages.map(p => ({ id: p.id, parentId: null, slug: p.slug, label: p.title, href: `/p/${p.slug}`, icon: p.slug === 'contact' ? 'chat' : 'book' })), items, quick, searchCategories: [] }
  },
  async celebrities() {
    const [music, cinema] = await Promise.all([isModuleEnabled('music'), isModuleEnabled('cinema')])
    const credits = music ? (await activeLists('music')).CREDIT_ROLE || [] : []
    return { items: [
      ...Object.entries(CELEBRITY_ROLES).filter(([, row]) => row.source === 'music' ? music : cinema).map(([role, row]) => item(role, row.plural, `/celebrities?role=${role}`, 'users')),
      ...credits.map(credit => item(`credit-${credit.code}`, credit.name, `/celebrities?role=${encodeURIComponent('credit-'+credit.code)}`, credit.icon || 'music')),
    ], quick: [{ label: 'همهٔ هنرمندان', href: '/celebrities', icon: 'users' }, ...(music ? [{ label: 'چهره‌های موسیقی', href: '/celebrities?section=music', icon: 'music' }] : []), ...(cinema ? [{ label: 'چهره‌های سینما', href: '/celebrities?section=cinema', icon: 'film' }] : [])], searchCategories: [] }
  },
  async businesses() {
    const categories = (await activeLists('businesses')).CATEGORY || []
    const entries = categories.map(c => ({ id: c.id, parentId: null, slug: c.code, label: c.name, href: '/businesses?'+new URLSearchParams({ category: c.code }), icon: c.icon || 'bag' }))
    // Read-only seed fallback entries have id=0; their codes remain stable, never invent database ids.
    return { nodes: entries.filter(c => c.id > 0), items: entries.map(c => item(c.id > 0 ? `c${c.id}` : `business-${c.slug}`, c.label, c.href, c.icon)), quick: [{ label: 'همهٔ کسب‌وکارها', href: '/businesses', icon: 'globe' }, { label: 'فعالیت‌ها و درخواست‌های من', href: '/businesses/activity', icon: 'user' }], searchCategories: [] }
  },
}
