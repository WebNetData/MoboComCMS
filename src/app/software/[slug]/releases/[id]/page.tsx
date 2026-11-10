import SectionName from '@/components/site/SectionName'
import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getSoftwareRelease } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import { getViewer } from '@/modules/membership/server/membership'
import { paywallView } from '@/modules/paywall/server/paywall'
import MediaShell from '@/components/media/MediaShell'
import LinkBox from '@/components/media/LinkBox'
import Gallery from '@/components/media/Gallery'
import { VipGate } from '@/components/media/MediaCards'
import BuyContent from '@/components/paywall/BuyContent'
import CopyText from '@/components/software/CopyText'
import { SoftwareLayout, SoftwareSidebar, SoftwareStatsStrip } from '@/components/software/SoftwarePortal'
import { toPublicPath } from '@/platform/routing/aliases'
import { withTextDirections } from '@/modules/editor/domain/rich-text'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string; id: string }> }
const date = (value: Date) => value.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  const release = await getSoftwareRelease(slug, Number(id))
  if (!release) return {}
  return { title: `دانلود ${release.software.title} نسخهٔ ${release.version}`, description: release.software.summary.slice(0, 180) || undefined, alternates: { canonical: toPublicPath(`/software/${slug}/releases/${release.id}`) } }
}

export default async function SoftwareReleasePage({ params }: Props) {
  await requireModule('software')
  const { slug, id } = await params
  const [release, chrome, viewer] = await Promise.all([getSoftwareRelease(slug, Number(id)), softwarePortalChrome(), getViewer()])
  if (!release) notFound()
  const paywall = await paywallView(viewer, [{ ownerType: 'software', ownerId: release.software.id }])
  const locked = paywall ? !paywall.open : release.software.access === 'MEMBERS' && !viewer.opens
  return <MediaShell section="software">
    <SoftwareStatsStrip stats={chrome.stats} />
    <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa terms={chrome.terms} suggestions={chrome.suggestions} promo={chrome.promo} />}>
      <nav className="tc-crumbs sp-crumbs" aria-label="مسیر صفحه"><Link href="/software"><SectionName id="software">نرم‌افزار</SectionName></Link><span aria-hidden="true"> › </span><Link href="/software/releases">نسخه‌ها</Link><span aria-hidden="true"> › </span><Link href={`/software/${slug}`}>{release.software.title}</Link><span aria-hidden="true"> › </span><span aria-current="page"><bdi dir="ltr">{release.version}</bdi></span></nav>
      <article className="sp-card sp-release-detail">
        <header className="sp-release-detail-head"><span className="sp-release-archive-icon">{release.software.icon ? <img src={release.software.icon} alt="" /> : release.software.title.slice(0, 1)}</span><div><p>{release.channel === 'BETA' ? 'نسخهٔ آزمایشی' : release.channel === 'NIGHTLY' ? 'نسخهٔ شبانه' : 'نسخهٔ پایدار'}</p><h1>{release.software.title} <bdi dir="ltr">{release.version}</bdi></h1><time dateTime={release.releasedAt.toISOString()}>{date(release.releasedAt)}</time></div></header>
        <div className="sp-release-detail-meta">{release.software.developer && <span>سازنده: {release.software.developerStudioId ? <Link href={`/studios/${release.software.developerStudioId}`}>{release.software.developer}</Link> : release.software.developer}</span>}{release.size && <span>حجم: <bdi dir="ltr">{release.size}</bdi></span>}</div>
        {release.targets.length > 0 && <section><h2>سازگاری</h2><div className="sp-release-targets">{release.targets.map((target) => <span key={target.id}><bdi dir="ltr">{target.platform}{target.architecture ? ` · ${target.architecture}` : ''}{target.minVersion ? ` · ${target.minVersion}+` : ''}</bdi>{target.notes && <> · {target.notes}</>}</span>)}</div></section>}
        {release.requirements && <section><h2>نیازمندی‌ها</h2><p className="sw-requirements">{release.requirements}</p></section>}
        {release.changelog && <section><h2>تغییرات این نسخه</h2><div className="md-prose" dangerouslySetInnerHTML={{ __html: withTextDirections(release.changelog) }} /></section>}
        {release.screenshots.length > 0 && <section><h2>تصاویر نسخه</h2><Gallery images={release.screenshots} fa /></section>}
        {release.checksum && <p className="sp-release-hash">SHA-256: <CopyText value={release.checksum} label="SHA-256" /></p>}
        <section id="download"><h2>فایل‌های دانلود</h2>
          {paywall && locked && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/software/${slug}/releases/${release.id}#download`} noun="نرم‌افزار" />}
          {!paywall && locked && <VipGate fa loggedIn={!!viewer.userId} next={`/software/${slug}/releases/${release.id}`} title="دانلود این نرم‌افزار مخصوص اعضای VIP است" />}
          <LinkBox links={release.links} fa member={viewer.opens} loggedIn={!!viewer.userId} parentLocked={release.software.access === 'MEMBERS'} paywall={paywall} />
        </section>
        <nav className="sp-release-detail-links"><Link href={`/software/${slug}`}>صفحهٔ نرم‌افزار ←</Link><Link href={`/software/releases?software=${encodeURIComponent(slug)}`}>نسخه‌های دیگر ←</Link></nav>
      </article>
    </SoftwareLayout>
  </MediaShell>
}
