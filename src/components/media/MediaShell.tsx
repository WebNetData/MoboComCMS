import Link from 'next/link'
import type { ReactNode } from 'react'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'

export type SectionNavItem = { href: string; label: string; key: string }

/**
 * Page chrome for the music / cinema / games / software / forum sections: theme-builder header and
 * footer (a template targeting the section wins), plus the section's own sub-menu.
 */
export default async function MediaShell({ section, active, nav, children, search }: { section: 'music' | 'cinema' | 'games' | 'vip' | 'software' | 'forum' | 'search' | 'compare' | 'favorites' | 'copyright'; active?: string; nav?: SectionNavItem[]; children: ReactNode; search?: { action: string; placeholder: string; value?: string } }) {
  const [locale, theme, navPages] = await Promise.all([getServerLocale(), getServerTheme(), getPublicNavigationPages()])
  const context = { route: 'section' as const, sectionSlug: section }
  return (
    <>
      <ThemeHeader context={context} theme={theme} locale={locale} navPages={navPages} />
      <main className={`md-page md-${section}`}>
        {nav && (
          <div className="md-subnav-wrap">
            <nav className="md-subnav container" aria-label={section}>
              <div className="md-subnav-links">{nav.map((item) => <Link key={item.key} href={item.href} className={active === item.key ? 'is-active' : ''} aria-current={active === item.key ? 'page' : undefined}>{item.label}</Link>)}</div>
              {search && (
                <form action={search.action} className="md-search" role="search">
                  <input name="q" type="search" defaultValue={search.value} placeholder={search.placeholder} aria-label={search.placeholder} />
                  <button type="submit" aria-label="search">⌕</button>
                </form>
              )}
            </nav>
          </div>
        )}
        {children}
      </main>
      <ThemeFooter context={context} locale={locale} navPages={navPages} />
    </>
  )
}
