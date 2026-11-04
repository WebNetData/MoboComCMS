import { redirect } from 'next/navigation'
import MiniAppHome from './MiniAppHome'

export default async function MiniAppHomePage({ searchParams }: { searchParams: Promise<{ renew?: string; subscription?: string }> }) {
  const query = await searchParams
  const id = Number(query.subscription)
  if (query.renew === '1' && Number.isSafeInteger(id) && id > 0) redirect('/miniapp/subscriptions/' + id + '?renew=1')
  return <MiniAppHome />
}
