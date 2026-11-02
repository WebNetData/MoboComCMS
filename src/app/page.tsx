import type { Metadata } from 'next'
import HomeView from '@/modules/site/server/pages/home/page'
import { getSiteSeo, shareCard } from '@/modules/site/server/seo'
import { getServerLocale } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const seo = await getSiteSeo(locale)
  return shareCard({ alternates: seo.bilingual ? { canonical: seo.base, languages: { fa: seo.base, en: seo.base, 'x-default': seo.base } } : { canonical: seo.base }, openGraph: { title: `${seo.name} — ${seo.tagline}`, description: seo.description } }, locale)
}

export default async function HomePage() {
  return <HomeView />
}
