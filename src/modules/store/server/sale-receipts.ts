import QRCode from 'qrcode'
import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { siteLink } from '@/modules/sms/server/sms'
import { StoreError } from '@/modules/store/domain/store'

export async function saleReceiptLink(orderId: number) {
  let row=await db.order.findUnique({where:{id:orderId},select:{receiptToken:true}})
  if(!row)throw new StoreError('سفارش پیدا نشد',404)
  if(!row.receiptToken){await db.order.updateMany({where:{id:orderId,receiptToken:null},data:{receiptToken:randomBytes(24).toString('hex')}});row=await db.order.findUniqueOrThrow({where:{id:orderId},select:{receiptToken:true}})}
  const link=await siteLink(`/receipt/store/${row.receiptToken}`)
  return {link,qr:await QRCode.toDataURL(link,{width:180,margin:2,errorCorrectionLevel:'M'})}
}

/** Bearer capability intentionally exposes only the purchased invoice and status, never code-pool/device/wallet/pickup secrets. */
export async function publicSaleReceipt(token: string) {
  if(!/^[a-f0-9]{48}$/.test(token))return null
  const row=await db.order.findFirst({where:{receiptToken:token,status:{in:['PAID','REFUNDED']}},include:{invoice:true,lines:{orderBy:{line:'asc'}},productDelivery:{select:{status:true}},pickup:{select:{status:true}}}})
  if(!row?.invoice || !['PAID','REFUNDED'].includes(row.invoice.status))return null
  return {number:row.invoice.number,createdAt:row.createdAt.toISOString(),channel:row.saleSource,status:row.pickup?.status||row.productDelivery?.status||row.status,invoiceStatus:row.invoice.status,customer:row.customerName,currency:row.currency,totalMinor:row.totalMinor.toString(),lines:row.lines.map(line=>({name:line.name,variant:line.variantName,quantity:line.quantity,totalMinor:line.totalMinor.toString()}))}
}

/** Notification routing is bound to a persisted sale and its original destination; arbitrary inbox text cannot choose a phone. */
export async function storeMessageTarget(event:{userId:number;kind:string;href:string}) {
  const token=event.href.match(/^\/receipt\/store\/([a-f0-9]{48})$/)?.[1]
  if(!token || !['STORE_RECEIPT','STORE_PICKUP_READY'].includes(event.kind))return null
  const row=await db.order.findFirst({where:{receiptToken:token,userId:event.userId,status:'PAID',...(event.kind==='STORE_RECEIPT'?{saleSource:'COUNTER'}:{pickup:{is:{status:'READY'}}})},select:{customerPhone:true,pickup:{select:{codeSecret:true}}}})
  return row?{phone:row.customerPhone,codeSecret:event.kind==='STORE_PICKUP_READY'?row.pickup?.codeSecret||'':''}:null
}
