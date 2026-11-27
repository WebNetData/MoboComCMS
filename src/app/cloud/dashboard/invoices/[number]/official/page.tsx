import { notFound } from 'next/navigation'
import OfficialInvoicePage from '@/modules/billing/server/pages/invoice/[number]/official'
import { cloudWorkspaceRequest, cloudWorkspaceUser, ownedCloudInvoice } from '@/modules/hosting/server/workspace-access'

export { generateMetadata } from '@/modules/billing/server/pages/invoice/[number]/official'

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const user = await cloudWorkspaceUser(await cloudWorkspaceRequest())
  const { number } = await params
  if (!await ownedCloudInvoice(user.id, number)) notFound()
  return <OfficialInvoicePage params={Promise.resolve({ number })} surface="cloud" />
}
