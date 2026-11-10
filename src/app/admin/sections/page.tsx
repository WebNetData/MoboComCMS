'use client'

import Link from '@/components/AppLink'
import { Notice, useJson } from '../store/shared'
import type { Section } from './shared'

/** Every section (module with a public area): status, public address and a way into its own admin. */
export default function SectionsHubPage() {
  const { data, error } = useJson<{ sections: Section[] }>('/api/admin/sections')
  return <div className="sa" dir="rtl">
    <header className="sa-head"><div><h1>بخش‌های سایت</h1><p className="sa-hint">نام، آدرس، وضعیت و تنظیمات هر بخش از همین‌جا مدیریت می‌شود. با تغییر آدرس، آدرس‌های قدیمی خودکار به آدرس تازه منتقل می‌شوند و نام تازه همه‌جای سایت و مدیریت دیده می‌شود.</p></div><Link href="/admin/permalinks" className="btn btn-ghost">پیوندهای یکتا</Link><Link href="/admin/extensions" className="btn btn-ghost">افزونه‌ها و ماژول‌ها</Link></header>
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : <div className="sh-grid">{data.sections.map((section) => <article key={section.id} className={`sa-card sh-card${section.enabled ? '' : ' is-off'}`}>
      <header className="sh-card-head"><b>{section.name}</b>{section.customName?.fa && section.customName.fa !== section.defaultName && <small className="sa-sub">پیش‌فرض: {section.defaultName}</small>}<span className={`sa-state ${section.enabled ? 'is-ok' : ''}`}>{section.enabled ? 'فعال' : 'غیرفعال'}</span></header>
      <p className="sa-hint">{section.description}</p>
      <ul className="sh-addresses">{section.bases.map((row) => <li key={row.base}><bdi dir="ltr">{row.alias || row.base}</bdi>{row.alias && <small className="sa-sub">به‌جای <bdi dir="ltr">{row.base}</bdi></small>}</li>)}</ul>
      <div className="sa-row-actions"><Link href={`/admin/sections/${section.id}`} className="sa-link">نام، آدرس و تنظیمات</Link>{section.enabled && section.menu.items[0] && <Link href={section.menu.items[0].href} className="sa-link">ورود به مدیریت بخش</Link>}{section.enabled && section.bases[0] && <a href={section.bases[0].alias || section.bases[0].base} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a>}</div>
    </article>)}</div>}
  </div>
}
