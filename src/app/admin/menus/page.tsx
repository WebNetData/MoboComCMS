'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import Icon from '@/components/site/Icon'
import MenuTreeEditor from '@/components/admin/MenuTreeEditor'
import MenuSectionPicker from '@/components/admin/MenuSectionPicker'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import MegaMenuManager from '../mega-menu/MegaMenuManager'
import { identifyMenu, identifySiteMenus, DEFAULT_FOOTER_ACCOUNT, MENU_ITEMS } from '@/modules/site/config/menus'
import type { SiteConfig, SiteLink } from '@/modules/site/config/types'
import styles from './menus.module.css'

type Tab = 'header' | 'sections' | 'footer' | 'pages'
type PageRow = { id: number; slug: string; title: string; status: string; showInNav: boolean }
const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: 'header', label: 'منوی هدر', icon: 'layout', hint: 'نوار اصلی بالای همهٔ صفحه‌ها، با زیرمنو و مگامنو' },
  { id: 'sections', label: 'نوار بخش‌ها و مگامنو', icon: 'grid', hint: 'نوار هر بخش (فروشگاه، موزیک…) با دسته‌ها و پنل مگامنو' },
  { id: 'footer', label: 'فوتر', icon: 'layers', hint: 'ستون‌های لینک پایین همهٔ صفحه‌ها' },
  { id: 'pages', label: 'صفحه‌های خودکار', icon: 'file', hint: 'صفحه‌هایی که خودبه‌خود به منوی هدر اضافه می‌شوند' },
]
const FOOTER_LISTS: { key: 'footer' | 'footerExplore' | 'footerAccount'; title: string; where: string; independent?: boolean }[] = [
  { key: 'footer', title: 'لینک‌های پشتیبانی', where: 'ستون «راهنما و همراهی» در فوتر' },
  { key: 'footerExplore', title: 'دنیای موبوکام', where: 'ستون «دنیای موبوکام» در فوتر؛ اگر مستقل نباشد، همان منوی هدر است', independent: true },
  { key: 'footerAccount', title: 'فضای شخصی', where: 'ستون «فضای شخصی شما» در فوتر', independent: true },
]
const count = (items: SiteLink[]): number => items.reduce((sum, item) => sum + 1 + count(item.children || []), 0)
const fa = (value: number) => value.toLocaleString('fa-IR')

/**
 * One place for every menu of the site (owner, 2026-10-28: "menu management is confusing; full, advanced and tidy").
 * A map of the page shows where each menu sits; each tab edits one of them through its existing owner:
 * the header and footer lists live in the site settings (published together, with history and the revision claim),
 * the section bars keep their own settings and save, and a page joins the header by its own «نمایش در منو» flag.
 */
export default function MenusPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('header')
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [revision, setRevision] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [pagesError, setPagesError] = useState('')
  const [savingPage, setSavingPage] = useState(0)

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    if (asked && TABS.some((item) => item.id === asked)) setTab(asked as Tab)
    const controller = new AbortController()
    fetch('/api/admin/site', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (!response.ok) { setNotice({ text: body?.error || 'دریافت منوها ممکن نشد؛ دسترسی مدیریت تنظیمات لازم است.', error: true }); return }
      setConfig(identifySiteMenus(body.config)); setRevision(body.revision)
    }).catch(() => { if (!controller.signal.aborted) setNotice({ text: 'ارتباط برقرار نشد', error: true }) })
    fetch('/api/admin/cms?type=pages', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (!response.ok) { setPagesError('برای دیدن و تغییر صفحه‌ها دسترسی مدیریت صفحه‌ها لازم است.'); return }
      // The unpaged list is a plain array; a paged one is { rows }.
      setPages((Array.isArray(body) ? body : body?.rows || []).map((row: PageRow) => ({ id: row.id, slug: row.slug, title: row.title, status: row.status, showInNav: row.showInNav })))
    }).catch(() => { if (!controller.signal.aborted) setPagesError('ارتباط برقرار نشد') })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  function open(next: Tab) {
    setTab(next)
    const url = new URL(window.location.href); url.searchParams.set('tab', next); window.history.replaceState(null, '', url)
  }
  function change(next: SiteConfig) { setConfig(next); setDirty(true); setNotice(null) }
  async function publish() {
    if (!config || busy) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/admin/site', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify(config) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw Error(response.status === 409 ? 'تنظیمات سایت در این فاصله جای دیگری تغییر کرده است؛ صفحه را تازه کنید و دوباره تغییر دهید.' : body?.error || 'انتشار ممکن نشد')
      setRevision(body.revision); setDirty(false); setNotice({ text: 'منوها منتشر شد و روی سایت دیده می‌شود.', error: false }); router.refresh()
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'انتشار ممکن نشد', error: true }) }
    finally { setBusy(false) }
  }
  async function togglePage(page: PageRow, showInNav: boolean) {
    // The switch moves at once and goes back if the page could not be saved.
    const set = (value: boolean) => setPages((rows) => rows?.map((row) => (row.id === page.id ? { ...row, showInNav: value } : row)) || null)
    set(showInNav); setSavingPage(page.id); setPagesError('')
    const response = await fetch('/api/admin/cms?type=pages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: page.id, showInNav }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setSavingPage(0)
    if (!response?.ok) { set(page.showInNav); setPagesError(body?.error || 'تغییر صفحه ذخیره نشد'); return }
    set(!!body?.showInNav)
  }

  if (!config) return <div className={styles.page} dir="rtl">{notice ? <div className={`${styles.notice} ${styles.isError}`} role="alert">{notice.text}</div> : <div className="sh-skeleton" aria-busy="true" />}</div>

  const headerLinks = count(config.navigation), headerRoots = config.navigation.length
  const automatic = (pages || []).filter((page) => page.showInNav && page.status === 'PUBLISHED')
  const counts: Record<Tab, string> = {
    header: `${fa(headerLinks)} لینک`,
    sections: 'جداگانه ذخیره می‌شود',
    footer: `${fa(count(config.footer) + count(config.footerExplore || []) + count(config.footerAccount || []))} لینک`,
    pages: config.automaticPageLinks === false ? 'خاموش' : `${fa(automatic.length)} صفحه`,
  }
  const editsSite = tab !== 'sections'

  return <div className={styles.page} dir="rtl">
    <header className={styles.hero}>
      <div><span className={styles.eyebrow}>ناوبری سایت</span><h1>مدیریت منوها</h1><p>همهٔ منوهای سایت در یک‌جا: روی هر قسمت از نقشهٔ زیر بزنید تا تنظیماتش باز شود.</p></div>
      <div className={styles.heroActions}><SectionSettingsHistoryLink section="site" /><Link href="/" target="_blank" className="btn btn-ghost">مشاهدهٔ سایت ↗</Link></div>
    </header>

    {/* where each menu sits on a page of the site */}
    <div className={styles.siteMap} role="group" aria-label="جای هر منو در صفحه‌های سایت">
      <button type="button" className={`${styles.zone} ${styles.zoneHeader}`} aria-pressed={tab === 'header' || tab === 'pages'} onClick={() => open('header')}><Icon name="layout" size={18} /><b>منوی هدر</b><small>{fa(headerRoots)} مورد اصلی · {counts.header}</small></button>
      <button type="button" className={`${styles.zone} ${styles.zoneSections}`} aria-pressed={tab === 'sections'} onClick={() => open('sections')}><Icon name="grid" size={18} /><b>نوار بخش‌ها و مگامنو</b><small>زیر هدر، داخل هر بخش</small></button>
      <div className={styles.zoneBody} aria-hidden="true"><i /><i /><i /></div>
      <button type="button" className={`${styles.zone} ${styles.zoneFooter}`} aria-pressed={tab === 'footer'} onClick={() => open('footer')}><Icon name="layers" size={18} /><b>فوتر</b><small>{FOOTER_LISTS.map((list) => list.title).join(' · ')}</small></button>
    </div>

    <div className={styles.tabs} role="tablist" aria-label="منوها" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = TABS.findIndex((item) => item.id === tab), rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
      const step = (event.key === 'ArrowLeft') === rtl ? 1 : -1
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + step + TABS.length) % TABS.length
      open(TABS[next].id); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
    }}>{TABS.map((item) => <button key={item.id} type="button" role="tab" id={`menus-tab-${item.id}`} aria-controls="menus-panel" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => open(item.id)}><Icon name={item.icon} size={18} /><span><b>{item.label}</b><small>{counts[item.id]}</small></span></button>)}</div>

    {notice && <div className={`${styles.notice}${notice.error ? ` ${styles.isError}` : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}

    <div id="menus-panel" role="tabpanel" aria-labelledby={`menus-tab-${tab}`} className={styles.panel}>
      <p className={styles.hint}>{TABS.find((item) => item.id === tab)!.hint}</p>

      {tab === 'header' && <div className={styles.split}>
        <section className={styles.card} aria-labelledby="menus-header-title">
          <header className={styles.cardHead}><h2 id="menus-header-title">منوی اصلی هدر</h2><p>هر مورد را باز کنید تا عنوان، نشانی، آیکن، نمایش و زیرمنوهایش را تغییر دهید؛ برای هر مورد اصلی نوع زیرمنو (کشویی یا مگامنو) را انتخاب کنید. پنهان کردن یک مورد، زیرمنوهایش را هم پنهان می‌کند.</p></header>
          <fieldset disabled={busy} className={styles.fieldset}>
            <MenuSectionPicker value={config.navigation} onChange={(navigation) => change({ ...config, navigation })} onBusy={setImporting} disabled={importing} />
            <MenuTreeEditor value={config.navigation} presentation="navigation" onChange={(navigation) => change({ ...config, navigation })} />
          </fieldset>
        </section>
        <aside className={styles.aside}>
          <section className={styles.card} aria-labelledby="menus-glance"><h3 id="menus-glance">در یک نگاه</h3>
            <ul className={styles.stats}><li><b>{fa(headerRoots)}</b><small>مورد اصلی</small></li><li><b>{fa(headerLinks)}</b><small>از {fa(MENU_ITEMS)} لینک مجاز</small></li><li><b>{fa(config.navigation.filter((item) => item.menuDisplay === 'mega').length)}</b><small>مگامنو</small></li><li><b>{fa(config.navigation.filter((item) => item.enabled === false).length)}</b><small>پنهان</small></li></ul>
            <div className={styles.meter} aria-hidden="true"><span style={{ width: `${Math.min(100, (headerLinks / MENU_ITEMS) * 100)}%` }} /></div>
          </section>
          <section className={styles.card} aria-labelledby="menus-auto"><h3 id="menus-auto">صفحه‌های خودکار در هدر</h3>
            <p>{config.automaticPageLinks === false ? 'افزودن خودکار صفحه‌ها خاموش است.' : automatic.length ? `این صفحه‌ها خودکار به انتهای هدر اضافه می‌شوند: ${automatic.map((page) => `«${page.title}»`).join('، ')}` : 'هیچ صفحه‌ای خودکار به هدر اضافه نمی‌شود.'}</p>
            <button type="button" className="btn btn-ghost" onClick={() => open('pages')}>مدیریت صفحه‌های خودکار</button>
          </section>
          <section className={styles.card}><h3>راهنما</h3><ul className={styles.tips}><li>«افزودن کامل یک بخش» دسته‌ها و زیردسته‌های یک بخش را یک‌جا اضافه می‌کند و لینک‌های فعلی را نگه می‌دارد.</li><li>تغییرات تا «انتشار منوها» فقط پیش‌نویس‌اند.</li><li>هر نسخهٔ منتشرشده در «تاریخچه و بازگردانی» می‌ماند.</li></ul></section>
        </aside>
      </div>}

      {tab === 'sections' && <MegaMenuManager embedded />}

      {tab === 'footer' && <div className={styles.footerGrid}>{FOOTER_LISTS.map((list) => {
        const value = config[list.key], own = list.key === 'footer' || value !== undefined
        return <section className={styles.card} key={list.key} aria-labelledby={`menus-${list.key}`}>
          <header className={styles.cardHead}><h2 id={`menus-${list.key}`}>{list.title}</h2><p>{list.where}</p></header>
          {list.independent && <label className="sh-check"><input type="checkbox" checked={own} disabled={busy} onChange={(event) => change({ ...config, [list.key]: event.target.checked ? identifyMenu(structuredClone(list.key === 'footerExplore' ? config.navigation : DEFAULT_FOOTER_ACCOUNT)) : undefined })} />فهرست مستقل {list.key === 'footerExplore' ? '(جدا از منوی هدر)' : ''}</label>}
          {own ? <fieldset disabled={busy} className={styles.fieldset}><MenuTreeEditor value={value || []} onChange={(items) => change({ ...config, [list.key]: items })} /></fieldset> : <p className={styles.muted}>{list.key === 'footerExplore' ? 'این ستون همان منوی هدر را نشان می‌دهد.' : 'این ستون فهرست پیش‌فرض حساب کاربری را نشان می‌دهد.'}</p>}
        </section>
      })}</div>}

      {tab === 'pages' && <section className={styles.card} aria-labelledby="menus-pages-title">
        <header className={styles.cardHead}><h2 id="menus-pages-title">صفحه‌هایی که خودکار به هدر اضافه می‌شوند</h2><p>صفحه‌ای که «نمایش در منوی هدر» داشته باشد، بعد از موارد منوی اصلی در هدر می‌آید. برای جای دقیق یا زیرمنو، صفحه را خاموش کنید و آن را به منوی هدر اضافه کنید.</p></header>
        <label className="sh-check"><input type="checkbox" checked={config.automaticPageLinks !== false} disabled={busy} onChange={(event) => change({ ...config, automaticPageLinks: event.target.checked })} />افزودن خودکار صفحه‌ها به هدر (با «انتشار منوها» اعمال می‌شود)</label>
        {pagesError && <div className={`${styles.notice} ${styles.isError}`} role="alert">{pagesError}</div>}
        {pages && <ul className={styles.pages}>{pages.map((page) => <li key={page.id} className={page.showInNav ? styles.pageOn : ''}>
          <span><b>{page.title}</b><small dir="ltr">/p/{page.slug}</small>{page.status !== 'PUBLISHED' && <em>پیش‌نویس؛ در سایت دیده نمی‌شود</em>}</span>
          <label className={styles.switch}><input type="checkbox" checked={page.showInNav} disabled={savingPage === page.id || config.automaticPageLinks === false} onChange={(event) => void togglePage(page, event.target.checked)} /><span>{savingPage === page.id ? 'در حال ذخیره…' : page.showInNav ? 'در هدر' : 'خارج از هدر'}</span></label>
          <Link href={`/admin/pages?edit=${page.id}`} className={styles.pageEdit}>ویرایش صفحه</Link>
        </li>)}</ul>}
        {!pages && !pagesError && <div className="sh-skeleton" aria-busy="true" />}
        <p className={styles.muted}>تغییر هر صفحه همان لحظه ذخیره می‌شود.</p>
      </section>}
    </div>

    {editsSite && <div className={`${styles.saveBar}${dirty ? ` ${styles.isDirty}` : ''}`}>
      <span role="status">{busy ? 'در حال انتشار…' : dirty ? 'تغییرات منتشرنشده دارید' : 'منوها با سایت یکی است'}</span>
      <button type="button" className="btn btn-primary" disabled={!dirty || busy || importing} onClick={() => void publish()}>{busy ? 'در حال انتشار…' : 'انتشار منوها'}</button>
    </div>}
  </div>
}
