import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { encryptDigitalDelivery, decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { consumeInventoryReservation } from '@/modules/catalog/server/inventory'
import { lockOrderWork, orderVisibility, type OrderWorkScope } from '@/modules/store/server/order-work'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { StoreError } from '@/modules/store/domain/store'
import { assertOrderDispatchReady } from '@/modules/store/server/packing'

const digest=(id:number,code:string)=>createHmac('sha256',authSecret()).update(`store-pickup:${id}:${code}`).digest('hex')
export async function createStorePickup(tx: Prisma.TransactionClient,orderId:number){
 const code=String(randomInt(100000,1000000))
 return tx.storePickup.create({data:{orderId,codeHash:digest(orderId,code),codeSecret:encryptDigitalDelivery(code)}})
}
export async function pickupQueue(scope?:OrderWorkScope){
 const rows=await db.storePickup.findMany({where:{status:{not:'COLLECTED'},order:{...orderVisibility(scope),status:'PAID',invoice:{is:{status:'PAID'}}}},orderBy:{createdAt:'asc'},take:100,include:{order:{select:{customerName:true,createdAt:true,user:{select:{name:true}},invoice:{select:{number:true}},lines:{select:{name:true,quantity:true}}}}}})
 return rows.map(row=>({orderId:row.orderId,status:row.status,attempts:row.attempts,createdAt:row.createdAt.toISOString(),customer:row.order.customerName||row.order.user?.name||'مشتری',invoice:row.order.invoice?.number||'',items:row.order.lines.map(x=>`${x.name} × ${x.quantity}`).join('، ')}))
}
export async function pickupForCustomer(userId:number,orderId:number){
 const row=await db.storePickup.findFirst({where:{orderId,order:{userId,status:'PAID',invoice:{is:{status:'PAID'}}}},select:{status:true,codeSecret:true}})
 return row?{status:row.status,code:row.status==='READY'?decryptDigitalDelivery(row.codeSecret):''}:null
}
export async function movePickup(input:{orderId:number;actorId:number;scope:OrderWorkScope;action:'ready'|'collect'|'reissue';code?:string;audit:(tx:Prisma.TransactionClient)=>Promise<void>}){
 const outcome=await db.$transaction(async tx=>{
  await lockOrderWork(tx,input.orderId,input.scope)
  await tx.$queryRaw(Prisma.sql`SELECT "orderId" FROM "StorePickup" WHERE "orderId"=${input.orderId} FOR UPDATE`)
  const row=await tx.storePickup.findUnique({where:{orderId:input.orderId},include:{order:{select:{status:true,userId:true,receiptToken:true,invoice:{select:{status:true}},productDelivery:{select:{status:true}}}}}})
  if(!row||row.order.status!=='PAID'||row.order.invoice?.status!=='PAID'||!row.order.productDelivery||['CANCELLED','RETURNED'].includes(row.order.productDelivery.status))throw new StoreError('سفارش پرداخت‌شده و قابل تحویل پیدا نشد',409)
  if(input.action==='reissue'){
   if(!input.scope.manager)throw new StoreError('صدور دوبارهٔ کد فقط با مدیر فروشگاه است',403)
   if(row.status!=='READY')throw new StoreError('فقط سفارش آمادهٔ تحویل کد تازه می‌گیرد',409)
   let code=String(randomInt(100000,1000000))
   while(digest(input.orderId,code)===row.codeHash)code=String(randomInt(100000,1000000))
   const codeHash=digest(input.orderId,code)
   const changed=await tx.storePickup.updateMany({where:{orderId:input.orderId,status:'READY',codeHash:row.codeHash},data:{codeHash,codeSecret:encryptDigitalDelivery(code),attempts:0}})
   if(changed.count!==1)throw new StoreError('کد هم‌زمان تغییر کرده است',409)
   if(row.order.userId&&row.order.receiptToken)await createInboxEvent({userId:row.order.userId,kind:'STORE_PICKUP_READY',dedupeKey:`pickup:reissue:${input.orderId}:${codeHash}`,titleFa:'کد تازهٔ تحویل سفارش شما',titleEn:'New collection code',bodyFa:'کد قبلی دیگر معتبر نیست.',href:`/receipt/store/${row.order.receiptToken}`,channels:['sms','push']},tx)
  }else if(input.action==='ready'){
   await assertOrderDispatchReady(tx,input.orderId)
   if(row.status==='COLLECTED')throw new StoreError('این سفارش تحویل گرفته شده است',409)
   if(row.status==='READY')return {ok:true}
   const consumed=await consumeInventoryReservation(input.orderId,tx);if(!consumed.ok)throw new StoreError(consumed.message,409)
   const changed=await tx.storePickup.updateMany({where:{orderId:input.orderId,status:'WAITING'},data:{status:'READY',readyAt:new Date()}})
   if(changed.count!==1)throw new StoreError('وضعیت سفارش تغییر کرده است',409)
   if(row.order.userId&&row.order.receiptToken)await createInboxEvent({userId:row.order.userId,kind:'STORE_PICKUP_READY',dedupeKey:`pickup:ready:${input.orderId}`,titleFa:'سفارش شما آمادهٔ تحویل از فروشگاه است',titleEn:'Ready for store collection',bodyFa:'برای مراجعه، کد تحویل پیامک‌شده را همراه داشته باشید.',href:`/receipt/store/${row.order.receiptToken}`,channels:['sms','push']},tx)
  }else{
   await assertOrderDispatchReady(tx,input.orderId)
   if(row.status!=='READY'||row.attempts>=10)throw new StoreError('سفارش آماده نیست، قبلاً تحویل شده یا تلاش‌های کد بیش از حد است',409)
   const code=String(input.code||'').replace(/[۰-۹]/g,x=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x)))
   const matched=/^\d{6}$/.test(code)&&timingSafeEqual(Buffer.from(row.codeHash,'hex'),Buffer.from(digest(input.orderId,code),'hex'))
   if(!matched){await tx.storePickup.updateMany({where:{orderId:input.orderId,status:'READY',attempts:row.attempts},data:{attempts:{increment:1}}});await input.audit(tx);return {ok:false}}
   const changed=await tx.storePickup.updateMany({where:{orderId:input.orderId,status:'READY',attempts:row.attempts},data:{status:'COLLECTED',collectedAt:new Date(),collectedById:input.actorId}})
   if(changed.count!==1)throw new StoreError('تحویل هم‌زمان ثبت شده است',409)
   const delivery=await tx.productDelivery.updateMany({where:{orderId:input.orderId,status:row.order.productDelivery.status},data:{status:'DELIVERED',deliveredAt:new Date(),deliveryNote:'تحویل حضوری با کد مشتری'}})
   if(delivery.count!==1)throw new StoreError('وضعیت تحویل هم‌زمان تغییر کرده است',409)
  }
  await tx.orderEvent.create({data:{orderId:input.orderId,status:input.action==='collect'?'DELIVERED':'PICKUP_READY',actorId:input.actorId,note:input.action==='reissue'?'صدور مجدد کد تحویل توسط مدیر':input.action==='ready'?'آمادهٔ تحویل از فروشگاه':'تحویل حضوری با کد تأیید مشتری'}})
  await input.audit(tx);return {ok:true}
 })
 if(!outcome.ok)throw new StoreError('کد تحویل صحیح نیست',403)
 return outcome
}
