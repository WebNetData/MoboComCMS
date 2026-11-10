import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import LoginForm from './LoginForm'
import AuthFrame from './AuthFrame'
import AuthLoading from './AuthLoading'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import TelegramLoginButton from './TelegramLoginButton'
import GoogleLoginButton from './GoogleLoginButton'
import { googleLoginAvailable } from '@/modules/identity/server/google-login'
import { GOOGLE_LOGIN_ERRORS, isGoogleLoginError } from '@/modules/identity/domain/google-login'
import { telegramConfig } from '@/modules/notifications/server/telegram'
import { otpLoginAvailable } from '@/modules/sms/server/sms'
import { emailOtpAvailable } from '@/modules/identity/server/email-otp'
import SignedIn from './SignedIn'
import { safeNext, signedInPerson } from './signed-in-person'
import { authEntryHref } from '@/modules/identity/domain/continuation'

export const metadata: Metadata = { title: 'ورود به حساب', robots: { index: false } }

export default async function LoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ next?: string; google?: string }> }) {
  const searchParams = await searchParamsPromise
  return <LoginInner nextPath={String(searchParams?.next || '')} google={String(searchParams?.google || '')} />
}

function LoginInner({ nextPath, google }: { nextPath: string; google: string }) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LoginContent nextPath={nextPath} google={google} />
    </Suspense>
  )
}

async function LoginContent({ nextPath, google }: { nextPath: string; google: string }) {
  const locale = await getServerLocale()
  const theme = await getServerTheme()
  const t = dict(locale)
  const person = await signedInPerson()
  if (person) return <><SiteHeader theme={theme} /><AuthFrame variant="signed"><SignedIn person={person} next={safeNext(nextPath)} /></AuthFrame></>
  const [telegram, otp, emailOtp, googleOn] = await Promise.all([telegramConfig(), otpLoginAvailable().catch(() => false), emailOtpAvailable().catch(() => false), googleLoginAvailable().catch(() => false)])
  const botUsername = telegram.ready ? telegram.username : ''
  let registerHref = authEntryHref('/register', nextPath)
  if (nextPath.startsWith('/telegram/connect?')) {
    const token = new URLSearchParams(nextPath.split('?', 2)[1] || '').get('token') || ''
    if (/^[A-Za-z0-9_-]{32}$/.test(token)) registerHref = `/register?telegramToken=${encodeURIComponent(token)}`
  }
  return (
    <>
      <SiteHeader theme={theme} />
      <AuthFrame>
        {isGoogleLoginError(google) && <p className="error-text auth-google-error" role="alert">{GOOGLE_LOGIN_ERRORS[google]}</p>}
        <LoginForm otp={otp} emailOtp={emailOtp} telegramLogin={<>{googleOn && <GoogleLoginButton next={safeNext(nextPath)} />}<TelegramLoginButton botUsername={botUsername} /></>} />
        <div className="auth-alternative">
          <p className="muted">
            {t.noAccount} <Link href={registerHref} className="text-primary-var">{t.register}</Link>
          </p>
        </div>
      </AuthFrame>
    </>
  )
}
