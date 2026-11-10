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
import { safeNext } from '@/modules/identity/domain/continuation'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import GoogleLoginButton from '../login/GoogleLoginButton'
import { googleLoginAvailable } from '@/modules/identity/server/google-login'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ساخت حساب کاربری', robots: { index: false } }

// The theme comes from the request, as on the sign-in page: read from the cookie while rendering in the
// browser, it differed from what the server had rendered for every returning visitor.
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ method?: string; telegramToken?: string; ref?: string; next?: string }> }) {
  const [params, theme, person] = await Promise.all([searchParams, getServerTheme(), signedInPerson()])
  if (person) return <><SiteHeader theme={theme} /><AuthFrame variant="signed"><SignedIn person={person} next={safeNext(params.next)} /></AuthFrame></>
  const [otp, googleOn] = await Promise.all([otpLoginAvailable().catch(() => false), googleLoginAvailable().catch(() => false)])
  const google = googleOn ? <GoogleLoginButton next={safeNext(params.next)} label="ثبت‌نام با گوگل" /> : undefined
  const codeEntry = params.method !== 'password' && params.telegramToken === undefined && params.ref === undefined
  return <>
    <SiteHeader theme={theme} />
    <AuthFrame variant="register"><Suspense>{codeEntry ? otp ? <LoginForm otp intent="register" telegramLogin={google} /> : <div className="auth-form">
      <span className="auth-form-icon"><Icon name="phone" size={25} /></span>
      <h1>ثبت‌نام با شمارهٔ موبایل</h1>
      <p className="auth-form-intro" role="status">ثبت‌نام با کد پیامکی در حال حاضر در دسترس نیست. کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.</p>
      {google}
      <Link href="/login" className="btn btn-primary w-full">ورود به حساب موجود</Link>
      <Link href="/p/contact" className="auth-back">تماس با پشتیبانی</Link>
    </div> : <RegisterForm />}</Suspense></AuthFrame>
  </>
}
