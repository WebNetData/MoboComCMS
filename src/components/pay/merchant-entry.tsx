import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { requireModule } from '@/extensions/server/modules'
import { merchantPortalAccess } from '@/modules/billing/server/pay'
import Dashboard from './Dashboard'
import MerchantSupport from './merchant-support'
import { PayRestricted } from './pay-public'

export async function requestMerchantAccess() {
  const req = new NextRequest(new URL('/pay/merchant', process.env.NEXTAUTH_URL || 'http://localhost'), { headers: new Headers(await headers()) })
  return merchantPortalAccess(req)
}

export default async function MerchantEntry({ view = 'overview' }: { view?: string }) {
  await requireModule('mobocom-pay')
  const access = await requestMerchantAccess()
  if (access.status === 'ACTIVE') return view === 'support' ? <MerchantSupport /> : <Dashboard initialView={view} />
  return <PayRestricted status={access.status} />
}
