import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/modules/identity/auth'
import { isModuleEnabled } from '@/extensions/server/modules'
import '@/components/hosting/hosting.css'
import '@/components/hosting/domains.css'
import '../services/services.css'
import './cloud.css'

export default async function CloudLayout({ children }: { children: React.ReactNode }) {
  if (!await isModuleEnabled('hosting')) notFound()
  const session = await getServerSession(authOptions)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) redirect('/login?next=%2Fdashboard%2Fcloud')
  return children
}
