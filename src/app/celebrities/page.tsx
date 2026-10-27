import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import ManageBar from '@/components/admin/ManageBar'
import { isModuleEnabled } from '@/extensions/server/modules'
import { listLabels } from '@/modules/vocabulary/server/vocabulary'
import { celebrityCounts, celebrityDirectory, ensureCelebritiesSynced, featuredCelebrities, type CelebritySection, type CelebritySort } from '@/modules/celebrities/server/celebrities'
import CelebrityCardView, { FeaturedCelebrity } from '@/components/celebrities/CelebrityCard'
import { CELEBRITY_ROLES, parseCelebrityRole, type CelebrityRole } from '@/modules/celebrities/domain/celebrities'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { q?: string; role?: string; page?: string; section?: string; sort?: string; letter?: string }
const fa = (value: number) => value.toLocaleString('fa-IR')
const LETTERS = 'آ ا ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی'.split(' ')
const SORTS: [CelebritySort, string][] = [['known', 'سرشناس‌ترین'], ['new', 'تازه‌ترین'], ['name', 'الفبا']]

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  const section = p.section === 'cinema' ? 'سینما' : p.section === 'music' ? 'موسیقی' : ''
  return {
    title: section ? `چهره‌های ${section}` : 'چهره‌ها — بازیگران، کارگردانان و خوانندگان',
    description: 'همهٔ چهره‌های فیلم، سریال و موسیقی در یک جا: بازیگران، کارگردانان، تهیه‌کنندگان، خوانندگان و آهنگسازان، با فیلم‌ها، سریال‌ها، آلبوم‌ها و آهنگ‌هایشان.',
    alternates: { canonical: toPublicPath(section ? `/celebrities?section=${p.section}` : '/celebrities') },
    robots: p.q || p.page || p.letter || p.sort || p.role ? { index: false } : undefined,
  }
}

export default async function CelebritiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [cinema, music] = await Promise.all([isModuleEnabled('cinema'), isModuleEnabled('music')])
  if (!cinema && !music) notFound()
  await ensureCelebritiesSynced()
  const p = await searchParams
  const { role, creditRole } = parseCelebrityRole(p.role)
  const section: CelebritySection = p.section === 'cinema' && cinema ? 'cinema' : p.section === 'music' && music ? 'music' : ''
  const sort: CelebritySort = p.sort === 'new' || p.sort === 'name' ? p.sort : 'known'
  const letter = p.letter === 'en' || LETTERS.includes(String(p.letter)) ? String(p.letter) : ''
  const labels = music ? await listLabels('music').catch(() => ({} as Record<string, Record<string, string>>)) : {}
  const creditNames = labels.CREDIT_ROLE ?? {}
  const creditCodes = music ? Object.keys(creditNames).slice(0, 8) : []
  const plain = !p.q && !role && !creditRole && !letter && !section && (!p.page || p.page === '1')
  const [result, counts, featured] = await Promise.all([
    celebrityDirectory({ q: p.q, role, creditRole, page: p.page, section, sort, letter }, creditNames),
    celebrityCounts(creditCodes),
    plain ? featuredCelebrities(creditNames) : Promise.resolve([]),
  ])
  const current = p.role && (role || creditRole) ? String(p.role) : ''
  const link = (patch: Partial<Search>) => {
    const merged: Search = { q: result.q, role: current, section, sort: sort === 'known' ? '' : sort, letter, ...patch }
    const next = new URLSearchParams()
    for (const key of ['q', 'section', 'role', 'sort', 'letter'] as const) if (merged[key]) next.set(key, String(merged[key]))
    if (patch.page && patch.page !== '1') next.set('page', patch.page)
    const text = next.toString()
    return `/celebrities${text ? `?${text}` : ''}`
  }
  // The role chips of the section in view, each with how many people it holds.
  const roleChips: [string, string, number][] = [
    ...(Object.entries(CELEBRITY_ROLES) as [CelebrityRole, (typeof CELEBRITY_ROLES)[CelebrityRole]][])
      .filter(([, item]) => (item.source === 'cinema' ? cinema && section !== 'music' : music && section !== 'cinema'))
      .map(([key, item]) => [key, item.plural, counts.roles[key]] as [string, string, number]),
    ...(section !== 'cinema' ? creditCodes.map((code) => [`credit-${code}`, creditNames[code], counts.credits[code]] as [string, string, number]) : []),
  ].filter(([, , count]) => count > 0)
  const figures: [number, string][] = [[counts.all, 'چهره'], [counts.roles.actor, 'بازیگر'], [counts.roles.director, 'کارگردان'], [counts.roles.singer, 'خواننده']]
  const stats = figures.filter(([value]) => value > 0)
  const nav = [{ key: 'all', href: '/celebrities', label: 'همهٔ چهره‌ها' }, ...(cinema ? [{ key: 'cinema', href: '/celebrities?section=cinema', label: 'سینما و سریال' }] : []), ...(music ? [{ key: 'music', href: '/celebrities?section=music', label: 'موسیقی' }] : [])]
  const pages = Array.from({ length: result.pages }, (_, index) => index + 1).filter((n) => n === 1 || n === result.pages || Math.abs(n - result.page) <= 2)
  return <MediaShell section="celebrities" active={section || 'all'} nav={nav} search={{ action: '/celebrities', placeholder: 'جست‌وجوی بازیگر، کارگردان، خواننده…', value: result.q }}>
    <ManageBar title="مدیریت چهره‌ها" anyOf={['cinema.manage', 'music.manage']} links={[{ href: '/admin/celebrities', label: 'هنرمندان و چهره‌ها' }]} />
    <div className="container cb-page">
      <header className="cb-hero">
        <div className="cb-hero-copy">
          <span className="cb-kicker">{section === 'cinema' ? 'چهره‌های سینما و سریال' : section === 'music' ? 'چهره‌های موسیقی' : 'چهره‌ها'}</span>
          <h1>{section === 'cinema' ? 'بازیگران، کارگردانان و سازندگان' : section === 'music' ? 'خوانندگان، آهنگسازان و ترانه‌سرایان' : 'همهٔ چهره‌های فیلم، سریال و موسیقی'}</h1>
          <p>هر هنرمند یک صفحه دارد با همهٔ کارهایش در هر دو بخش؛ خواننده‌ای که بازی کرده یا کارگردانی که در فیلم خودش بازی کرده، همه یک‌جا.</p>
          <form action="/celebrities" method="get" role="search" className="cb-hero-search">
            {section && <input type="hidden" name="section" value={section} />}
            <input type="search" name="q" defaultValue={result.q} aria-label="جست‌وجوی چهره" placeholder="نام بازیگر، کارگردان یا خواننده…" maxLength={60} />
            <button type="submit">جست‌وجو</button>
          </form>
        </div>
        {stats.length > 0 && <ul className="cb-hero-stats" aria-label="چهره‌ها در یک نگاه">{stats.map(([value, label]) => <li key={label}><b>{fa(value)}</b><small>{label}</small></li>)}</ul>}
      </header>

      {featured.length > 0 && <section className="cb-featured" aria-labelledby="cb-featured-title">
        <header className="cb-section-head"><h2 id="cb-featured-title">چهره‌های برگزیده</h2></header>
        <div className="cb-featured-track">{featured.map((person) => <FeaturedCelebrity key={person.id} person={person} />)}</div>
      </section>}

      <div className="cb-toolbar">
        {roleChips.length > 0 && <nav className="cb-roles" aria-label="نقش">
          <Link href={link({ role: '', page: '' })} className={current ? '' : 'is-on'} aria-current={current ? undefined : 'true'}>همه <small>{fa(section === 'cinema' ? counts.cinema : section === 'music' ? counts.music : counts.all)}</small></Link>
          {roleChips.map(([key, label, count]) => <Link key={key} href={link({ role: key, page: '' })} className={current === key ? 'is-on' : ''} aria-current={current === key ? 'true' : undefined}>{label} <small>{fa(count)}</small></Link>)}
        </nav>}
        <div className="cb-tools">
          <nav className="cb-sorts" aria-label="مرتب‌سازی">{SORTS.map(([key, label]) => <Link key={key} href={link({ sort: key === 'known' ? '' : key, page: '' })} className={sort === key ? 'is-on' : ''} aria-current={sort === key ? 'true' : undefined}>{label}</Link>)}</nav>
          <span className="cb-count"><b>{fa(result.total)}</b> چهره</span>
        </div>
        <nav className="cb-letters" aria-label="حرف اول نام">
          <Link href={link({ letter: '', page: '' })} className={letter ? '' : 'is-on'}>همه</Link>
          {LETTERS.map((char) => <Link key={char} href={link({ letter: char, page: '' })} className={letter === char ? 'is-on' : ''} aria-current={letter === char ? 'true' : undefined}>{char}</Link>)}
          <Link href={link({ letter: 'en', page: '' })} className={letter === 'en' ? 'is-on' : ''} aria-label="نام‌های لاتین">A–Z</Link>
        </nav>
      </div>

      {result.people.length
        ? <div className="cb-grid">{result.people.map((person) => <CelebrityCardView key={person.id} person={person} />)}</div>
        : <p className="cb-empty">{result.q ? `چهره‌ای با نام «${result.q}» پیدا نشد.` : 'چهره‌ای با این انتخاب‌ها پیدا نشد.'}</p>}
      {result.pages > 1 && <nav className="cb-pager" aria-label="صفحه‌بندی">
        {result.page > 1 && <Link href={link({ page: String(result.page - 1) })} rel="prev">قبلی</Link>}
        {pages.map((n, index) => <span key={n} className="cb-pager-item">{index > 0 && n - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Link href={link({ page: String(n) })} className={n === result.page ? 'is-on' : ''} aria-current={n === result.page ? 'page' : undefined}>{fa(n)}</Link></span>)}
        {result.page < result.pages && <Link href={link({ page: String(result.page + 1) })} rel="next">بعدی</Link>}
      </nav>}
    </div>
  </MediaShell>
}
