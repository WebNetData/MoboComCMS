import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { AccountErasureError } from './preview'

function claimed(result: { count: number }) {
  if (result.count !== 1) throw new AccountErasureError('اطلاعات پذیرنده هم‌زمان تغییر کرد؛ پیش‌نمایش حذف را تازه کنید', 409)
}

/** Retained amounts/links stay unchanged; only private presentation/credentials are erased. */
export async function eraseFinancialIdentity(tx: Prisma.TransactionClient,id:number) {
  const orders=await tx.order.findMany({where:{userId:id},select:{id:true}}),orderIds=orders.map(o=>o.id)
  await tx.order.updateMany({where:{userId:id},data:{customerName:'',customerPhone:'',meta:'{}',paymentUrl:'',receiptToken:null}})
  await tx.orderLine.updateMany({where:{orderId:{in:orderIds}},data:{inputs:'',inputsErasedAt:new Date()}})
  await tx.orderEvent.updateMany({where:{orderId:{in:orderIds}},data:{note:''}})
  await tx.orderDeliveryFile.deleteMany({where:{orderId:{in:orderIds}}})
  await tx.invoice.updateMany({where:{userId:id},data:{notes:'',title:'',detail:'',paymentUrl:''}})
  await tx.payment.updateMany({where:{userId:id},data:{raw:'{}'}})
  await tx.walletTx.updateMany({where:{userId:id},data:{description:''}})
  await tx.paymentReceipt.updateMany({where:{OR:[{userId:id},{invoice:{userId:id}}]},data:{payerName:'',payerBank:'',payerCard:'',image:'',imageType:'',adminNote:''}})
  await tx.productDelivery.updateMany({where:{orderId:{in:orderIds}},data:{address:'',deliveryNote:'',digitalDelivery:''}})
  await tx.shipment.updateMany({where:{orderId:{in:orderIds}},data:{receiver:'{}',note:''}})
  await tx.orderDeliveryChange.updateMany({where:{orderId:{in:orderIds}},data:{oldAddress:'{}',newAddress:'{}',reason:'',reviewNote:''}})
  await tx.returnRequest.updateMany({where:{userId:id},data:{reason:'',description:'',adminNote:'',photos:'[]'}})
  await tx.recurringInvoice.updateMany({where:{userId:id},data:{active:false,title:'حساب حذف‌شده',detail:'',notes:''}})
  await tx.storeQuotation.updateMany({where:{userId:id},data:{title:'حساب حذف‌شده',token:randomBytes(32).toString('hex')}})
  const subscriptions=await tx.subscription.findMany({where:{userId:id},select:{id:true}})
  for(const row of subscriptions)await tx.subscription.updateMany({where:{id:row.id,userId:id},data:{email:null,panelSubUrl:'',configLinks:'[]',subToken:'erased-'+randomBytes(32).toString('hex')}})
  const cloudRows=await tx.hostingOperation.findMany({where:{OR:[{service:{userId:id}},{domain:{userId:id}}]},select:{id:true,version:true,status:true}})
  for(const row of cloudRows){const change=await tx.hostingOperation.updateMany({where:{id:row.id,version:row.version,status:row.status},data:{status:['DONE','FAILED'].includes(row.status)?row.status:'FAILED',snapshot:encryptPanelCredential('{"erased":true}'),reference:'',code:'ACCOUNT_ERASED',token:'',leaseAt:null,version:{increment:1}}});claimed(change)}
  await tx.hostingService.updateMany({where:{userId:id},data:{label:'حساب حذف‌شده',loginUser:'',loginSecret:'',note:'',autoRenew:false}})
  await tx.domain.updateMany({where:{userId:id},data:{handle:'',authCode:'',autoRenew:false}})
  await tx.seller.updateMany({where:{userId:id},data:{shopName:'حساب حذف‌شده',legalName:'',nationalId:'',phone:'',email:'',city:'',address:'',about:'',logo:'',banner:'',iban:'',ibanOwner:'',status:'SUSPENDED',statusNote:''}})
  await tx.advertiser.updateMany({where:{userId:id},data:{name:'حساب حذف‌شده',company:'',email:'',phone:'',website:'',notes:'',status:'BLOCKED'}})
  await tx.repoLicense.updateMany({where:{userId:id},data:{email:'',keyEnc:'',note:'',status:'REVOKED'}})
  const merchant=await tx.payMerchant.findUnique({where:{userId:id},select:{id:true,version:true}})
  if(merchant){
    claimed(await tx.payMerchant.updateMany({where:{id:merchant.id,version:merchant.version},data:{name:'حساب حذف‌شده',website:'',status:'SUSPENDED',baleAllowed:false,version:{increment:1}}}))
    await tx.payTerminal.updateMany({where:{merchantId:merchant.id},data:{active:false,name:'پایانهٔ حذف‌شده',returnUrl:'',channelUrl:''}})
    const integrations=await tx.payBotIntegration.findMany({where:{terminal:{merchantId:merchant.id}},select:{id:true,version:true}})
    for(const item of integrations)claimed(await tx.payBotIntegration.updateMany({where:{id:item.id,version:item.version},data:{active:false,callbackUrl:'https://erased.invalid',callbackTokenCiphertext:'',keyHash:randomBytes(32).toString('hex'),keyPrefix:'erased',version:{increment:1}}}))
    const endpoints=await tx.payWebhookEndpoint.findMany({where:{terminal:{merchantId:merchant.id}},select:{id:true,version:true}})
    // Replace historical credentials too: disabling only the current endpoint
    // would retain decryptable secrets in durable delivery snapshots.
    const destroyedSecret = encryptPanelCredential(randomBytes(32).toString('hex'))
    for(const item of endpoints)claimed(await tx.payWebhookEndpoint.updateMany({where:{id:item.id,version:item.version},data:{active:false,url:'https://erased.invalid',secretCiphertext:destroyedSecret,version:{increment:1}}}))
    await tx.payBotDelivery.updateMany({where:{integration:{terminal:{merchantId:merchant.id}}},data:{callbackUrl:'https://erased.invalid',callbackTokenCiphertext:destroyedSecret}})
    await tx.payWebhookDelivery.updateMany({where:{endpoint:{terminal:{merchantId:merchant.id}}},data:{url:'https://erased.invalid',secretCiphertext:destroyedSecret}})
    await tx.payWebhookAttempt.updateMany({where:{delivery:{endpoint:{terminal:{merchantId:merchant.id}}}},data:{url:'https://erased.invalid'}})
    await tx.payPayment.updateMany({where:{merchantId:merchant.id},data:{purchaseRecipientName:'حساب حذف‌شده'}})
    await tx.paySettlement.updateMany({where:{merchantId:merchant.id},data:{destination:'erased',destinationLabel:'',reason:''}})
    await tx.paySettlementDestination.updateMany({where:{merchantId:merchant.id},data:{destination:'erased',label:'حساب حذف‌شده',active:false}})
  }
  const sources=await tx.paySmsSource.findMany({where:{ownerUserId:id},select:{id:true,version:true}})
  for(const source of sources)claimed(await tx.paySmsSource.updateMany({where:{id:source.id,version:source.version},data:{active:false,verified:false,secretCiphertext:encryptPanelCredential(randomBytes(32).toString('hex')),label:'منبع حذف‌شده',version:{increment:1}}}))
}
