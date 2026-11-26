import {notFound} from 'next/navigation'
import PaymentResultPage from '@/modules/billing/server/pages/payment/result/page'
import {cloudWorkspaceRequest,cloudWorkspaceUser,ownedCloudResultInvoice} from '@/modules/hosting/server/workspace-access'
export default async function Page({searchParams}:{searchParams:Promise<{invoice?:string;order?:string;failed?:string;reason?:string}>}) {
  const user=await cloudWorkspaceUser(await cloudWorkspaceRequest()),query=await searchParams
  if(!await ownedCloudResultInvoice(user.id,query))notFound()
  return <PaymentResultPage searchParams={Promise.resolve(query)} surface="cloud" />
}
