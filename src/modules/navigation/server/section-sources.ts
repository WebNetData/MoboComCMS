import { db } from '@/platform/database/prisma'
import { activeLists } from '@/modules/vocabulary/server/vocabulary'
import { CELEBRITY_ROLES } from '@/modules/celebrities/domain/celebrities'
import type { SectionBarItem } from '@/modules/navigation/domain/megamenu'
import { isModuleEnabled } from '@/extensions/server/modules'

const item = (key: string, label: string, href: string, icon: string): SectionBarItem => ({ key, label, href, icon, columns: [], features: [] })

/** The same public owner lists as the sections, never private records or new taxonomies. */
export const additionalSectionSources = {
  async home() {
    const pages = await db.page.findMany({ where: { status: 'PUBLISHED', OR: [{ slug: { in: ['about', 'contact'] } }, { showInNav: true }] }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, slug: true, title: true } })
    return { nodes: pages.map(p => ({ id: p.id, parentId: null, slug: p.slug, label: p.title, href: `/p/${p.slug}`, icon: p.slug === 'contact' ? 'chat' : 'book' })), items: pages.map(p => item(`c${p.id}`, p.title, `/p/${p.slug}`, p.slug === 'contact' ? 'chat' : 'book')), quick: [], searchCategories: [] }
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
