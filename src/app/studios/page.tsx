import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { isModuleEnabled } from '@/extensions/server/modules'
import { studioDirectory } from '@/modules/studios/server/queries'
import MediaShell from '@/components/media/MediaShell'
import Pager from '@/components/media/Pager'
import { toPublicPath } from '@/platform/routing/aliases'
import './studios.css'

export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<{ q?: string; page?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  return { title: 'سازندگان و ناشران بازی و نرم‌افزار', description: 'بازی‌ها و نرم‌افزارهای هر سازنده و ناشر را در یک صفحه ببینید.', robots: params.q ? { index: false } : undefined, alternates: { canonical: toPublicPath('/studios') } }
}

export default async function StudiosPage({ searchParams }: Props) {
  const [params, games, software] = await Promise.all([searchParams, isModuleEnabled('games'), isModuleEnabled('software')])
  if (!games && !software) notFound()
  const result = await studioDirectory({ q: params.q, page: Number(params.page) || 1 }, { games, software })
  const href = (page: number) => {
    const query = new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(page > 1 ? { page: String(page) } : {}) })
    return `/studios${query.size ? `?${query}` : ''}`
  }
  return <MediaShell section={software ? 'software' : 'games'}>
    <div className="container org-page">
      <nav className="org-crumbs" aria-label="مسیر صفحه"><Link href={software ? '/software' : '/games'}>{software ? 'نرم‌افزار' : 'بازی'}</Link><span>›</span><span aria-current="page">سازندگان و ناشران</span></nav>
      <header className="org-heading"><div><p>محصولات و سازندگان</p><h1>سازندگان و ناشران</h1><span>بازی‌ها و نرم‌افزارهای هر مجموعه را کنار هم پیدا کنید.</span></div><strong>{result.total.toLocaleString('fa-IR')} مجموعه</strong></header>
      <form className="org-search" action="/studios" method="get" role="search"><input className="input" name="q" defaultValue={params.q || ''} placeholder="نام سازنده یا ناشر" aria-label="جست‌وجوی سازندگان و ناشران" /><button className="btn btn-primary" type="submit">جست‌وجو</button></form>
      {result.items.length ? <ul className="org-grid">{result.items.map((studio) => <li key={studio.id}><Link href={`/studios/${studio.id}`} className="org-tile"><span className="org-logo">{studio.logo ? <img src={studio.logo} alt="" loading="lazy" /> : studio.name.slice(0, 1)}</span><span className="org-tile-body"><b>{studio.name}</b>{studio.summary && <small>{studio.summary}</small>}<span>{games && `${studio.counts.games.toLocaleString('fa-IR')} نقش در بازی`}{games && software && ' · '}{software && `${studio.counts.software.toLocaleString('fa-IR')} نقش در نرم‌افزار`}</span></span><span className="org-arrow" aria-hidden="true">←</span></Link></li>)}</ul> : <p className="org-empty">سازنده یا ناشری با این نام پیدا نشد.</p>}
      <Pager page={result.page} pages={result.pages} href={href} fa />
    </div>
  </MediaShell>
}
