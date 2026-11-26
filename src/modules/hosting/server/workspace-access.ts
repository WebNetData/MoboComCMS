import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'
import { opensDuringMaintenance } from '@/modules/account/server/maintenance-access'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { runsSection } from '@/modules/site/domain/maintenance'
import { cloudOrderMeta } from '@/modules/checkout/domain/surface'
import { paymentResultTarget } from '@/modules/billing/domain/payment-result'

export class CloudWorkspaceError extends Error { constructor(message: string, readonly status = 403) { super(message) } }
/** Reuses current Identity and section authority. Never infer access from the shell. */
export async function cloudWorkspaceUser(req: NextRequest) {
  if (!await isModuleEnabled('hosting',db)) throw new CloudWorkspaceError('بخش ابری فعال نیست',404)
  const user = await requireUser(req)
  if (!user) throw new CloudWorkspaceError('ابتدا وارد حساب موبوکام شوید',401)
  const maintenance = await loadMaintenance(true)
  if (maintenance.site.enabled && !await opensDuringMaintenance(user,maintenance.site) || maintenance.hosting?.enabled && !runsSection({role:user.role,roleId:user.roleId??null,permissions:user.permissions},'hosting')) throw new CloudWorkspaceError('ابر موبوکام در حال به‌روزرسانی است',503)
  if (!await userOpensSection('hosting',user.id,true)) throw new CloudWorkspaceError('بخش ابری برای حساب شما در دسترس نیست',403)
  return user
}
export async function cloudWorkspaceRequest() {
  const incoming=await headers()
  return new NextRequest(new URL('/api/hosting/workspace',process.env.NEXTAUTH_URL || 'http://localhost:3000'),{headers:incoming})
}
export async function ownedCloudInvoice(userId:number,number:string) {
  const invoice=await db.invoice.findFirst({where:{number,userId,order:{is:{userId}}},select:{id:true,order:{select:{meta:true}}}})
  return invoice && cloudOrderMeta(invoice.order?.meta) ? invoice.id : null
}
export async function ownedCloudResultInvoice(userId:number,query:{invoice?:string;order?:string}) {
  const {invoiceNumber,orderId}=paymentResultTarget(query)
  const number=invoiceNumber || (orderId ? (await db.invoice.findFirst({where:{orderId,userId},select:{number:true}}))?.number : null)
  return number && await ownedCloudInvoice(userId,number) ? number : null
}
