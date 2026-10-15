import { Suspense } from 'react'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import LoginForm from './LoginForm'
import AuthFrame from './AuthFrame'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import TelegramLoginButton from './TelegramLoginButton'
import { telegramConfig } from '@/modules/notifications/server/telegram'
import { otpLoginAvailable } from '@/modules/sms/server/sms'
import { emailOtpAvailable } from '@/modules/identity/server/email-otp'
import SignedIn from './SignedIn'
import { safeNext, signedInPerson } from './signed-in-person'

export default async function LoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await searchParamsPromise
  return <LoginInner nextPath={String(searchParams?.next || '')} />
}

function LoginInner({ nextPath }: { nextPath: string }) {
  return (
    <Suspense fallback={<div className="auth-loading" aria-busy="true" />}>
      <LoginContent nextPath={nextPath} />
    </Suspense>
  )
}

async function LoginContent({ nextPath }: { nextPath: string }) {
  const locale = await getServerLocale()
  const theme = await getServerTheme()
  const t = dict(locale)
  const person = await signedInPerson()
  if (person) return <><SiteHeader theme={theme} /><AuthFrame variant="signed"><SignedIn person={person} next={safeNext(nextPath)} /></AuthFrame></>
  const [telegram, otp, emailOtp] = await Promise.all([telegramConfig(), otpLoginAvailable().catch(() => false), emailOtpAvailable().catch(() => false)])
  const botUsername = telegram.ready ? telegram.username : ''
  let registerHref = '/register'
  if (nextPath.startsWith('/telegram/connect?')) {
    const token = new URLSearchParams(nextPath.split('?', 2)[1] || '').get('token') || ''
    if (/^[A-Za-z0-9_-]{32}$/.test(token)) registerHref = `/register?telegramToken=${encodeURIComponent(token)}`
  }
  return (
    <>
      <SiteHeader theme={theme} />
      <AuthFrame>
        <LoginForm otp={otp} emailOtp={emailOtp} telegramLogin={<TelegramLoginButton botUsername={botUsername} />} />
        <div className="auth-alternative">
          <p className="muted">
            {t.noAccount} <Link href={registerHref} className="text-primary-var">{t.register}</Link>
          </p>
        </div>
      </AuthFrame>
    </>
  )
}
