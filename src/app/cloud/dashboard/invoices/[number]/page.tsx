import {notFound} from 'next/navigation'
import InvoicePage from '@/modules/billing/server/pages/invoice/[number]/page'
import {cloudWorkspaceRequest,cloudWorkspaceUser,ownedCloudInvoice} from '@/modules/hosting/server/workspace-access'
export default async function Page({params}:{params:Promise<{number:string}>}) {
  const user=await cloudWorkspaceUser(await cloudWorkspaceRequest()),{number}=await params
  if(!await ownedCloudInvoice(user.id,number))notFound()
  return <InvoicePage params={Promise.resolve({number})} surface="cloud" />
}
