import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import Dashboard from '@/components/pay/Dashboard'

const views = ['payments', 'settlements', 'terminals', 'reports', 'api']

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  await requireModule('mobocom-pay')
  const { view } = await params
  if (!views.includes(view)) notFound()
  return <Dashboard key={view} initialView={view} />
}
