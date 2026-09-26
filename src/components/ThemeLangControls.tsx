'use client'

import { setCookieLang, setCookieTheme } from '@/platform/browser/preferences'
import { useSession } from 'next-auth/react'
import { useSite } from '@/components/site/SiteProvider'

export default function ThemeLangControls({ locale, theme, compact }: { locale: string; theme: string; compact?: boolean }) {
  const { status } = useSession()
  // Single-language sites (SITE_LOCALES=fa) show only the appearance switch.
  const bilingual = (useSite().locales?.length ?? 2) > 1
  async function switchTo(next: 'en' | 'fa') {
    if (status === 'authenticated') {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      }).catch(() => null)
      if (!response?.ok) return
    }
    setCookieLang(next)
    window.location.reload()
  }
  function toggleTheme() {
    setCookieTheme(theme === 'dark' ? 'light' : 'dark')
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={locale === 'fa' ? 'زبان و ظاهر' : 'Language and appearance'}>
      {bilingual && <button
        type="button"
        disabled={status === 'loading'}
        onClick={() => switchTo(locale === 'fa' ? 'en' : 'fa')}
        className="badge badge-gray preference-control"
        style={{ minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11 }}
        title={locale === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی'}
        aria-label={locale === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی'}
      >
        {!compact && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>}
        <span>{locale === 'fa' ? 'EN' : 'فا'}</span>
      </button>}
      <button
        type="button"
        onClick={toggleTheme}
        className="badge badge-gray preference-control"
        style={{ minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        title={locale === 'fa' ? (theme === 'dark' ? 'حالت روشن' : 'حالت تاریک') : (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
        aria-label={locale === 'fa' ? (theme === 'dark' ? 'فعال کردن حالت روشن' : 'فعال کردن حالت تاریک') : (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></> : <path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>}</svg>
      </button>
    </div>
  )
}
