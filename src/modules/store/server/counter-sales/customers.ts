import { db } from '@/platform/database/prisma'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { getLoyaltySettings } from '@/modules/store/server/marketing'
import { tierFor, redeemValue } from '@/modules/store/domain/marketing'
import { parseForm, answerText, stepLabel, type StoredAnswer } from '@/modules/forms/domain/forms'
import { mayHandle } from '@/modules/forms/server/advanced'
import { StoreError, FULFILMENT_LABEL, type FulfilmentStatus } from '@/modules/store/domain/store'

export async function counterCustomer(id: number, actor: {id:number; builder:boolean; handler:boolean}) {
  const customer=await db.user.findFirst({where:{id,status:'ACTIVE'},select:{id:true,name:true,phone:true,email:true}})
  if(!customer)throw new StoreError('مشتری پیدا نشد',404)
  const phone=normalizeMobile(customer.phone), phones=phone?[phone,`0${phone.slice(-10)}`,phone.replace('+','')]:[]
  const [orders,balances,account,settings,repairs]=await Promise.all([
    db.order.findMany({where:{productId:{not:null},OR:[{userId:id},...(phone?[{userId:null,customerPhone:{in:phones}}]:[])]},orderBy:{id:'desc'},take:30,select:{id:true,saleSource:true,totalMinor:true,currency:true,status:true,createdAt:true,invoice:{select:{number:true}},productDelivery:{select:{status:true}}}}),
    db.walletAccount.findMany({where:{userId:id},select:{currency:true,balanceMinor:true}}),
    db.loyaltyAccount.findUnique({where:{userId:id}}),getLoyaltySettings(),
    actor.builder||actor.handler?db.formSubmission.findMany({where:{OR:[{userId:id},...(phone?[{userId:null,OR:phones.map(value=>({data:{contains:value}}))}]:[])]},orderBy:{id:'desc'},take:100,select:{id:true,userId:true,data:true,stage:true,createdAt:true,form:{select:{id:true,title:true,slug:true,fields:true,settings:true,published:true,description:true,successText:true}}}}):Promise.resolve([]),
  ])
  const permitted=repairs.filter(row=>mayHandle(parseForm(row.form),actor,actor.builder)).filter(row=>{if(row.userId===id)return true;try{return (JSON.parse(row.data) as StoredAnswer[]).some(answer=>['tel','mobile'].includes(answer.type||'')&&normalizeMobile(answerText(answer.value))===phone)}catch{return false}})
  return {customer,wallets:balances.map(row=>({currency:row.currency,balanceMinor:row.balanceMinor.toString()})),club:{enabled:settings.enabled,balance:account?.balance||0,tier:tierFor(settings,account?.lifetime||0).tier.name,pointValueToman:settings.pointValueToman,minRedeem:settings.minRedeem,valueMinor:redeemValue(settings,account?.balance||0).toString()},
    history:[...orders.map(row=>({id:row.id,kind:'sale',title:`سفارش ${row.id}`,channel:row.saleSource,status:row.productDelivery?.status||row.status,statusLabel:FULFILMENT_LABEL[(row.productDelivery?.status||row.status) as FulfilmentStatus]||({PAID:'پرداخت شد',REFUNDED:'بازپرداخت شد'} as Record<string,string>)[row.status]||row.status,totalMinor:row.totalMinor.toString(),currency:row.currency,createdAt:row.createdAt.toISOString(),href:`/admin/store/orders/${row.id}`})),...permitted.map(row=>({id:row.id,kind:'repair',title:row.form.title,channel:'REPAIR',status:row.stage,statusLabel:stepLabel(parseForm(row.form).settings,row.stage),totalMinor:null,currency:'',createdAt:row.createdAt.toISOString(),href:`/admin/forms?form=${row.form.id}&tab=inbox`}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,40)}
}
