import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import SectionMegaBar from '@/components/site/SectionMegaBar'
import { getSectionBar } from '@/modules/navigation/server/megamenu'
import type { MegaSection } from '@/modules/navigation/domain/megamenu'
import LiveSearchInput from '@/components/search/LiveSearchInput'
import PromoSlot from '@/components/promo/PromoSlot'

const BAR_SECTIONS: readonly MegaSection[] = ['music', 'cinema', 'games', 'software', 'forum']
// Sections that carry the site's promotion placements above and below their content.
const PROMO_SECTIONS: readonly string[] = ['music', 'cinema', 'games', 'software']

export type SectionNavItem = { href: string; label: string; key: string }

/**
 * Page chrome for the music / cinema / games / software / forum sections: theme-builder header and
 * footer (a template targeting the section wins), plus the section's own menu bar: its main
 * categories with mega panels (falls back to the simple sub-menu when the bar is off).
 */
export default async function MediaShell({ section, active, nav, children, search }: { section: 'music' | 'cinema' | 'games' | 'vip' | 'software' | 'forum' | 'search' | 'compare' | 'favorites' | 'copyright' | 'community'; active?: string; nav?: SectionNavItem[]; children: ReactNode; search?: { action: string; placeholder: string; value?: string } }) {
  const barSection: MegaSection | null = (BAR_SECTIONS as readonly string[]).includes(section) ? (section as MegaSection) : null
  const [locale, theme, navPages, bar] = await Promise.all([getServerLocale(), getServerTheme(), getPublicNavigationPages(), barSection ? getSectionBar(barSection).catch(() => null) : null])
  const context = { route: 'section' as const, sectionSlug: section }
  return (
    <>
      <ThemeHeader context={context} theme={theme} locale={locale} navPages={navPages} />
      <main className={`md-page md-${section === 'search' ? 'search-results' : section}`}>
        {bar ? <SectionMegaBar bar={bar} searchValue={search?.value} /> : nav && (
          <div className="md-subnav-wrap">
            <nav className="md-subnav container" aria-label={section}>
              <div className="md-subnav-links">{nav.map((item) => <Link key={item.key} href={item.href} className={active === item.key ? 'is-active' : ''} aria-current={active === item.key ? 'page' : undefined}>{item.label}</Link>)}</div>
              {search && (
                <form action={search.action} className="md-search" role="search">
                  <LiveSearchInput action={search.action} defaultValue={search.value} placeholder={search.placeholder} />
                  <button type="submit" aria-label="search">⌕</button>
                </form>
              )}
            </nav>
          </div>
        )}
        {PROMO_SECTIONS.includes(section) && <PromoSlot placement="content-top" />}
        {children}
        {PROMO_SECTIONS.includes(section) && <PromoSlot placement="content-bottom" />}
      </main>
      <ThemeFooter context={context} locale={locale} navPages={navPages} />
    </>
  )
}
