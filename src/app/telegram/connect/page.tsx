import SiteHeader from '@/components/SiteHeader'
import AuthFrame from '@/app/login/AuthFrame'
import { getServerTheme } from '@/i18n/server'
import TelegramConnectClient from './TelegramConnectClient'

export default async function TelegramConnectPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await searchParamsPromise
  const token = String(searchParams?.token || '')
  const theme = await getServerTheme()

  return (
    <>
      <SiteHeader theme={theme} />
      <AuthFrame>
        <TelegramConnectClient token={token} />
      </AuthFrame>
    </>
  )
}
