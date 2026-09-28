import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import AuthFrame from '../login/AuthFrame'
import ResetForm from './ResetForm'
import { getServerTheme } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'انتخاب رمز تازه', robots: { index: false } }

export default async function ResetPasswordPage() {
  const theme = await getServerTheme()
  return <>
    <SiteHeader theme={theme} />
    <AuthFrame><ResetForm /></AuthFrame>
  </>
}
