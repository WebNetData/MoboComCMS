import { createHmac } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { authSecret } from '@/platform/config/env'
import { userIdentifier } from '../../domain/identifier'
import { requirePerm } from '../access'
import { accountChangeRefusal, actorHasFullAccess } from '../staff-guard'
export class AccountErasureError extends Error { constructor(message: string, readonly status = 422) { super(message) } }
export async function erasurePlan(req: NextRequest, id: number, tx: Prisma.TransactionClient) {
  const actor = await requirePerm(req, 'users.manage', tx)
  if (!actor) throw new AccountErasureError('دسترسی ندارید',403)
  const user = await tx.user.findUnique({ where: { id }, include: { _count: true, userProfile: true, forumProfile: true } })
  if (!user || user.erasedAt) throw new AccountErasureError('حساب پیدا نشد',404)
  const refusal = actor.id === id ? 'حسابی که با آن وارد شده‌اید قابل حذف نیست' : !actorHasFullAccess(actor) ? 'حذف داده‌های حساب فقط برای مدیر کل مجاز است' : await accountChangeRefusal(actor,id,{sensitive:true,role:'CUSTOMER',roleId:null},tx)
  const [forms, messages, attachments, receipts, balances, chats, credentials] = await Promise.all([
    tx.formSubmission.findMany({ where:{userId:id},select:{id:true,createdAt:true,repairVersion:true} }),
    tx.ticketMessage.count({where:{OR:[{userId:id},{ticket:{userId:id}}]}}),
    tx.ticketAttachment.findMany({where:{message:{OR:[{userId:id},{ticket:{userId:id}}]}},select:{filename:true}}),
    tx.paymentReceipt.findMany({where:{OR:[{userId:id},{invoice:{userId:id}}]},select:{id:true,image:true,updatedAt:true}}),
    tx.walletAccount.findMany({where:{userId:id},select:{currency:true,balanceMinor:true,withdrawableMinor:true}}),
    tx.chatConversation.findMany({where:{userId:id},select:{id:true,lastMessageAt:true}}),
    tx.otpCode.count({where:{userId:id}}),
  ])
  const uploads = await tx.formUpload.findMany({where:{submissionId:{in:forms.map(f=>f.id)}},select:{id:true}})
  const [proofs,deliveries,returns] = await Promise.all([
    tx.businessPurchaseProof.findMany({where:{userId:id},select:{filename:true}}),
    tx.orderDeliveryFile.findMany({where:{order:{userId:id}},select:{storageKey:true}}),
    tx.returnRequest.findMany({where:{userId:id},select:{photos:true}}),
  ])
  const returnFiles=returns.flatMap(row=>{const value:unknown=JSON.parse(row.photos);if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))throw new AccountErasureError('فهرست فایل‌های مرجوعی معتبر نیست؛ پیش از حذف اصلاح شود',409);return value as string[]})
  const [orders,invoices,merchants]=await Promise.all([
    tx.order.findMany({where:{userId:id},select:{id:true,status:true,updatedAt:true},orderBy:{id:'asc'}}),
    tx.invoice.findMany({where:{userId:id},select:{id:true,status:true,updatedAt:true},orderBy:{id:'asc'}}),
    tx.payMerchant.findMany({where:{userId:id},select:{id:true,version:true},orderBy:{id:'asc'}}),
  ])
  const counts = [
    {key:'private',label:'رابطه‌ها و فعالیت‌های ثبت‌شده',count:Object.values(user._count).reduce((a,b)=>a+b,0)},
    {key:'orders',label:'سفارش‌ها؛ نگهداری بدون مشخصات شخصی',count:user._count.orders},
    {key:'invoices',label:'صورتحساب‌ها؛ نگهداری برای تطبیق مالی',count:user._count.invoices},
    {key:'tickets',label:'تیکت‌ها و پیام‌های قابل حذف',count:user._count.tickets+messages},
    {key:'forms',label:'فرم‌ها و چت‌های قابل پاک‌سازی',count:forms.length+chats.length},
    {key:'files',label:'فایل‌های متصل؛ پاک‌سازی پس از ثبت حذف',count:attachments.length+receipts.filter(r=>r.image).length+uploads.length+proofs.length+deliveries.length+returnFiles.length},
    {key:'credentials',label:'کلیدها و کدهای ورود',count:user._count.apiKeys+credentials},
  ]
  const identifier=userIdentifier(user),bucket=Math.floor(Date.now()/600000)
  const state=JSON.stringify({policy:1,id,actor:actor.id,updatedAt:user.updatedAt.toISOString(),counts,forms,receipts,chats,orders,invoices,merchants,proofs,deliveries,returnFiles,balances:balances.map(b=>({...b,balanceMinor:String(b.balanceMinor),withdrawableMinor:String(b.withdrawableMinor)}))})
  const digest=(bucket:number)=>createHmac('sha256',authSecret()).update(state+':'+bucket).digest('hex')
  const revision=bucket+'.'+digest(bucket)
  const profile=[user.userProfile?.avatar,user.userProfile?.cover,user.forumProfile?.avatar,user.forumProfile?.cover,user.telegramPhoto].flatMap(v=>{const m=/^\/api\/profile\/media\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/.exec(v||'');return m?[m[1]]:[]})
  return { actor,user,forms,chats,receipts,refusal,accepts:(r:unknown)=>typeof r==='string'&&[bucket,bucket-1].some(b=>r===b+'.'+digest(b)),files:{profile,tickets:attachments.map(a=>a.filename),receipts:receipts.map(r=>r.image).filter(Boolean),forms:uploads.map(u=>u.id),proofs:proofs.map(p=>p.filename),deliveries:deliveries.map(d=>d.storageKey),returns:returnFiles},public:{id,identifier,updatedAt:user.updatedAt.toISOString(),revision,counts,canDelete:!refusal,refusal,retained:['مبلغ‌ها و اسناد مالی مشترک، بدون مشخصات شخصی و بدون تغییر موجودی دیگران حفظ می‌شوند.','سرویس خارجی، انتقال بانکی یا ثبت دامنه با حذف حساب لغو یا مسترد نمی‌شود؛ پیگیری آن با مدیریت سرویس است.','حذف دائمی است؛ بازگردانی فقط از پشتیبان هماهنگ پایگاه‌داده و فایل‌ها امکان‌پذیر است.']} }
}
