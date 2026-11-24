import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'

const views = ['payments', 'settlements', 'terminals', 'reports', 'api', 'operations']

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  await requireModule('mobocom-pay')
  const { view } = await params
  if (!views.includes(view)) notFound()
  redirect('/pay/merchant/' + view)
}
