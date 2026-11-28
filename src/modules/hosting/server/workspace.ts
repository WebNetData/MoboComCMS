import { db } from '@/platform/database/prisma'
import { cloudOrderMeta } from '@/modules/checkout/domain/surface'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import type { CloudFinancialPage,CloudFinancialRow,CloudWorkspaceOverview } from '../domain/workspace'
import { cloudServiceRenewals } from './renewal-workspace'

/** Seek over owned invoices; exact JSON filtering also supports legacy whitespace.
 * Bounded scans return a continuation instead of silently discarding older rows. */
export async function cloudFinancialPage(userId:number,before?:number):Promise<CloudFinancialPage> {
  const items:CloudFinancialRow[]=[]
  let cursor=before,scanned=0,hasMore=false
  while(scanned<1000 && items.length<25){
    const rows=await db.order.findMany({where:{userId,...(cursor?{id:{lt:cursor}}:{}),invoice:{is:{userId}}},orderBy:{id:'desc'},take:100,select:{id:true,status:true,meta:true,invoice:{select:{number:true,status:true,title:true,detail:true,kind:true,totalMinor:true,currency:true,issuedAt:true,paidAt:true,dueAt:true}}}})
    if(!rows.length){hasMore=false;break}
    for(let index=0;index<rows.length;index++){
      const row=rows[index];cursor=row.id;scanned++
      const meta=cloudOrderMeta(row.meta),invoice=row.invoice
      if(meta && invoice){const subject=invoiceSubject({kind:invoice.kind,title:invoice.title,detail:invoice.detail,meta,siteName:'موبوکام',amountText:''});items.push({orderId:row.id,orderStatus:row.status,number:invoice.number,status:invoice.status,title:subject.title,totalMinor:invoice.totalMinor.toString(),currency:invoice.currency,issuedAt:invoice.issuedAt.toISOString(),paidAt:invoice.paidAt?.toISOString()||null,dueAt:invoice.dueAt?.toISOString()||null})}
      hasMore=index<rows.length-1||rows.length===100
      if(items.length===25||scanned===1000)break
    }
    if(rows.length<100||items.length===25||scanned===1000)break
  }
  return{items,hasMore,nextCursor:hasMore?cursor||null:null}
}

export async function cloudWorkspaceOverview(userId:number):Promise<CloudWorkspaceOverview>{
  const [financial,serviceEvents,domainEvents,renewals]=await Promise.all([
    cloudFinancialPage(userId),
    db.hostingAction.findMany({where:{service:{userId}},orderBy:{id:'desc'},take:8,select:{id:true,kind:true,status:true,createdAt:true,service:{select:{id:true,label:true}}}}),
    db.domainAction.findMany({where:{domain:{userId}},orderBy:{id:'desc'},take:8,select:{id:true,kind:true,status:true,createdAt:true,domain:{select:{id:true,name:true}}}}),
    cloudServiceRenewals(userId),
  ])
  return{...renewals,recentInvoices:financial.items.slice(0,4),financialHasMore:financial.hasMore,activity:[...serviceEvents.map(row=>({id:'s'+row.id,label:row.service.label,kind:row.kind,status:row.status,at:row.createdAt.toISOString(),href:`/cloud/dashboard/services/${row.service.id}`})),...domainEvents.map(row=>({id:'d'+row.id,label:row.domain.name,kind:row.kind,status:row.status,at:row.createdAt.toISOString(),href:`/cloud/dashboard/domains/${row.domain.id}`}))].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8)}
}
