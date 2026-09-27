import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getSoftware, softwareSidebar } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { licenseLabel } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { SoftwareCard, VipBadge, VipGate } from '@/components/media/MediaCards'
import LinkBox from '@/components/media/LinkBox'
import { ItemActionBar, ReviewSection, aggregateRating } from '@/components/engage/Engagement'
import Gallery from '@/components/media/Gallery'
import CopyText from '@/components/software/CopyText'
import { SoftwareLayout, SoftwareSidebar, isFresh, softwareName } from '@/components/software/SoftwarePortal'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getSoftware(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const s = data.software
  const name = softwareName(s, fa)
  return {
    title: fa ? `دانلود ${name}${s.version ? ` ${s.version}` : ''}${s.platforms[0] ? ` برای ${s.platforms.join(' و ')}` : ''}` : `${name}${s.version ? ` ${s.version}` : ''} download`,
    description: s.summary.slice(0, 180) || undefined,
    openGraph: { images: s.cover || s.icon ? [s.cover || s.icon] : undefined },
    alternates: { canonical: `/software/${s.slug}` },
  }
}

export default async function SoftwarePage({ params }: Props) {
  await requireModule('software')
  const [{ slug }, locale, viewer] = await Promise.all([params, getServerLocale(), getViewer()])
  const [data, sidebar] = await Promise.all([getSoftware(slug), softwareSidebar()])
  if (!data) notFound()
  const fa = locale === 'fa'
  const s = data.software
  const name = softwareName(s, fa)
  const locked = s.access === 'MEMBERS' && !viewer.member
  const n = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '')
  const sections = [
    s.content && ['about', fa ? 'معرفی' : 'About'],
    s.features && ['features', fa ? 'ویژگی‌ها' : 'Features'],
    s.screenshots.length > 0 && ['screens', fa ? 'تصاویر' : 'Screenshots'],
    s.changelog && ['changes', fa ? 'تغییرات نسخه' : 'What’s new'],
    s.requirements && ['requirements', fa ? 'پیش‌نیازها' : 'Requirements'],
    s.installGuide && ['install', fa ? 'راهنمای نصب' : 'Installation'],
    ['download', fa ? 'دانلود' : 'Download'],
  ].filter(Boolean) as [string, string][]
  const facts: [string, string][] = ([
    [fa ? 'نسخه' : 'Version', s.version],
    [fa ? 'سازنده' : 'Developer', s.developer],
    [fa ? 'مجوز' : 'License', licenseLabel(s.license, fa)],
    [fa ? 'سیستم‌عامل' : 'Platforms', s.platforms.join('، ')],
    [fa ? 'دسته' : 'Category', s.category],
    [fa ? 'حجم' : 'Size', s.size],
    [fa ? 'تاریخ انتشار نسخه' : 'Released', date(s.releasedAt)],
    [fa ? 'آخرین به‌روزرسانی' : 'Updated', date(s.updatedAt)],
    [fa ? 'بازدید' : 'Views', n(s.views)],
    [fa ? 'دانلود' : 'Downloads', n(s.downloads)],
  ] as [string, string][]).filter(([, v]) => v)
  const ref = { type: 'software' as const, id: s.id }
  const rating = await aggregateRating(ref)
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name,
    ...(s.version ? { softwareVersion: s.version } : {}), operatingSystem: s.platforms.join(', '),
    ...(s.category ? { applicationCategory: s.category } : {}), ...(s.icon ? { image: s.icon } : {}), ...(s.summary ? { description: s.summary.slice(0, 300) } : {}),
    ...(s.developer ? { author: { '@type': 'Organization', name: s.developer } } : {}),
    ...(s.license === 'PAID' ? {} : { offers: { '@type': 'Offer', price: 0, priceCurrency: 'IRR' } }),
    ...(rating ? { aggregateRating: rating } : {}),
  }

  return (
    <MediaShell section="software" nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <SoftwareLayout sidebar={<>
        <section className="sp-box"><h3>{fa ? 'مشخصات' : 'Details'}</h3><dl className="gm-facts sp-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
        <SoftwareSidebar data={sidebar} fa={fa} active={{ platform: s.platforms[0], category: s.category }} />
      </>}>
        <nav className="cn-crumbs sp-crumbs"><Link href="/software">{fa ? 'نرم‌افزار' : 'Software'}</Link>{s.platforms[0] && <> / <Link href={`/software/browse?platform=${encodeURIComponent(s.platforms[0])}`} dir="ltr">{s.platforms[0]}</Link></>}{s.category && <> / <Link href={`/software/browse?category=${encodeURIComponent(s.category)}`}>{s.category}</Link></>}</nav>
        <header className="sp-detail">
          <span className="sw-icon is-large">{s.icon ? <img src={s.icon} alt="" /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>
          <div>
            <h1>{fa ? 'دانلود ' : ''}<bdi>{name}</bdi>{s.version && <bdi className="sp-ver" dir="ltr">{s.version}</bdi>}{isFresh(s.updatedAt) && <em className="sp-new">{fa ? 'به‌روز شد' : 'Updated'}</em>}</h1>
            {s.summary && <p>{s.summary}</p>}
            <p className="sp-meta"><span>🗓 {date(s.updatedAt)}</span><span>👁 {n(s.views)}</span><span>⤓ {n(s.downloads)}</span>{s.size && <span dir="ltr">💾 {s.size}</span>}<span className="sw-tags"><em>{licenseLabel(s.license, fa)}</em>{s.platforms.map((p) => <em key={p} dir="ltr">{p}</em>)}{s.access === 'MEMBERS' && <VipBadge fa={fa} small />}</span></p>
            <div className="sw-detail-actions">
              <a href="#download" className="btn btn-primary">{locked ? `♛ ${fa ? 'ویژه VIP' : 'VIP only'}` : `⤓ ${fa ? 'رفتن به لینک‌های دانلود' : 'Go to downloads'}`}</a>
              {s.website && <a href={s.website} className="btn btn-ghost" target="_blank" rel="noopener noreferrer nofollow">{fa ? 'سایت سازنده' : 'Developer website'} ↗</a>}
            </div>
            <ItemActionBar item={ref} title={name} image={s.icon || s.cover} followLabel="نسخهٔ جدید" />
          </div>
        </header>
        {sections.length > 1 && <nav className="sp-tabs" aria-label={fa ? 'بخش‌های صفحه' : 'Sections'}>{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>}
        {s.content && <article id="about" className="sp-section md-prose"><h2>{fa ? 'معرفی ' : 'About '}<bdi>{name}</bdi></h2><div dangerouslySetInnerHTML={{ __html: s.content }} /></article>}
        {s.features && <article id="features" className="sp-section md-prose"><h2>{fa ? 'ویژگی‌های کلیدی' : 'Key features'}</h2><div dangerouslySetInnerHTML={{ __html: s.features }} /></article>}
        {s.screenshots.length > 0 && <section id="screens" className="sp-section"><h2>{fa ? 'تصاویر محیط برنامه' : 'Screenshots'}</h2><Gallery images={s.screenshots} fa={fa} /></section>}
        {s.changelog && <article id="changes" className="sp-section md-prose"><h2>{fa ? 'تغییرات نسخهٔ ' : 'What’s new in '}<bdi dir="ltr">{s.version}</bdi></h2><div dangerouslySetInnerHTML={{ __html: s.changelog }} /></article>}
        {s.requirements && <section id="requirements" className="sp-section"><h2>{fa ? 'پیش‌نیازها و سیستم مورد نیاز' : 'System requirements'}</h2><p className="sw-requirements">{s.requirements}</p></section>}
        {s.installGuide && <article id="install" className="sp-section md-prose"><h2>{fa ? 'راهنمای نصب' : 'Installation guide'}</h2><div dangerouslySetInnerHTML={{ __html: s.installGuide }} /></article>}
        <section id="download" className="sp-section sp-download">
          <h2>{fa ? 'لینک‌های دانلود ' : 'Download '}<bdi>{name}</bdi></h2>
          {locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/software/${s.slug}`} title={fa ? 'دانلود این نرم‌افزار مخصوص اعضای VIP است' : 'This download is for VIP members'} />}
          <LinkBox links={data.links} fa={fa} member={viewer.member} loggedIn={!!viewer.userId} parentLocked={s.access === 'MEMBERS'} />
          {s.archivePassword && <p className="sp-password">{fa ? 'رمز فایل فشرده:' : 'Archive password:'} <CopyText value={s.archivePassword} label={fa ? 'رمز فایل' : 'password'} /></p>}
          <ul className="sp-notes">
            <li>{fa ? <>برای باز کردن فایل‌های فشرده از آخرین نسخهٔ <bdi>WinRAR</bdi> یا <bdi>7-Zip</bdi> استفاده کنید.</> : 'Use the latest WinRAR or 7-Zip to extract archives.'}</li>
            <li>{fa ? 'اگر لینکی کار نکرد، با دکمهٔ ⚠ کنار همان لینک خرابی را گزارش دهید.' : 'If a link fails, report it with the ⚠ button next to it.'}</li>
            {s.license === 'PAID' || s.license === 'TRIAL' ? <li>{fa ? 'برای استفادهٔ تجاری، نسخهٔ قانونی را از سازنده تهیه کنید.' : 'For commercial use, buy a licence from the developer.'}</li> : null}
          </ul>
        </section>
        <ReviewSection item={ref} title={name} path={`/software/${s.slug}`} />
        {data.related.length > 0 && <section className="sp-section"><h2>{fa ? 'نرم‌افزارهای مشابه' : 'Similar software'}</h2><div className="sw-grid">{data.related.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</div></section>}
      </SoftwareLayout>
    </MediaShell>
  )
}
