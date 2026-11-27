import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import { eraseFormWebhookPayloads } from '@/modules/forms/server/webhooks'
import { erasurePlan,AccountErasureError } from './erasure/preview'
import { erasePersonalRows,eraseAuthoredText } from './erasure/personal'
import { eraseFinancialIdentity } from './erasure/financial'
import { runAccountErasureFiles } from './erasure/files'
export { AccountErasureError,runAccountErasureFiles }
export function accountErasurePreview(req:NextRequest,id:number){return db.$transaction(async tx=>(await erasurePlan(req,id,tx)).public,{isolationLevel:'Serializable',timeout:15000})}
export async function eraseAccount(req:NextRequest,input:Record<string,unknown>){
  if(input.mode!=='erase'||input.confirm!==true||!Number.isSafeInteger(input.id)||Number(input.id)<=0||typeof input.confirmation!=='string'||typeof input.note!=='string'||input.note.trim().length<3||input.note.trim().length>300)throw new AccountErasureError('شناسهٔ دقیق و دلیل حذف همین حساب را تأیید کنید')
  const id=Number(input.id)
  const note=input.note.trim()
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR UPDATE`
    const plan=await erasurePlan(req,id,tx)
    if(plan.refusal)throw new AccountErasureError(plan.refusal,403)
    if(input.updatedAt!==plan.public.updatedAt||!plan.accepts(input.previewRevision))throw new AccountErasureError('اطلاعات پس از پیش‌نمایش تغییر کرده یا پیش‌نمایش منقضی شده است؛ دوباره بررسی کنید',409)
    if(input.confirmation!==plan.public.identifier)throw new AccountErasureError('شناسهٔ حساب با تأیید شما یکسان نیست')
    const now=new Date(),old=plan.user
    const removed=await tx.user.updateMany({where:{id,updatedAt:old.updatedAt,erasedAt:null},data:{erasedAt:now,status:'BANNED',role:'CUSTOMER',roleId:null,email:`erased-${randomBytes(24).toString('hex')}@erased.invalid`,phone:'',phoneVerifiedAt:null,name:'حساب حذف‌شده',note:'',passwordHash:'!',passwordSetupRequired:true,passwordChangedAt:now,sessionsRevokedAt:now,loginPolicy:JSON.stringify({password:false,sms:false,email:false,google:false,telegram:false}),telegramId:null,telegramUsername:'',telegramName:'',telegramPhoto:'',telegramLinkedAt:null,googleId:null,googleEmail:'',googleLinkedAt:null,profileData:'{}',profileCompletedAt:null,totpSecret:'',totpEnabledAt:null,totpBackup:'[]',totpLastStep:0,marketingOptIn:false,marketingConsentAt:null,smsAlerts:false,emailAlerts:false,pushAlerts:false,recommendationOptIn:false,recommendationListeningOptIn:false}})
    if(removed.count!==1)throw new AccountErasureError('حساب هم‌زمان تغییر کرد',409)
    await eraseFinancialIdentity(tx,id)
    await eraseAuthoredText(tx,id)
    await erasePersonalRows(tx,id)
    await tx.formUpload.deleteMany({where:{submissionId:{in:plan.forms.map(f=>f.id)}}})
    await tx.formSubmission.updateMany({where:{userId:id},data:{data:'{}',secrets:'',secretsErasedAt:now,note:'',reply:'',ipHash:'',pickupCode:'',receiptToken:''}})
    await eraseFormWebhookPayloads(tx, plan.forms.map(form => form.id))
    await tx.chatMessage.deleteMany({where:{conversationId:{in:plan.chats.map(c=>c.id)}}})
    await tx.chatConversation.deleteMany({where:{userId:id}})
    await tx.newsletterDelivery.deleteMany({where:{OR:[{userId:id},{email:old.email}]}})
    await tx.newsletterSubscriber.deleteMany({where:{OR:[{userId:id},{email:old.email}]}})
    await tx.smsLog.updateMany({where:{OR:[{userId:id},...(old.phone?[{phone:old.phone}]:[])]},data:{phone:'',body:'',error:''}})
    await tx.mailLog.deleteMany({where:{toAddress:old.email}})
    await tx.otpCode.deleteMany({where:{OR:[{email:old.email},...(old.phone?[{phone:old.phone}]:[])]}})
    await tx.contentPurchase.updateMany({where:{userId:id},data:{revokedAt:now,note:''}})
    await tx.loyaltyEntry.updateMany({where:{userId:id},data:{note:''}})
    await tx.userMembership.updateMany({where:{userId:id},data:{note:''}})
    await tx.auditLog.updateMany({where:{OR:[{actorUserId:id},{targetType:'user',targetId:String(id)}]},data:{actorEmail:'',ip:'',metadata:'{"accountErased":true}'}})
    await tx.setting.deleteMany({where:{key:{in:[`identity.totp-pending.${id}`,`identity.google.pending.${id}`]}}})
    await tx.setting.create({data:{key:`identity.erasure.files.${id}`,value:JSON.stringify(plan.files)}})
    await enqueue('identity.erase-files',{userId:id},{dedupeKey:`identity:erasure-files:${id}`},tx)
    await auditAdminStrict({req,actor:plan.actor,action:'user.erase',targetType:'user',targetId:id,metadata:{policy:1,note,counts:plan.public.counts,retainedAnonymousFinancialFacts:true}},tx)
    return{id,deleted:true as const}
  },{isolationLevel:'Serializable',timeout:30000})
  // The queue retains the committed manifest for retries; file failure cannot
  // turn a committed irreversible erasure into a misleading HTTP failure.
  const cleanup=await runAccountErasureFiles({userId:id}).then(()=> 'DONE' as const,()=> 'QUEUED' as const)
  return{...result,cleanup}
}
