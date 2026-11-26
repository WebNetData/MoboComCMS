const assert=require('node:assert/strict'),{NextRequest}=require('next/server')
module.exports=async function({prisma,load,pay,invoice,prepare,changeBaleCheckout,receive,envelope,bank,smsGateway,smsSource,secret,quotes}){
 const matcher=load('src/modules/billing/server/pay/bale/collection-match.ts'),native=matcher.matchBaleNotice
 const scenarios=[{name:'BALE',amount:1650000,event:590},{name:'SMS',amount:1660000,event:591}]
 for(const scenario of scenarios){
  const inv=await invoice(scenario.amount,'IRR','WALLET_TOPUP')
  if(scenario.name==='SMS')await prisma.invoice.updateMany({where:{id:inv.id,status:'UNPAID'},data:{gatewayId:smsGateway.id}})
  const q=scenario.name==='SMS'?await load('src/modules/billing/server/pay/bale/collection-create.ts').prepareBaleGateway(smsGateway.id,inv.number):await prepare(inv)
  if(scenario.name==='SMS')quotes.push(q.txnId)
  await changeBaleCheckout(q.txnId,new NextRequest('https://mobocom.invalid/pay/bank/'+q.txnId),'accept')
  const row=await prisma.payBaleCollection.findUniqueOrThrow({where:{id:q.txnId}})
  const body=scenario.name==='BALE'?envelope(scenario.event,{amount:row.collectedRial.toString(),reference:'RECOVERY'+scenario.event}):Buffer.from(JSON.stringify({message_id:'recovery-'+scenario.event,sender:'fixture',message:'CREDIT '+row.collectedRial,received_at:new Date().toISOString()}))
  const send=()=>scenario.name==='BALE'?receive(body):load('src/modules/billing/server/pay/sms/intake.ts').receiveSmsNotice(smsSource.id,secret,body)
  matcher.matchBaleNotice=async()=>{throw Error('synthetic interruption after receipt commit')}
  try{await assert.rejects(send(),/synthetic interruption/)}finally{matcher.matchBaleNotice=native}
  const notice=await prisma.payBaleNotice.findFirstOrThrow({where:{bankAccountId:bank.id,amountMinor:row.collectedRial,sourceType:scenario.name}})
  const job=await prisma.backgroundJob.findUniqueOrThrow({where:{dedupeKey:'pay-transfer-match:'+notice.id}})
  assert.equal(job.kind,'pay.transfer-match');assert.deepEqual(JSON.parse(job.payload),{noticeId:notice.id});assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:inv.id}})).status,'UNPAID')
  const moduleKey='extension.mobocom-pay.state.v1',old=await prisma.setting.findUniqueOrThrow({where:{key:moduleKey}})
  await prisma.setting.update({where:{key:moduleKey},data:{value:'{"enabled":false,"settings":{}}'}})
  try{await assert.rejects(pay.recoverTransferMatch(JSON.parse(job.payload)));assert.equal(await prisma.walletTx.count({where:{invoiceId:inv.id,type:'TOPUP'}}),0)}finally{await prisma.setting.update({where:{key:moduleKey},data:{value:old.value}})}
  assert.equal((await pay.recoverTransferMatch(JSON.parse(job.payload))).financialApproval,true)
  assert.equal((await pay.recoverTransferMatch(JSON.parse(job.payload))).alreadyPaid,true)
  await send();assert.equal(await prisma.backgroundJob.count({where:{dedupeKey:'pay-transfer-match:'+notice.id}}),1)
  const credits=await prisma.walletTx.findMany({where:{invoiceId:inv.id,type:'TOPUP',status:'DONE'}});assert.equal(credits.length,1);assert.equal(credits[0].amountMinor,BigInt(scenario.amount),'adjustment never becomes customer balance');assert.equal(await prisma.payment.count({where:{invoiceId:inv.id,status:'CONFIRMED'}}),1)
 }
}
