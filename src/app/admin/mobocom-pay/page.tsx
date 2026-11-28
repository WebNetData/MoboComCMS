import {requireModule} from '@/extensions/server/modules'
import Admin from '@/components/pay/Admin'

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  await requireModule('mobocom-pay')
  const { view } = await searchParams
  const active = view === 'reports' ? 'reports' : 'overview'
  return <Admin key={active} initialView={active} />
}
