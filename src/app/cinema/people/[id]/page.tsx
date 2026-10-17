import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import ManageBar from '@/components/admin/ManageBar'
import { renderEditorialText } from '@/shared/content/sanitize'
import { plainText } from '@/shared/text/plain'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { personPage } from '@/modules/cinema/server/people'
import { browseCinema } from '@/modules/media/server/queries'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { PosterCard } from '@/components/media/MediaCards'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = await personPage(Number((await params).id))
  if (!person) return { title: 'پیدا نشد', robots: { index: false } }
  return { title: `${person.name} — فیلم‌ها و سریال‌ها`, description: plainText(person.bio).slice(0, 160) || `فیلم‌ها و سریال‌های ${person.name}`, alternates: { canonical: `/cinema/people/${person.id}` } }
}

/** /cinema/people/:id — one director or actor with the published films and series they are credited on. */
export default async function CinemaPersonPage({ params }: Props) {
  await requireModule('cinema')
  const [locale, { id }] = await Promise.all([getServerLocale(), params])
  const fa = locale === 'fa'
  const nonce = (await headers()).get('x-nonce') || undefined
  const person = await personPage(Number(id))
  if (!person) notFound()
  const ids = [...new Set([...person.directed, ...person.acted])]
  const titles = (await browseCinema({ ids })).titles
  const pick = (wanted: number[]) => wanted.flatMap((titleId) => { const item = titles.find((title) => title.id === titleId); return item ? [item] : [] })
  const num = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const shelf = (label: string, list: ReturnType<typeof pick>) => list.length > 0 && <section className="md-shelf" aria-label={label}>
    <header className="md-shelf-head"><h2>{label} <small>{num(list.length)}</small></h2></header>
    <div className="cn-grid">{list.map((item) => <PosterCard key={item.id} item={item} fa={fa} />)}</div>
  </section>
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Person', name: person.name, ...(person.image ? { image: person.image } : {}) }
  return <MediaShell section="cinema" active="people" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'جست‌وجوی فیلم و سریال' : 'Search films and series' }}>
    <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <div className="container md-body cn-people">
      <ManageBar title="مدیریت پروفایل" anyOf={['cinema.manage']} links={[{href:`/admin/cinema/people?edit=${person.id}`,label:'ویرایش عکس و زندگی‌نامه'}]} />
      <header className="cn-person-head">
        <span className="cn-person is-large">{person.image ? <img src={person.image} alt="" /> : <i>{person.name.slice(0, 1)}</i>}</span>
        <div><Link href="/cinema/people" className="md-eyebrow">{fa ? 'کارگردانان و بازیگران' : 'Directors and cast'}</Link><h1>{person.name}</h1>
          <p>{[person.directed.length > 0 && (fa ? `کارگردان ${num(person.directed.length)} عنوان` : `Director of ${person.directed.length}`), person.acted.length > 0 && (fa ? `بازیگر ${num(person.acted.length)} عنوان` : `Cast in ${person.acted.length}`)].filter(Boolean).join(' · ')}</p>
          {person.bio && <div className="cn-person-bio" dir="auto" dangerouslySetInnerHTML={{__html:renderEditorialText(person.bio)}} />}
        </div>
      </header>
      {shelf(fa ? 'کارگردانی' : 'Directed', pick(person.directed))}
      {shelf(fa ? 'بازیگری' : 'Cast in', pick(person.acted))}
    </div>
  </MediaShell>
}
