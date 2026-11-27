import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'
import CloudShell from '@/components/hosting/workspace/cloud-shell'
import { cloudWorkspaceRequest, cloudWorkspaceUser, CloudWorkspaceError } from '@/modules/hosting/server/workspace-access'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { sectionDisplayName } from '@/modules/site/server/section-names'
import Link from '@/components/AppLink'
import '@/components/hosting/hosting.css'
import '@/components/hosting/domains.css'
import '@/app/dashboard/services/services.css'
import '@/app/dashboard/cloud/cloud.css'
import s from '@/components/hosting/workspace/cloud-financial.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پنل ابری موبوکام', robots: { index: false, follow: false } }
export default async function CloudWorkspaceLayout({children}:{children:ReactNode}) {
  let refusal = ''
  try { await cloudWorkspaceUser(await cloudWorkspaceRequest()) }
  catch(error) {
    if (!(error instanceof CloudWorkspaceError)) throw error
    if(error.status===404) notFound()
    if(error.status===401) redirect('/login?next=%2Fcloud%2Fdashboard')
    refusal=error.message
  }
  if(refusal) return <main className={s.notice} dir="rtl"><span className={s.eyebrow}>ابر موبوکام</span><h1>پنل ابری در دسترس نیست</h1><p>{refusal}</p><Link href="/cloud" className="btn btn-primary">صفحهٔ اصلی ابر</Link></main>
  const [locale,theme,name]=await Promise.all([getServerLocale(),getServerTheme(),sectionDisplayName('hosting',true,{fa:'ابر موبوکام',en:'MoboCom Cloud'})])
  return <CloudShell locale={locale} theme={theme} name={name}>{children}</CloudShell>
}
