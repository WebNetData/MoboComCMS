import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import AuthFrame from '../login/AuthFrame'
import RegisterForm from './RegisterForm'
import { getServerTheme } from '@/i18n/server'
import SignedIn from '../login/SignedIn'
import { signedInPerson } from '../login/signed-in-person'
import { Suspense } from 'react'
import LoginForm from '../login/LoginForm'
import { otpLoginAvailable } from '@/modules/sms/server/sms'
import { emailOtpAvailable } from '@/modules/identity/server/email-otp'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ساخت حساب کاربری', robots: { index: false } }

// The theme comes from the request, as on the sign-in page: read from the cookie while rendering in the
// browser, it differed from what the server had rendered for every returning visitor.
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ method?: string; telegramToken?: string; ref?: string }> }) {
  const theme = await getServerTheme()
  const person = await signedInPerson()
  if (person) return <><SiteHeader theme={theme} /><AuthFrame variant="signed"><SignedIn person={person} next="" /></AuthFrame></>
  const params = await searchParams
  const [otp, emailOtp] = await Promise.all([otpLoginAvailable().catch(() => false), emailOtpAvailable().catch(() => false)])
  const codeEntry = (otp || emailOtp) && params.method !== 'password' && params.telegramToken === undefined && params.ref === undefined
  return <>
    <SiteHeader theme={theme} />
    <AuthFrame variant="register"><Suspense>{codeEntry ? <LoginForm otp={otp} emailOtp={emailOtp} intent="register" /> : <RegisterForm />}</Suspense></AuthFrame>
  </>
}
