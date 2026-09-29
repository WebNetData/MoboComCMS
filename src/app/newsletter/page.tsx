import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import NewsletterForm from '@/components/newsletter/NewsletterForm'
import { getServerTheme } from '@/i18n/server'

export const metadata: Metadata = { title: 'خبرنامه' }

export default async function NewsletterPage() {
  const theme = await getServerTheme()
  return <>
    <SiteHeader theme={theme} />
    <main className="container nl-page" dir="rtl"><NewsletterForm /></main>
    <SiteFooter />
  </>
}
