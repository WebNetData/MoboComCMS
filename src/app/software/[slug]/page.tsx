import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getSoftware, softwareShelf } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import { ownerIdsForTermSlug, primaryTerms } from '@/modules/taxonomy/server/taxonomy'
import { getViewer } from '@/modules/membership/server/membership'
import { licenseLabel } from '@/modules/media/domain/media'
import MediaShell from '@/components/media/MediaShell'
import { VipBadge, VipGate } from '@/components/media/MediaCards'
import LinkBox from '@/components/media/LinkBox'
import { paywallView } from '@/modules/paywall/server/paywall'
import BuyContent from '@/components/paywall/BuyContent'
import { ItemActionBar, ReviewSection, aggregateRating } from '@/components/engage/Engagement'
import Gallery from '@/components/media/Gallery'
import CopyText from '@/components/software/CopyText'
import DetailTabs from '@/components/software/DetailTabs'
import { Icon, SoftwareLayout, SoftwareShelf, SoftwareSidebar, isFresh, softwareName } from '@/components/software/SoftwarePortal'
import { toPublicPath } from '@/platform/routing/aliases'
import { safeJsonLd } from '@/shared/seo/json-ld'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getSoftware(slug)
  if (!data) return {}
  const s = data.software
  const name = softwareName(s, true)
  return {
    title: `دانلود ${name}${s.version ? ` ${s.version}` : ''}${s.platforms[0] ? ` برای ${s.platforms.join(' و ')}` : ''}`,
    description: s.summary.slice(0, 180) || undefined,
    openGraph: { images: s.cover || s.icon ? [s.cover || s.icon] : undefined },
    alternates: { canonical: toPublicPath(`/software/${s.slug}`) },
  }
}

const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')
const n = (value: number) => value.toLocaleString('fa-IR')

/**
 * Download page (Softgozar layout): dark title band with the two calls to
 * action, a spec box beside the artwork, the full description, then tabs for
 * download links, installation, requirements, changes and reviews.
 */
export default async function SoftwarePage({ params }: Props) {
  await requireModule('software')
  const [{ slug }, viewer] = await Promise.all([params, getViewer()])
  const [data, chrome] = await Promise.all([getSoftware(slug), softwarePortalChrome()])
  if (!data) notFound()
  const s = data.software
  const name = softwareName(s, true)
  const paywall = await paywallView(viewer, [{ ownerType: 'software', ownerId: s.id }])
  const locked = paywall ? !paywall.open : s.access === 'MEMBERS' && !viewer.member
  const ref = { type: 'software' as const, id: s.id }
  const [rating, termMap] = await Promise.all([aggregateRating(ref), primaryTerms('software', [s.id])])
  const term = termMap.get(s.id)
  // Related: newest items of the same main category (falls back to the legacy category match).
  const termSlug = term ? decodeURIComponent(term.path.split('/').pop() || '') : ''
  const sameTerm = termSlug ? (await ownerIdsForTermSlug('software', termSlug))?.filter((id) => id !== s.id) : null
  const related = sameTerm?.length ? await softwareShelf(sameTerm, 8) : data.related
  const artwork = s.cover && s.cover !== s.icon ? s.cover : s.screenshots[0] || s.icon
  const specs: [string, React.ReactNode][] = ([
    ['ناشر / تولیدکننده', s.developer],
    ['هزینهٔ دانلود', licenseLabel(s.license, true)],
    ['نسخه', s.version ? <bdi dir="ltr">{s.version}</bdi> : ''],
    ['سیستم‌عامل', s.platforms.length ? <bdi dir="ltr">{s.platforms.join(', ')}</bdi> : ''],
    ['حجم فایل', s.size ? <bdi dir="ltr">{s.size}</bdi> : ''],
    ['تاریخ انتشار نسخه', s.releasedAt ? date(s.releasedAt) : ''],
    ['آخرین به‌روزرسانی', date(s.updatedAt)],
    ['دسته‌بندی', term ? <span className="sp-spec-chain">{term.chain.map((node, index) => <span key={node.path}>{index > 0 && ' › '}<Link href={node.path}>{node.name}</Link></span>)}</span> : s.category],
  ] as [string, React.ReactNode][]).filter(([, value]) => value)
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name,
    ...(s.version ? { softwareVersion: s.version } : {}), operatingSystem: s.platforms.join(', '),
    ...(term ? { applicationCategory: term.name } : s.category ? { applicationCategory: s.category } : {}), ...(s.icon ? { image: s.icon } : {}), ...(s.summary ? { description: s.summary.slice(0, 300) } : {}),
    ...(s.developer ? { author: { '@type': 'Organization', name: s.developer } } : {}),
    ...(s.license === 'PAID' ? {} : { offers: { '@type': 'Offer', price: 0, priceCurrency: 'IRR' } }),
    ...(rating ? { aggregateRating: rating } : {}),
  }
  const stars = rating ? Math.round(Number(rating.ratingValue)) : 0

  const tabs = [
    { id: 'download', label: 'لینک‌های دانلود', content: <>
      {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/software/${s.slug}#buy`} noun="نرم‌افزار" />}
      {paywall?.open && paywall.reason === 'purchased' && <span className="pw-owned">✓ این نرم‌افزار را خریده‌اید</span>}
      {!paywall && locked && <VipGate fa loggedIn={!!viewer.userId} next={`/software/${s.slug}`} title="دانلود این نرم‌افزار مخصوص اعضای VIP است" />}
      {data.releases[0]?.links.length > 0 && <><h3>نسخهٔ <bdi dir="ltr">{data.releases[0].version}</bdi></h3><LinkBox links={data.releases[0].links} fa member={viewer.member} loggedIn={!!viewer.userId} parentLocked={s.access === 'MEMBERS'} paywall={paywall} /></>}
      {data.releases[0]?.links.length > 0 && data.links.length > 0 && <h3>لینک‌های اصلی نرم‌افزار</h3>}
      <LinkBox links={data.links} fa member={viewer.member} loggedIn={!!viewer.userId} parentLocked={s.access === 'MEMBERS'} paywall={paywall} compact={data.releases[0]?.links.length > 0} />
      <ul className="sp-notes">
        <li>برای باز کردن فایل‌های فشرده از آخرین نسخهٔ <bdi>WinRAR</bdi> یا <bdi>7-Zip</bdi> استفاده کنید.</li>
        <li>اگر لینکی کار نکرد، با دکمهٔ گزارش کنار همان لینک خرابی را اطلاع دهید.</li>
        {s.license === 'PAID' || s.license === 'TRIAL' ? <li>برای استفادهٔ تجاری، نسخهٔ قانونی را از سازنده تهیه کنید.</li> : null}
      </ul>
    </> },
    ...(s.installGuide ? [{ id: 'install', label: 'آموزش نصب و فعال‌سازی', content: <div className="md-prose" dangerouslySetInnerHTML={{ __html: s.installGuide }} /> }] : []),
    ...(s.requirements ? [{ id: 'requirements', label: 'سیستم مورد نیاز', content: <p className="sw-requirements">{s.requirements}</p> }] : []),
    ...(data.releases.length ? [{ id: 'changes', label: 'تاریخچهٔ نسخه‌ها', content: <ol className="sp-release-list">{data.releases.map((release) => <li key={release.id} className="sp-release-item"><div className="sp-release-head"><strong><bdi dir="ltr">{release.version}</bdi></strong><span>{release.channel === 'BETA' ? 'آزمایشی' : release.channel === 'NIGHTLY' ? 'شبانه' : 'پایدار'}</span><time dateTime={release.releasedAt.toISOString()}>{date(release.releasedAt)}</time></div>{release.size && <small>حجم: <bdi dir="ltr">{release.size}</bdi></small>}{release.changelog && <div className="md-prose" dangerouslySetInnerHTML={{ __html: release.changelog }} />}{release.checksum && <small>SHA-256: <CopyText value={release.checksum} label="SHA-256" /></small>}{release.links.length > 0 && <LinkBox links={release.links} fa member={viewer.member} loggedIn={!!viewer.userId} parentLocked={s.access === 'MEMBERS'} paywall={paywall} compact />}</li>)}</ol> }] : s.changelog ? [{ id: 'changes', label: 'تغییرات نسخه', content: <div className="md-prose" dangerouslySetInnerHTML={{ __html: s.changelog }} /> }] : []),
    { id: 'reviews', label: 'نظرات کاربران', content: <ReviewSection item={ref} title={name} path={`/software/${s.slug}`} /> },
  ]

  return (
    <MediaShell section="software">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <header className="sp-hero-band">
        <div className="container sp-hero-band-inner">
          <span className="sp-hero-icon">{s.icon ? <img src={s.icon} alt="" width={84} height={84} /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>
          <div className="sp-hero-text">
            <nav className="sp-hero-crumbs" aria-label="مسیر صفحه"><Link href="/software">نرم‌افزار</Link>{term?.chain.map((node) => <span key={node.path}> › <Link href={node.path}>{node.name}</Link></span>)}</nav>
            <h1>دانلود <bdi>{name}</bdi>{s.version && <> <bdi dir="ltr">{s.version}</bdi></>}{isFresh(s.updatedAt) && <em className="sp-new">به‌روز شد</em>}{s.access === 'MEMBERS' && <VipBadge fa small />}</h1>
            {s.summary && <p>{s.summary}</p>}
          </div>
          <div className="sp-hero-actions">
            <a href="#about" className="sp-btn is-orange"><Icon name="info" size={18} />توضیحات بیشتر</a>
            <a href="#download" className="sp-btn is-teal"><Icon name="download" size={18} />{locked ? (paywall ? `خرید · ${paywall.price}` : 'دانلود ویژهٔ VIP') : 'دانلود کنید'}</a>
          </div>
        </div>
      </header>
      <SoftwareLayout sidebar={<SoftwareSidebar data={{ ...chrome.sidebar, tree: [] }} fa suggestions={chrome.suggestions} promo={chrome.promo} />}>
        <article className="sp-card sp-detail-card">
          <div className="sp-detail-top">
            <figure className="sp-artwork">{artwork ? <img src={artwork} alt={`تصویر محیط ${name}`} /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</figure>
            <div className="sp-detail-facts">
              <div className="sp-rating-line">
                <span className="sp-stars" aria-label={rating ? `امتیاز ${rating.ratingValue} از ۵` : 'هنوز امتیازی ثبت نشده'}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= stars ? 'is-on' : ''}><Icon name="star" size={15} /></span>)}</span>
                {rating && <span>امتیاز {Number(rating.ratingValue).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} · {n(Number(rating.ratingCount))} رأی</span>}
                <span><Icon name="eye" size={15} />{n(s.views)} مشاهده</span>
                <span><Icon name="download" size={15} />{n(s.downloads)} دانلود</span>
              </div>
              <dl className="sp-specs is-detail">{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              <ItemActionBar item={ref} title={name} image={s.icon || s.cover} followLabel="نسخهٔ جدید" />
            </div>
          </div>
          <div id="about" className="sp-detail-body md-prose">
            {s.content ? <div dangerouslySetInnerHTML={{ __html: s.content }} /> : s.summary && <p>{s.summary}</p>}
            {s.features && <><h2>ویژگی‌های کلیدی <bdi>{name}</bdi></h2><div dangerouslySetInnerHTML={{ __html: s.features }} /></>}
          </div>
          {s.screenshots.length > 1 && <section className="sp-detail-shots" aria-label="تصاویر محیط برنامه"><h2>تصاویر محیط برنامه</h2><Gallery images={s.screenshots} fa /></section>}
          <div className="sp-pass-row">
            {s.archivePassword && <span className="sp-pass"><Icon name="key" size={16} />رمز فایل: <CopyText value={s.archivePassword} label="رمز فایل" /></span>}
            {s.website && <a href={s.website} className="sp-site" target="_blank" rel="noopener noreferrer nofollow"><Icon name="globe" size={16} />سایت سازنده</a>}
            <a href="#reviews" className="sp-report"><Icon name="chat" size={16} />ثبت نظر یا گزارش مشکل</a>
          </div>
        </article>
        <div className="sp-card sp-tabs-card"><DetailTabs tabs={tabs} /></div>
        <SoftwareShelf title="نرم‌افزارهای مرتبط" items={related} icon="apps" more={term?.path} />
        {(term || s.platforms.length > 0) && <section className="sp-card sp-tags" aria-label="برچسب‌ها">
          <h2><Icon name="tag" size={16} />برچسب‌ها</h2>
          <div>{term?.chain.map((node) => <Link key={node.path} href={node.path}>{node.name}</Link>)}{s.platforms.map((p) => <Link key={p} href={`/software/browse?platform=${encodeURIComponent(p)}`}>دانلود نرم‌افزار {p}</Link>)}<Link href={`/software/browse?license=${s.license}`}>{licenseLabel(s.license, true)}</Link></div>
        </section>}
      </SoftwareLayout>
    </MediaShell>
  )
}
