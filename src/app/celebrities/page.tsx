import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import { isModuleEnabled } from '@/extensions/server/modules'
import { listLabels } from '@/modules/vocabulary/server/vocabulary'
import { celebrityDirectory, ensureCelebritiesSynced } from '@/modules/celebrities/server/celebrities'
import CelebrityCardView from '@/components/celebrities/CelebrityCard'
import { CELEBRITY_ROLES, parseCelebrityRole, type CelebrityRole } from '@/modules/celebrities/domain/celebrities'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { q?: string; role?: string; page?: string }
const fa = (value: number) => value.toLocaleString('fa-IR')

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  return {
    title: 'چهره‌ها — بازیگران، کارگردانان و خوانندگان',
    description: 'همهٔ چهره‌های فیلم، سریال و موسیقی در یک جا: بازیگران، کارگردانان، خوانندگان و آهنگسازان، با فیلم‌ها، سریال‌ها، آلبوم‌ها و آهنگ‌هایشان.',
    alternates: { canonical: toPublicPath('/celebrities') },
    robots: p.q || p.page ? { index: false } : undefined,
  }
}

export default async function CelebritiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [cinema, music] = await Promise.all([isModuleEnabled('cinema'), isModuleEnabled('music')])
  if (!cinema && !music) notFound()
  await ensureCelebritiesSynced()
  const p = await searchParams
  const { role, creditRole } = parseCelebrityRole(p.role)
  const labels = music ? await listLabels('music').catch(() => ({} as Record<string, Record<string, string>>)) : {}
  const creditNames = labels.CREDIT_ROLE ?? {}
  const result = await celebrityDirectory({ q: p.q, role, creditRole, page: p.page }, creditNames)
  const chips: [string, string][] = [['', 'همه'], ...(Object.entries(CELEBRITY_ROLES) as [CelebrityRole, (typeof CELEBRITY_ROLES)[CelebrityRole]][]).filter(([, item]) => (item.source === 'cinema' ? cinema : music)).map(([key, item]) => [key, item.plural] as [string, string]), ...(music ? Object.entries(creditNames).slice(0, 6).map(([code, name]) => [`credit-${code}`, name] as [string, string]) : [])]
  const current = p.role && (role || creditRole) ? p.role : ''
  const link = (patch: Partial<Search>) => { const next = new URLSearchParams(); const merged = { q: result.q, role: current, ...patch }; if (merged.q) next.set('q', merged.q); if (merged.role) next.set('role', merged.role); if (patch.page && patch.page !== '1') next.set('page', patch.page); const text = next.toString(); return `/celebrities${text ? `?${text}` : ''}` }
  return <MediaShell section="celebrities" search={{ action: '/celebrities', placeholder: 'جست‌وجوی بازیگر، کارگردان یا خواننده…', value: result.q }}>
    <div className="container cb-page">
      <header className="cb-hero">
        <span className="cb-kicker">چهره‌ها</span>
        <h1>بازیگران، کارگردانان و خوانندگان</h1>
        <p>همهٔ چهره‌های فیلم، سریال و موسیقی در یک جا؛ روی هر نفر بزنید تا همهٔ کارهایش را یک‌جا ببینید.</p>
        <span className="cb-total"><b>{fa(result.total)}</b> چهره</span>
      </header>
      <nav className="cb-roles" aria-label="نقش">{chips.map(([key, label]) => <Link key={key || 'all'} href={link({ role: key })} className={current === key ? 'is-on' : ''} aria-current={current === key ? 'true' : undefined}>{label}</Link>)}</nav>
      {result.people.length
        ? <div className="cb-grid">{result.people.map((person) => <CelebrityCardView key={person.id} person={person} />)}</div>
        : <p className="cb-empty">{result.q ? `چهره‌ای با نام «${result.q}» پیدا نشد.` : 'هنوز چهره‌ای در این بخش نیست.'}</p>}
      {result.pages > 1 && <nav className="cb-pager" aria-label="صفحه‌بندی">
        {result.page > 1 && <Link href={link({ page: String(result.page - 1) })} rel="prev">قبلی</Link>}
        <span>صفحهٔ {fa(result.page)} از {fa(result.pages)}</span>
        {result.page < result.pages && <Link href={link({ page: String(result.page + 1) })} rel="next">بعدی</Link>}
      </nav>}
    </div>
  </MediaShell>
}
