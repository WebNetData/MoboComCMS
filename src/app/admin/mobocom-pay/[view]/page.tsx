import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import Admin from '@/components/pay/Admin'

const views = ['merchants', 'settlements', 'payments', 'bank-events', 'settings', 'receipts', 'operations', 'reconciliation']

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  await requireModule('mobocom-pay')
  const { view } = await params
  if (!views.includes(view)) notFound()
  return <Admin key={view} initialView={view} />
}
