'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useControlNavigation } from '@/components/admin/navigation/ControlNavigation'
import { searchControlGroups } from '@/components/admin/navigation/groups'
import { configurationHistoryForHref } from '@/modules/content/domain/history-forms'
import styles from './controls.module.css'

export default function SiteManagementPage() {
  const { locale } = useI18n()
  const L = (fa: string, en: string) => locale === 'fa' ? fa : en
  const { groups, loading, failed, retry } = useControlNavigation()
  const [query, setQuery] = useState('')
  const [part, setPart] = useState('')
  const [withHistory, setWithHistory] = useState(false)
  const available = groups.map(group => ({ ...group, items: group.items.filter(item => item.href !== '/admin/site-management') })).filter(group => group.items.length)
  const parts = [...new Set(available.map(group => group.part).filter(Boolean))]
  const effectivePart = parts.includes(part) ? part : ''
  const matches = searchControlGroups(available, query, effectivePart).map(group => ({ ...group, items: group.items.filter(item => !withHistory || configurationHistoryForHref(item.href)) })).filter(group => group.items.length)
  const count = matches.reduce((total, group) => total + group.items.length, 0)
  const total = available.reduce((sum, group) => sum + group.items.length, 0)

  return <div className={styles.directory} aria-busy={loading}>
    <header className={styles.heading}>
      <span className={styles.mark} aria-hidden="true"><Icon name="sliders" size={28} /></span>
      <div><p className={styles.eyebrow}>{L('کنترل وب‌سایت', 'Website controls')}</p><h1>{L('مرکز مدیریت سایت', 'Website management')}</h1><p>{L('صفحه‌ها، ظاهر، محتوا و تنظیمات هر بخش را از یک جا پیدا کنید. ابزارها مطابق دسترسی شما و ماژول‌های فعال نمایش داده می‌شوند.', 'Find pages, appearance, content and settings in one place. Tools follow your permissions and active modules.')}</p></div>
    </header>

    {failed ? <div className="card" role="alert"><h2 className="h3">{L('فهرست ابزارها دریافت نشد', 'Controls could not be loaded')}</h2><p className="muted">{L('برای دریافت دسترسی‌ها و وضعیت فعلی بخش‌ها دوباره تلاش کنید.', 'Retry to load current permissions and section availability.')}</p><button className="btn btn-primary" type="button" onClick={retry}>{L('تلاش دوباره', 'Try again')}</button></div>
      : loading ? <div className={styles.pending} role="status" aria-live="polite">{L('در حال دریافت ابزارها و دسترسی‌ها…', 'Loading controls and permissions…')}</div>
      : <>
        <div className={styles.toolbar}>
          <label className={styles.search}><Icon name="search" size={20} /><span className="sr-only">{L('جست‌وجوی ابزارهای مدیریت', 'Search management tools')}</span><input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={L('مثلاً منو، فوتر، دسته‌بندی، کاربر…', 'Try menus, footer, categories, members…')} /></label>
          <label className={styles.select}><span id="control-area-label">{L('حوزهٔ مدیریت', 'Management area')}</span><select aria-labelledby="control-area-label" className="input" value={effectivePart} onChange={event => setPart(event.target.value)}><option value="">{L('همهٔ حوزه‌ها', 'All areas')}</option>{parts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <label className="sa-check"><input type="checkbox" checked={withHistory} onChange={e => setWithHistory(e.target.checked)} /> فقط ابزارهای دارای تاریخچهٔ تنظیمات</label>
        <div className={styles.results}><p role="status" aria-live="polite">{L(`${count.toLocaleString('fa-IR')} ابزار از ${total.toLocaleString('fa-IR')} ابزار در دسترس`, `${count} of ${total} available tools`)}</p>{(query || effectivePart || withHistory) && <button className="btn btn-ghost" type="button" onClick={() => { setQuery(''); setPart(''); setWithHistory(false) }}>{L('پاک کردن فیلترها', 'Clear filters')}</button>}</div>
        <div className={styles.grid}>{matches.map(group => <section className={`card ${styles.group}`} key={group.id} aria-labelledby={`controls-${group.id.replace(/[^a-z0-9-]/gi, '-')}`}>
          <header><span className={styles.groupIcon} aria-hidden="true"><Icon name={group.icon} size={21} /></span><div>{group.part && <p>{group.part}</p>}<h2 id={`controls-${group.id.replace(/[^a-z0-9-]/gi, '-')}`}>{group.title}</h2></div><span className={styles.count}>{group.items.length.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en')}</span></header>
          <ul>{group.items.map(item => <li key={item.href}><Link href={item.href}><Icon name={item.icon} size={18} /><span>{item.label}</span><span className={styles.arrow} aria-hidden="true">←</span></Link>{configurationHistoryForHref(item.href) && <Link className="text-sm" href={configurationHistoryForHref(item.href)!} aria-label={`تاریخچهٔ تنظیمات ${item.label}`}>تاریخچه و بازگردانی تنظیمات ←</Link>}</li>)}</ul>
        </section>)}</div>
        {!matches.length && <div className={styles.pending}><Icon name="search" size={28} /><h2>{L('ابزاری پیدا نشد', 'No tools found')}</h2><p>{L('نام کوتاه‌تری بنویسید یا فیلتر حوزه را بردارید.', 'Try a shorter search or clear the area filter.')}</p></div>}
        <p className={styles.note}><Icon name="shield" size={17} />{L('افزودن، ویرایش، حذف و نمایش هر مورد در ابزار همان بخش انجام می‌شود؛ محدودیت‌های دسترسی و حفاظت از داده‌ها برقرار است.', 'Add, edit, delete and visibility actions belong to each section’s tool, with its existing access and data protections.')}</p>
      </>}
  </div>
}
