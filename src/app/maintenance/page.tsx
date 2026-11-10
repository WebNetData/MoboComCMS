import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { MAINTENANCE_MODES, MAINTENANCE_SECTIONS, isMaintenanceSection, noticeOf, siteNoticeOf } from '@/modules/site/domain/maintenance'
import { getSiteSeo } from '@/modules/site/server/seo'
import SiteNotice from '@/components/site/maintenance/SiteNotice'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { sectionDisplayName } from '@/modules/site/server/section-names'
import './maintenance.css'

export const metadata: Metadata = { title: 'در حال به‌روزرسانی', robots: { index: false, follow: false } }

/**
 * What a visitor sees in place of a section that is in maintenance. The middleware shows this page
 * under the section's own address (the address bar does not change) with status 503. The words are
 * the owner's, shown as plain text.
 */
export default async function MaintenanceNotice({ searchParams }: { searchParams: Promise<{ section?: string; site?: string }> }) {
  const { section, site } = await searchParams
  const state = await loadMaintenance()
  if (site === '1') {
    const { design, effect, icon, reopensAt } = state.site
    const { title, message } = siteNoticeOf(state.site)
    return <SiteNotice title={title} message={message} design={design} effect={effect} icon={icon} reopensAt={reopensAt} name={(await getSiteSeo('fa')).name} />
  }
  const known = isMaintenanceSection(section) ? section : null
  const notice = noticeOf(known ? state[known] : { title: '', message: '' })
  const mode = known ? MAINTENANCE_MODES.find((item) => item.id === state[known].mode)?.label : null
  const entry = known ? MAINTENANCE_SECTIONS.find((item) => item.id === known) : null
  // The section's own name as the owner set it (Admin › sections), else the built-in label.
  const label = entry ? await sectionDisplayName(entry.plugin, true, { fa: entry.label }) : null
  return (
    <main className="mnt" dir="rtl">
      <div className="mnt-glow" aria-hidden="true" />
      <section className="mnt-card" aria-labelledby="mnt-title">
        <div className="mnt-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
            <circle className="mnt-ring" cx="60" cy="60" r="46" stroke="currentColor" strokeWidth="3" strokeDasharray="10 12" strokeLinecap="round" />
            <g className="mnt-gear">
              <circle cx="60" cy="60" r="14" stroke="currentColor" strokeWidth="5" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <rect key={angle} x="56.5" y="32" width="7" height="12" rx="2.5" fill="currentColor" transform={`rotate(${angle} 60 60)`} />)}
            </g>
          </svg>
        </div>
        {label ? <span className="mnt-chip">{label}{mode ? ` · ${mode}` : ''}</span> : null}
        <h1 id="mnt-title" className="mnt-title">{notice.title}</h1>
        <p className="mnt-text">{notice.message}</p>
        <div className="mnt-bar" role="presentation"><span /></div>
        <Link href="/" className="mnt-home">بازگشت به صفحهٔ اصلی</Link>
      </section>
    </main>
  )
}
