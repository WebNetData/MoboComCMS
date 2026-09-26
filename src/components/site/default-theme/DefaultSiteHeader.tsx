'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import ThemeLangControls from '@/components/ThemeLangControls'
import { useSite } from '@/components/site/SiteProvider'
import { translate } from '@/modules/site/config/types'
import { PluginOutlet } from '@/plugins/registry'
import Icon from '@/components/site/Icon'
import { Breadcrumbs } from '@/components/content/ContentPrimitives'

interface NavPage {
  slug: string
  title: string
  titleEn: string
}

export default function DefaultSiteHeader({ theme, navPages, breadcrumbs }: { theme: string; navPages?: NavPage[]; breadcrumbs?: { label: string; href?: string }[] }) {
  const { data: session } = useSession()
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const site = useSite()

  const links: [string, string][] = site.navigation.map(l => [l.href, translate(l.label, locale)])

  const isOn = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <><PluginOutlet slot="site.before-header" site={site} locale={locale}/><header className="site-header">
      <div className="container flex items-center justify-between gap-3 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold whitespace-nowrap">
          <span className="brand-mark"><Icon name="shield"/></span>
          <span className="text-lg" dir="ltr">{site.brand}</span>
        </Link>

        <nav className="flex items-center only-desktop" style={{ gap: 'var(--sds-size-space-600)' }}>
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={`nav-link ${isOn(href) ? 'nav-link-on' : ''}`}>
              {label}
            </Link>
          ))}
          {navPages?.map((p) => (
            <Link key={p.slug} href={`/p/${p.slug}`} className={`nav-link ${isOn(`/p/${p.slug}`) ? 'nav-link-on' : ''}`}>
              {locale === 'fa' ? p.title : p.titleEn || p.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="only-desktop">
            <ThemeLangControls locale={locale} theme={theme} />
          </div>
          {session ? (
            <>
              <Link href="/dashboard" className="btn btn-ghost imp-px-3 only-desktop">{t.myPanel}</Link>
              <Link href="/dashboard" className="icon-btn only-mobile" aria-label={t.myPanel}>👤</Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm hover-text-danger only-desktop">
                {t.logout}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="muted text-sm hover-text-text only-desktop">{t.login}</Link>
              <Link href="/register" className="btn btn-primary imp-px-4">{t.register}</Link>
            </>
          )}
          <button
            className="icon-btn only-mobile"
            aria-label="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {open && (
        <div className="container only-mobile" style={{ paddingBottom: '1rem' }}>
          <div className="card flex flex-col gap-1">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`side-link ${isOn(href) ? 'side-link-active' : ''}`}
              >
                {label}
              </Link>
            ))}
            {navPages?.map((p) => (
              <Link key={p.slug} href={`/p/${p.slug}`} onClick={() => setOpen(false)} className="side-link">
                {locale === 'fa' ? p.title : p.titleEn || p.title}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-3 mt-3">
              <ThemeLangControls locale={locale} theme={theme} />
              {session ? (
                <button onClick={() => signOut({ callbackUrl: '/' })} className="muted text-sm">{t.logout}</button>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="btn btn-ghost imp-px-3">{t.login}</Link>
              )}
            </div>
          </div>
        </div>
      )}
      {breadcrumbs && <div className="header-breadcrumb-bar"><div className="container"><Breadcrumbs label={locale === 'fa' ? 'مسیر صفحه' : 'Breadcrumb'} items={breadcrumbs} /></div></div>}
    </header><PluginOutlet slot="site.after-header" site={site} locale={locale}/></>
  )
}
