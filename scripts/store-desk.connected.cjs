const assert=require('node:assert/strict'),{randomUUID,createHmac}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname) || new URL(process.env.DATABASE_URL).pathname === '/mobocom_store_experiences_20261114','disposable database required')
const db=new PrismaClient(),stamp=`desk-${Date.now().toString(36)}`,users=[],roles=[],products=[],forms=[],sessions=[],messages=[]
let viewer,failAudit=false,failPayment=false,moduleOn=true,realAudit
const configs={'store.loyalty.v1':{enabled:true,earnStepToman:100,earnPoints:1,minRedeem:1,pointValueToman:10,since:'2020-01-01'},'store.delivery.v1':{enabled:false,pickup:{enabled:true,address:'فروشگاه آزمایشی',instructions:'ساعت ۹ تا ۱۸'}}}
const smsBeforePromise=db.setting.findUnique({where:{key:'sms.config.v1'}})
db.$use(async(params,next)=>{if(failPayment&&params.model==='Payment'&&params.action==='create')throw Error('payment-fault');return next(params)})
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:new Date().toISOString()}:null},
 '@/extensions/server/modules':{moduleGuard:async()=>moduleOn?null:Response.json({error:'off'},{status:404}),isModuleEnabled:async()=>moduleOn},
 '@/extensions/server/runtime':{emitExtensionEvent:async()=>{}},
 '@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
 '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true}),clientIp:()=>stamp},
 '@/modules/settings/server':{getSettings:async()=>({brandName:'QA',siteUrl:'https://site.invalid'}),readJsonSetting:async key=>configs[key]||null,writeJsonSetting:async(key,value)=>{configs[key]=value}},
 '@/modules/sms/server/ippanel':{sendText:async(key,from,phones,text)=>{messages.push({phones,text});return{ok:true,id:String(messages.length)}},sendPattern:async()=>({ok:true,id:'pattern'}),credit:async()=>({ok:true})},
 '@/platform/audit/server':{auditAdminStrict:async(input,tx)=>{if(failAudit&&input.action==='store.counter.sale')throw Error('audit-fault');return realAudit.auditAdminStrict(input,tx)}},
})
realAudit=load('src/platform/audit/server.ts')
const api=load('src/modules/store/server/http/counter-sales.ts'),pickupApi=load('src/modules/store/server/http/pickup.ts'),identity=load('src/modules/identity/server/phone-customer.ts'),sms=load('src/modules/sms/server/sms.ts'),inventory=load('src/modules/catalog/server/inventory.ts'),pickup=load('src/modules/store/server/pickup.ts'),billing=load('src/modules/billing/server/billing.ts'),checkout=load('src/modules/checkout/server/checkout.ts'),receipts=load('src/modules/store/server/sale-receipts.ts'),formsOwner=load('src/modules/forms/server/counter.ts'),formsService=load('src/modules/forms/server/service.ts'),formDefs=load('src/modules/forms/domain/forms.ts'),inbox=load('src/modules/notifications/server/inbox.ts'),barcodes=load('src/modules/store/server/counter-sales/barcodes.ts'),ordersOwner=load('src/modules/store/server/orders.ts')
async function user(name,permissions,role='ADMIN'){let roleId=null;if(permissions){const row=await db.role.create({data:{name:`${stamp}-${name}`,permissions}});roles.push(row.id);roleId=row.id}const row=await db.user.create({data:{email:`${stamp}-${name}@example.invalid`,name,role,roleId,passwordHash:'test-only'}});users.push(row.id);return row}
async function product(name,extra={}){const row=await db.product.create({data:{name,slug:`${stamp}-${name}`,sku:`${stamp}-${name}`,kind:'PHYSICAL',active:true,price:1000,priceMinor:1000n,costMinor:600n,currency:'IRT',stock:50,...extra}});products.push(row.id);return row}
async function call(method,body,query='',owner=api){const handler=owner===api?(method==='GET'?owner.GET_counter:owner.POST_counter):owner[method];const response=await handler(new NextRequest(`https://site.invalid/api/admin/store/counter${query}`,{method,headers:{Origin:'https://site.invalid','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:await response.json()}}
const phone=`+9891${String(Date.now()).slice(-8)}`
const line=id=>({productId:id,variantId:null,quantity:1,expectedUnitMinor:'1000',inputs:{}})
const sale=(sessionId,productId,extra={})=>({requestId:randomUUID(),confirmed:true,sessionId,method:'CASH',customerName:'خریدار آزمایشی',customerPhone:'',lines:[line(productId)],...extra})
async function proof(customer,code='482913'){
 const purpose=`COUNTER:${viewer.id}:${customer.id}`
 await db.otpCode.updateMany({where:{phone:customer.phone,purpose,consumedAt:null},data:{consumedAt:new Date()}})
 return db.otpCode.create({data:{phone:customer.phone,userId:customer.id,purpose,codeHash:createHmac('sha256',process.env.NEXTAUTH_SECRET).update(`otp:${customer.phone}:${code}`).digest('hex'),expiresAt:new Date(Date.now()+300000)}})
}
async function open(register){const result=await call('POST',{op:'register.open',requestId:randomUUID(),register:`${stamp}-${register}`,currency:'IRT',openingCashMinor:'100'});assert.equal(result.status,200,JSON.stringify(result.body));sessions.push(result.body.session.id);return result.body.session.id}
async function main(){
 const manager=await user('manager','dashboard.view,orders.manage,forms.handle,cms.pages'),other=await user('other','dashboard.view,orders.manage'),specialist=await user('specialist','dashboard.view,store.orders.handle')
 viewer=manager
 await sms.saveSmsConfig({enabled:true,apiKey:'fixture-local-only',fromNumber:'3000505'})
 const sessionId=await open('main'),item=await product('physical'),unknown=await product('unknown',{costMinor:null}),gift=await product('gift',{kind:'VIRTUAL',digitalMode:'CODES',stock:0})
 const held=await db.order.create({data:{productId:item.id,userId:manager.id,totalAmount:1000,totalMinor:1000n,currency:'IRT',status:'PAID',assigneeId:manager.id,createdAt:new Date(Date.now()-48*60*60_000)}})
 const managerDesk=await ordersOwner.adminOrders({work:'all'},{actorId:manager.id,manager:true})
 assert.ok(managerDesk.orders.some(row=>row.id===held.id));assert.ok(managerDesk.workCounts.overdue>=1,'manager sees paid work older than 24 hours as delayed')
 const specialistScope={actorId:specialist.id,manager:false}
 for(const work of ['all','pending','mine','unassigned','overdue']){
  const desk=await ordersOwner.adminOrders({work},specialistScope)
  assert.ok(!desk.orders.some(row=>row.id===held.id),`restricted staff cannot view colleague work in ${work}`)
  assert.equal(desk.workCounts.mine,0,`restricted mine count excludes colleague work in ${work}`)
 }
 const digital=load('src/modules/catalog/server/digital-delivery.ts'),stock=load('src/modules/catalog/server/code-stock.ts')
 for(let i=0;i<3;i++)await db.productDigitalCode.create({data:{productId:gift.id,secret:digital.encryptDigitalDelivery(`${stamp}-gift-${i}`),fingerprint:randomUUID()}})
 await db.$transaction(tx=>stock.syncCodeStock(tx,gift.id))
 const resolved=await call('POST',{op:'customer.resolve',phone,name:'خریدار آزمایشی'});assert.equal(resolved.status,200,JSON.stringify(resolved.body));const customer=resolved.body.customer;users.push(customer.id)
 assert.equal((await db.user.findUniqueOrThrow({where:{id:customer.id}})).phoneVerifiedAt,null,'staff entry is not verification')
 assert.equal((await call('POST',{op:'customer.resolve',phone:`0${phone.slice(-10)}`})).body.customer.id,customer.id)
 assert.equal((await identity.claimPhoneLogin(phone)).id,customer.id,'OTP login must retain the same canonical account')
 assert.ok((await db.user.findUniqueOrThrow({where:{id:customer.id}})).phoneVerifiedAt)
 const duplicate=await user('duplicate',null,'CUSTOMER');await db.user.update({where:{id:duplicate.id},data:{phone}})
 assert.equal((await call('POST',{op:'customer.resolve',phone})).status,409)
 await db.user.update({where:{id:duplicate.id},data:{phone:''}})
 const template=formDefs.TEMPLATES.find(x=>x.id==='mobile-repair').build(),form=await formsService.saveForm({...template,slug:`${stamp}-repair`,settings:{...template.settings,handlers:[manager.id]}});forms.push(form.id)
 const intake=await formsOwner.staffSubmit(form.id,{values:{name:'خریدار آزمایشی',mobile:phone,brand:'سامسونگ',model:'QA',issue:'سخت‌افزاری',description:'باتری',handover:'حضوری می‌آورم',consent:true}},manager)
 assert.equal((await db.formSubmission.findUniqueOrThrow({where:{id:intake.id}})).userId,customer.id)
 assert.equal((await formsOwner.receiptByToken(intake.receiptToken)).pickupCode,'','QR status receipt must not reveal handover proof')
 const repairPrint=await formsOwner.receiptOf(intake.id,'customer');assert.match(repairPrint.qr,/^data:image\/png/);assert.match(repairPrint.pickupCode,/^\d{6}$/)
 await db.walletAccount.create({data:{userId:customer.id,currency:'IRT',balanceMinor:500n}});await db.loyaltyAccount.create({data:{userId:customer.id,balance:20,lifetime:20}})
 const split=sale(sessionId,item.id,{customerId:customer.id,customerPhone:phone,method:'SPLIT',redeemPoints:10,walletCode:'482913',payments:[{method:'CASH',amountMinor:'200',reference:''},{method:'CARD',amountMinor:'300',reference:'QA-TERM'},{method:'WALLET',amountMinor:'500',reference:''}]})
 const challenge=await proof(customer)
 const wrong=await call('POST',{...split,walletCode:'111111'});assert.equal(wrong.status,400);assert.equal((await db.otpCode.findUniqueOrThrow({where:{id:challenge.id}})).attempts,1)
 const result=await call('POST',split);assert.equal(result.status,200,JSON.stringify(result.body));const orderId=result.body.orderId
 assert.equal((await call('GET',null,`?order=${orderId}`)).body.receipt.method,'SPLIT','persisted receipt retains the actual split method')
 assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:customer.id,currency:'IRT'}}})).balanceMinor,100n)
 assert.equal((await db.loyaltyAccount.findUniqueOrThrow({where:{userId:customer.id}})).balance,20,'ten spent and ten earned under the existing rules')
 const redemption=await db.loyaltyEntry.findFirstOrThrow({where:{userId:customer.id,kind:'REDEEM',orderId}})
 assert.ok(await db.walletTx.findUnique({where:{idempotencyKey:`loyalty:redeem:${redemption.id}`}}),'counter credit uses the canonical recovery identity')
 await db.loyaltyEntry.update({where:{id:redemption.id},data:{createdAt:new Date(Date.now()-20*60_000)}})
 await load('src/modules/store/server/marketing/customer-club.ts').recoverPointRedemptions()
 assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:customer.id,currency:'IRT'}}})).balanceMinor,100n,'scheduled recovery must not pay counter points a second time')
 const invoice=await db.invoice.findUniqueOrThrow({where:{orderId}});assert.equal(invoice.walletAppliedMinor,500n);assert.equal(invoice.paidAmountMinor,1000n)
 assert.equal(await db.payment.count({where:{orderId}}),3);assert.equal(await db.storeTender.count({where:{orderId}}),3)
 assert.ok((await db.otpCode.findUniqueOrThrow({where:{id:challenge.id}})).consumedAt)
 assert.equal((await call('POST',split)).body.orderId,orderId,'consumed proof does not prevent replay of its committed sale')
 assert.equal((await call('POST',{...split,reference:'changed'})).status,409)
 const stored=await db.order.findUniqueOrThrow({where:{id:orderId},include:{lines:true}});assert.equal(stored.lines[0].unitCostMinor,600n)
 await db.product.update({where:{id:item.id},data:{costMinor:900n}});assert.equal((await db.orderLine.findFirstOrThrow({where:{orderId}})).unitCostMinor,600n)
 const publicInvoice=await receipts.publicSaleReceipt(stored.receiptToken);assert.equal(publicInvoice.number,invoice.number);assert.ok(!JSON.stringify(publicInvoice).includes('codeSecret'));assert.ok(!JSON.stringify(publicInvoice).includes(phone))
 const event=await db.userNotification.findUniqueOrThrow({where:{dedupeKey:`counter:receipt:${orderId}`}});assert.equal(await db.backgroundJob.count({where:{dedupeKey:`notification:${event.id}:sms`}}),1)
 await db.user.update({where:{id:customer.id},data:{phone:'+989111111111',phoneVerifiedAt:null}})
 await assert.rejects(identity.claimPhoneLogin(phone),/سازگار نیست/,'an old phone-email alias must never claim an account whose phone changed')
 assert.equal((await call('POST',{op:'customer.resolve',phone})).status,409)
 assert.equal(await sms.notifyUserEvent({userId:customer.id,kind:'STORE_RECEIPT',titleFa:'fixture receipt',href:`/receipt/store/${stored.receiptToken}`}),null,'snapshot mismatch must not authorize an unverified destination')
 await db.user.update({where:{id:customer.id},data:{phone,phoneVerifiedAt:null}})
 await inbox.deliverInboxCopy(event.id,'sms');assert.ok(messages.some(x=>x.phones.includes(phone)&&x.text.includes(`/receipt/store/${stored.receiptToken}`)))
 const context=await call('GET',null,`?customer=${customer.id}`);assert.ok(context.body.history.some(x=>x.kind==='repair'));assert.ok(context.body.history.some(x=>x.kind==='sale'&&x.channel==='COUNTER'))
 for(const fault of ['audit','payment']){
  const check=await proof(customer),payload=sale(sessionId,item.id,{customerId:customer.id,customerPhone:phone,method:'WALLET',walletCode:'482913',payments:[{method:'WALLET',amountMinor:'1000',reference:''}]})
  await db.walletAccount.update({where:{userId_currency:{userId:customer.id,currency:'IRT'}},data:{balanceMinor:2000n}})
  if(fault==='audit')failAudit=true;else failPayment=true
  try{await assert.rejects(call('POST',payload),new RegExp(`${fault}-fault`))}finally{failAudit=failPayment=false}
  assert.equal(await db.order.count({where:{idempotencyKey:`counter:${manager.id}:${payload.requestId}`}}),0)
  assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:customer.id,currency:'IRT'}}})).balanceMinor,2000n)
  assert.equal((await db.otpCode.findUniqueOrThrow({where:{id:check.id}})).consumedAt,null,'financial rollback preserves successful proof')
 }
 const variant=await db.productVariant.create({data:{productId:item.id,sku:`${stamp}-variant`,name:'آبی',price:1000,priceMinor:1000n,stock:5,barcode:`B-${stamp}`}})
 assert.equal((await barcodes.scanCounterProduct(`MC-V-${variant.id}`)).variantId,variant.id)
 await assert.rejects(barcodes.scanCounterProduct('MC-V-999999999'),/پیدا نشد/)
 await assert.rejects(barcodes.scanCounterProduct('MC-P-0'),/پیدا نشد/)
 await db.product.update({where:{id:unknown.id},data:{sku:`MC-V-${variant.id}`}})
 await assert.rejects(barcodes.scanCounterProduct(`MC-V-${variant.id}`),/تکراری/)
 await db.product.update({where:{id:unknown.id},data:{sku:`${stamp}-unknown`}})
 assert.equal((await barcodes.scanCounterProduct(`B-${stamp}`)).variantId,variant.id)
 await db.product.update({where:{id:unknown.id},data:{barcode:`B-${stamp}`}});await assert.rejects(barcodes.scanCounterProduct(`B-${stamp}`),/تکراری/)
 assert.ok((await barcodes.productLabels('',item.id)).some(x=>x.variantId===variant.id))
 await db.product.update({where:{id:item.id},data:{stock:-1,lowStockAt:10}})
 const giftSale=await call('POST',sale(sessionId,gift.id));assert.equal(giftSale.status,200);assert.equal((await call('GET',null,`?order=${giftSale.body.orderId}`)).body.receipt.cards.length,1)
 await call('POST',sale(sessionId,unknown.id))
 await db.walletAccount.update({where:{userId_currency:{userId:customer.id,currency:'IRT'}},data:{balanceMinor:5000n}})
 const online=await checkout.executeCheckout({userId:customer.id,productId:unknown.id,shippingMode:'PICKUP',payWith:'wallet',idempotencyKey:`${stamp}-online`,siteUrl:'https://site.invalid'})
 assert.equal(online.ok,true,JSON.stringify(online));assert.equal(online.data.paid,true);const onlineId=online.data.orderId
 assert.equal((await db.invoice.findUniqueOrThrow({where:{orderId:onlineId}})).totalMinor,1000n,'pickup charges no shipping and requires no address')
 assert.ok(await db.storePickup.findUnique({where:{orderId:onlineId}}))
 const legacyDelivery=load('src/modules/catalog/server/http/admin/product-deliveries/route.ts'),deliveryId=(await db.productDelivery.findUniqueOrThrow({where:{orderId:onlineId}})).id
 const legacyChange=status=>legacyDelivery.PATCH(new NextRequest('https://site.invalid/api/admin/product-deliveries',{method:'PATCH',headers:{Origin:'https://site.invalid','Content-Type':'application/json'},body:JSON.stringify({id:deliveryId,status})}))
 assert.notEqual((await db.productDelivery.findUniqueOrThrow({where:{orderId:onlineId}})).status,'DELIVERED')
 assert.equal((await legacyChange('DELIVERED')).status,409,'legacy delivery API must not bypass customer proof')
 const ready=await call('POST',{orderId:onlineId,action:'ready'},'',pickupApi);assert.equal(ready.status,200,JSON.stringify(ready.body))
 assert.equal((await call('POST',{orderId:onlineId,action:'ready'},'',pickupApi)).status,200)
 assert.equal(await db.userNotification.count({where:{dedupeKey:`pickup:ready:${onlineId}`}}),1)
 assert.equal((await call('POST',{orderId:onlineId,action:'collect',code:'bad'},'',pickupApi)).status,403)
 assert.equal((await db.storePickup.findUniqueOrThrow({where:{orderId:onlineId}})).attempts,1)
 await assert.rejects(ordersOwner.transitionOrder({orderId:onlineId,to:'SHIPPED',actorId:manager.id}),/کد تحویل/)
 const oldCode=(await pickup.pickupForCustomer(customer.id,onlineId)).code
 for(let i=1;i<10;i++)assert.equal((await call('POST',{orderId:onlineId,action:'collect',code:'bad'},'',pickupApi)).status,403)
 assert.equal((await call('POST',{orderId:onlineId,action:'collect',code:oldCode},'',pickupApi)).status,409,'locked proof cannot collect')
 viewer=specialist;assert.equal((await call('POST',{orderId:onlineId,action:'reissue'},'',pickupApi)).status,403);viewer=manager
 assert.equal((await call('POST',{orderId:onlineId,action:'reissue'},'',pickupApi)).status,200)
 const picked=await pickup.pickupForCustomer(customer.id,onlineId);assert.match(picked.code,/^\d{6}$/)
 assert.notEqual(picked.code,oldCode);assert.equal((await call('POST',{orderId:onlineId,action:'collect',code:oldCode},'',pickupApi)).status,403)
 assert.equal(await pickup.pickupForCustomer(other.id,onlineId),null)
 const beforeStock=(await db.product.findUniqueOrThrow({where:{id:unknown.id}})).stock
 const concurrent=await Promise.all([call('POST',{orderId:onlineId,action:'collect',code:picked.code},'',pickupApi),call('POST',{orderId:onlineId,action:'collect',code:picked.code},'',pickupApi)])
 assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);assert.equal((await db.product.findUniqueOrThrow({where:{id:unknown.id}})).stock,beforeStock)
 assert.equal((await legacyChange('PENDING')).status,409,'legacy delivery API must not reopen a collected pickup')
 const report=await call('GET',null,'?report=1&days=30');assert.equal(report.status,200,JSON.stringify(report.body));assert.ok(report.body.channels.some(x=>x.channel==='COUNTER'));assert.ok(report.body.channels.some(x=>x.channel==='ONLINE'));assert.ok(report.body.channels.some(x=>BigInt(x.unknownLines)>0n));assert.ok(report.body.lowStock.some(x=>x.id===item.id&&x.variants.some(v=>v.id===variant.id)), 'custom threshold includes a low-stock variant even when parent stock is unlimited')
 viewer=other;assert.equal((await call('POST',{op:'register.close',sessionId,countedCashMinor:'0',countedCardMinor:'0'})).status,403)
 viewer=specialist;assert.equal((await call('GET',null,'?registers=1')).status,403);assert.equal((await call('POST',{orderId:onlineId,action:'collect',code:picked.code},'',pickupApi)).status,403)
 viewer=manager
 const adjustment={op:'register.adjust',requestId:randomUUID(),sessionId,method:'CASH',amountMinor:'-100',reason:'fixture drawer withdrawal'}
 assert.equal((await call('POST',adjustment)).status,200);assert.equal((await call('POST',adjustment)).status,200)
 await assert.rejects(db.storeTender.updateMany({where:{orderId},data:{amountMinor:1n}}),/immutable/)
 const state=(await call('GET',null,'?registers=1')).body.sessions.find(x=>x.id===sessionId),closed=await call('POST',{op:'register.close',sessionId,countedCashMinor:state.expectedCashMinor,countedCardMinor:state.expectedCardMinor})
 assert.equal(closed.status,200);assert.equal(closed.body.session.differenceCashMinor,'0');assert.equal((await call('POST',sale(sessionId,unknown.id))).status,409)
 await assert.rejects(db.storeRegisterSession.update({where:{id:sessionId},data:{countedCashMinor:0n}}),/immutable/)
 const raceSession=await open('race'),fresh=await product('last',{stock:1})
 const race=await Promise.all([call('POST',sale(raceSession,fresh.id)),call('POST',{op:'register.close',sessionId:raceSession,countedCashMinor:'100',countedCardMinor:'0'})]);assert.equal(race[1].status,200);assert.ok([200,409].includes(race[0].status));assert.equal((await db.storeRegisterSession.findUniqueOrThrow({where:{id:raceSession}})).status,'CLOSED')
 assert.equal(await db.storeTender.count({where:{sessionId:raceSession,createdAt:{gt:(await db.storeRegisterSession.findUniqueOrThrow({where:{id:raceSession}})).closedAt}}}),0)
 moduleOn=false;assert.equal((await call('GET',null,'?registers=1')).status,404)
 console.log('PASS unified Store desk: canonical phone/login/repair history, exact split wallet/points/proof and rollback, deduped receipt SMS/QR privacy, barcode/variant ambiguity, real online pickup checkout and one-time handover, currency/channel known-cost report, cashier close/immutability/race and authority')
}
main().finally(async()=>{
 failAudit=failPayment=false
 const rows=await db.order.findMany({where:{productId:{in:products}},select:{id:true}}),ids=rows.map(x=>x.id)
 await db.storePickup.deleteMany({where:{orderId:{in:ids}}});await db.storeTender.deleteMany({where:{orderId:{in:ids}}});await db.storeRegisterAdjustment.deleteMany({where:{sessionId:{in:sessions}}})
 await db.fulfillmentJob.deleteMany({where:{orderId:{in:ids}}});await db.payment.deleteMany({where:{orderId:{in:ids}}});await db.invoice.deleteMany({where:{orderId:{in:ids}}});await db.inventoryReservation.deleteMany({where:{orderId:{in:ids}}});await db.productDigitalCode.deleteMany({where:{productId:{in:products}}});await db.productDelivery.deleteMany({where:{orderId:{in:ids}}});await db.orderEvent.deleteMany({where:{orderId:{in:ids}}});await db.orderLine.deleteMany({where:{orderId:{in:ids}}});await db.order.deleteMany({where:{id:{in:ids}}})
 await db.siteForm.deleteMany({where:{id:{in:forms}}});await db.storeRegisterSession.deleteMany({where:{id:{in:sessions}}});await db.productVariant.deleteMany({where:{productId:{in:products}}});await db.product.deleteMany({where:{id:{in:products}}})
 const notices=await db.userNotification.findMany({where:{userId:{in:users}},select:{id:true}});for(const row of notices)await db.backgroundJob.deleteMany({where:{dedupeKey:{startsWith:`notification:${row.id}:`}}})
 await db.userNotification.deleteMany({where:{userId:{in:users}}});await db.walletTx.deleteMany({where:{userId:{in:users}}});await db.walletAccount.deleteMany({where:{userId:{in:users}}});await db.loyaltyEntry.deleteMany({where:{userId:{in:users}}});await db.loyaltyAccount.deleteMany({where:{userId:{in:users}}});await db.otpCode.deleteMany({where:{userId:{in:users}}});await db.smsLog.deleteMany({where:{userId:{in:users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}})
 const smsBefore=await smsBeforePromise;if(smsBefore)await db.setting.upsert({where:{key:smsBefore.key},create:smsBefore,update:{value:smsBefore.value}});else await db.setting.deleteMany({where:{key:'sms.config.v1'}})
 await db.$disconnect()
}).catch(error=>{console.error(error);process.exitCode=1})
