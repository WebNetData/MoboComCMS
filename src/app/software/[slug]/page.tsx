import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getSoftware } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { licenseLabel } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { Shelf, SoftwareCard, VipBadge, VipGate } from '@/components/media/MediaCards'
import LinkBox from '@/components/media/LinkBox'
import Gallery from '@/components/media/Gallery'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getSoftware(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const s = data.software
  const name = fa ? s.title : s.titleEn || s.title
  return { title: fa ? `دانلود ${name}${s.version ? ` ${s.version}` : ''}` : `${name}${s.version ? ` ${s.version}` : ''} download`, description: s.summary.slice(0, 180) || undefined, openGraph: { images: s.cover || s.icon ? [s.cover || s.icon] : undefined }, alternates: { canonical: `/software/${s.slug}` } }
}

export default async function SoftwarePage({ params }: Props) {
  await requireModule('software')
  const [{ slug }, locale, viewer] = await Promise.all([params, getServerLocale(), getViewer()])
  const data = await getSoftware(slug)
  if (!data) notFound()
  const fa = locale === 'fa'
  const s = data.software
  const name = fa ? s.title : s.titleEn || s.title
  const locked = s.access === 'MEMBERS' && !viewer.member
  const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '')
  const facts: [string, string][] = [
    [fa ? 'نسخه' : 'Version', s.version],
    [fa ? 'سازنده' : 'Developer', s.developer],
    [fa ? 'مجوز' : 'License', licenseLabel(s.license, fa)],
    [fa ? 'پلتفرم' : 'Platforms', s.platforms.join('، ')],
    [fa ? 'دسته' : 'Category', s.category],
    [fa ? 'حجم' : 'Size', s.size],
    [fa ? 'تاریخ انتشار نسخه' : 'Released', date(s.releasedAt)],
    [fa ? 'آخرین به‌روزرسانی' : 'Updated', date(s.updatedAt)],
    [fa ? 'دانلود' : 'Downloads', s.downloads.toLocaleString(fa ? 'fa-IR' : 'en-US')],
  ].filter(([, v]) => v) as [string, string][]
  const jsonLd = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name, ...(s.version ? { softwareVersion: s.version } : {}), operatingSystem: s.platforms.join(', '), ...(s.category ? { applicationCategory: s.category } : {}), ...(s.icon ? { image: s.icon } : {}), ...(s.summary ? { description: s.summary.slice(0, 300) } : {}), offers: { '@type': 'Offer', price: s.license === 'PAID' ? undefined : 0, priceCurrency: 'USD' } }

  return (
    <MediaShell section="software" nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="sw-detail-hero">
        <div className="container sw-detail-inner">
          <span className="sw-icon is-large">{s.icon ? <img src={s.icon} alt="" /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>
          <div className="sw-detail-info">
            <nav className="cn-crumbs"><Link href="/software">{fa ? 'نرم‌افزار' : 'Software'}</Link>{s.category && <> / <Link href={`/software/browse?category=${encodeURIComponent(s.category)}`}>{s.category}</Link></>}</nav>
            <h1>{name} {s.version && <small dir="ltr">{s.version}</small>}</h1>
            {s.summary && <p>{s.summary}</p>}
            <div className="sw-detail-actions">
              <a href="#download" className="btn btn-primary">{locked ? `♛ ${fa ? 'ویژه VIP' : 'VIP only'}` : `⤓ ${fa ? 'دانلود' : 'Download'}`}</a>
              {s.website && <a href={s.website} className="btn btn-ghost" target="_blank" rel="noopener noreferrer nofollow">{fa ? 'وب‌سایت سازنده' : 'Developer website'} ↗</a>}
              {s.access === 'MEMBERS' && <VipBadge fa={fa} />}
            </div>
          </div>
        </div>
      </section>
      <div className="container md-body sw-detail-body">
        <div className="sw-main">
          {s.screenshots.length > 0 && <section className="md-shelf"><header className="md-shelf-head"><h2>{fa ? 'تصاویر' : 'Screenshots'}</h2></header><Gallery images={s.screenshots} fa={fa} /></section>}
          {s.content && <article className="mu-panel md-prose"><h2>{fa ? 'معرفی' : 'About'}</h2><div dangerouslySetInnerHTML={{ __html: s.content }} /></article>}
          {s.changelog && <article className="mu-panel md-prose"><h2>{fa ? 'تغییرات این نسخه' : 'What’s new'}</h2><div dangerouslySetInnerHTML={{ __html: s.changelog }} /></article>}
          {s.requirements && <section className="mu-panel"><h2>{fa ? 'پیش‌نیازها' : 'Requirements'}</h2><p className="sw-requirements">{s.requirements}</p></section>}
          <section id="download" className="cn-watch">
            <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'دانلود' : 'Download'}</span><h2>{fa ? 'لینک‌های دانلود' : 'Download links'}</h2></div></header>
            {locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/software/${s.slug}`} title={fa ? 'دانلود این نرم‌افزار مخصوص اعضای VIP است' : 'This download is for VIP members'} />}
            <LinkBox links={data.links} fa={fa} member={viewer.member} loggedIn={!!viewer.userId} parentLocked={s.access === 'MEMBERS'} />
          </section>
        </div>
        <aside className="sw-aside"><dl className="gm-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></aside>
      </div>
      {data.related.length > 0 && <div className="container"><Shelf tone="software" title={fa ? 'نرم‌افزارهای مشابه' : 'Similar software'}>{data.related.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</Shelf></div>}
    </MediaShell>
  )
}
