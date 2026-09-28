import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import AuthFrame from '../login/AuthFrame'
import ForgotForm from './ForgotForm'
import { getServerTheme } from '@/i18n/server'
import { resetMethods } from '@/modules/identity/server/account-security'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'بازیابی رمز عبور', robots: { index: false } }

export default async function ForgotPasswordPage() {
  const [theme, methods] = await Promise.all([getServerTheme(), resetMethods().catch(() => ({ email: false, sms: false }))])
  return <>
    <SiteHeader theme={theme} />
    <AuthFrame><ForgotForm methods={methods} /></AuthFrame>
  </>
}
