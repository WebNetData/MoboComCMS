import type { Prisma } from '@prisma/client'
import { StoreError } from '@/modules/store/domain/store'
import type { CounterSaleInput } from '@/modules/store/domain/counter-sales'
import { counterClub } from '@/modules/store/server/marketing'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { verifyOtp } from '@/modules/sms/server/sms'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { minorToDecimal } from '@/shared/money'

export function counterPayments(input: CounterSaleInput, totalMinor: bigint) {
  const rows = input.payments?.length ? input.payments : [{method:input.method as 'CASH'|'CARD',amountMinor:totalMinor.toString(),reference:input.reference}]
  if(rows.reduce((sum,row)=>sum+BigInt(row.amountMinor),0n)!==totalMinor)throw new StoreError('جمع پرداخت نقد، کارت‌خوان و کیف پول باید دقیقاً برابر مبلغ فاکتور باشد')
  if(rows.some(row=>row.method==='CARD'&&!row.reference))throw new StoreError('شمارهٔ پیگیری کارت‌خوان را وارد کنید')
  return rows
}

/** Single-use customer proof and the canonical points/wallet owners commit with the sale. */
export async function payCounterWallet(tx: Prisma.TransactionClient,input: CounterSaleInput,customer: {id:number;phone:string}|null,actorId:number,orderId:number,totalMinor:bigint,currency:string,key:string) {
  const rows=counterPayments(input,totalMinor), wallet=BigInt(rows.find(row=>row.method==='WALLET')?.amountMinor||'0')
  if(!wallet&&!input.redeemPoints)return 0n
  if(!customer||!normalizeMobile(customer.phone)||!input.walletCode)throw new StoreError('برای خرج کیف پول و امتیاز، حساب مشتری و کد تأیید موبایل لازم است',403)
  await verifyOtp({phone:customer.phone,code:input.walletCode,purpose:`COUNTER:${actorId}:${customer.id}`,userId:customer.id},tx)
  await counterClub(tx,{userId:customer.id,orderId,totalMinor,currency,redeem:input.redeemPoints||0,key},'REDEEM')
  if(wallet){const debit=await moveWallet({userId:customer.id,amount:minorToDecimal(-wallet,currency),currency,type:'PURCHASE',orderId,adminId:actorId,idempotencyKey:`${key}:wallet`,description:'خرید حضوری'},tx);if(!debit.ok)throw new StoreError(debit.message||'موجودی کیف پول کافی نیست',409)}
  return wallet
}
