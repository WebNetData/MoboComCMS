import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import AuthFrame from '../login/AuthFrame'
import RegisterForm from './RegisterForm'
import { getServerTheme } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ساخت حساب کاربری', robots: { index: false } }

// The theme comes from the request, as on the sign-in page: read from the cookie while rendering in the
// browser, it differed from what the server had rendered for every returning visitor.
export default async function RegisterPage() {
  const theme = await getServerTheme()
  return <>
    <SiteHeader theme={theme} />
    <AuthFrame><RegisterForm /></AuthFrame>
  </>
}
