import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PublicForm from '@/components/site/PublicForm'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
import { publicForm } from '@/modules/forms/domain/forms'
import { publicFormBySlug } from '@/modules/forms/server/service'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await publicFormBySlug((await paramsPromise).slug)
  return found ? { title: found.form.title, description: found.form.description || undefined } : {}
}

export default async function FormPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const found = await publicFormBySlug(params.slug)
  if (!found) notFound()
  return <><SiteHeader theme={await getServerTheme()}/><main className="container section"><PublicForm form={publicForm(found.form)} state={found.state}/></main><SiteFooter/></>
}
