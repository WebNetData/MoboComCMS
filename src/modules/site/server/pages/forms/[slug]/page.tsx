import { notFound } from 'next/navigation'
import { db } from '@/platform/database/prisma'
import PublicForm from '@/components/site/PublicForm'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'

export default async function FormPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const form = await db.siteForm.findUnique({ where: { slug: params.slug } })
  if (!form?.published) notFound()
  return <><SiteHeader theme={await getServerTheme()}/><main className="container section"><PublicForm form={{ ...form, fields: JSON.parse(form.fields) }}/></main><SiteFooter/></>
}
