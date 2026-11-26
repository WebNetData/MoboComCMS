import type { Prisma } from '@prisma/client'
import { enqueue } from '@/modules/operations/server/enqueue'
import { PayError } from '@/modules/billing/domain/pay'
import { matchBaleNotice } from './collection-match'

/** Receipt and recovery intent commit atomically; inline matching keeps the fast path. */
export async function queueTransferMatch(tx:Prisma.TransactionClient,notice:{id:string;status:string;direction:string}){
  if(notice.status!=='ORIGINAL_TRANSFER'||notice.direction!=='CREDIT')return
  await enqueue('pay.transfer-match',{noticeId:notice.id},{dedupeKey:'pay-transfer-match:'+notice.id},tx)
}
export async function recoverTransferMatch(payload:Record<string,unknown>){
  if(typeof payload.noticeId!=='string'||!/^[a-f0-9-]{36}$/.test(payload.noticeId))throw new Error('Invalid transfer evidence')
  try{return await matchBaleNotice(payload.noticeId)}catch(error){
    // This evidence deliberately cannot auto-settle a locked-rate purchase. Keep
    // it for the existing review desk; repeated queue execution cannot improve it.
    if(error instanceof PayError&&['PAY_PURCHASE_TIME_REQUIRED','PAY_PURCHASE_LATE'].includes(error.code))return {financialApproval:false,reviewRequired:true,code:error.code}
    throw error
  }
}
