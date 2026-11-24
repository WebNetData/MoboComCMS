import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
export default async function Page() { await requireModule('mobocom-pay'); redirect('/pay/merchant') }
