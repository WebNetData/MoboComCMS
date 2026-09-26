import SectionView from '@/modules/site/server/pages/section/page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/site/server/pages/section/page'

/** Short-URL sections built with the theme builder (/gaming, /music …). Unknown slugs 404. */
export default async function SectionRoute({ params }: { params: Promise<{ section: string }> }) {
  return <SectionView params={params} />
}
