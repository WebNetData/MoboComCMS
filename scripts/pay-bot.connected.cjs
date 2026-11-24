// Actual PostgreSQL Pay/Wallet/Audit/queue. Only auth transport and outbound bot/provider boundaries are controlled.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
if(!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid').pathname.slice(1)))throw Error('Disposable Pay test database required')
process.env.PANEL_CREDENTIAL_KEY='12'.repeat(32)
process.env.NEXTAUTH_URL='https://mobocom.invalid'
process.env.MOBOCOM_PAY_BANK_PROVIDER='fixture'
process.env.MOBOCOM_PAY_BANK_SECRET='synthetic-fixture-secret-only-0123456789abcdef'
const prisma=new PrismaClient(),stamp='bot-'+randomUUID(),users=[],keys=['billing.mobocom-pay.v1','publicApiEnabled'],snapshots=new Map()
const state={enabled:true,globalDenied:false,maintenance:false,auditFault:false,mode:'ok',sends:0}
function wrap(client){return new Proxy(client,{get(target,name){if(name==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options);if(name==='auditLog')return new Proxy(target.auditLog,{get(model,method){if(method==='create')return args=>{if(state.auditFault&&args.data.action==='mobocom-pay.payment.verified')throw Error('late audit fault');return model.create(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[name]==='function'?target[name].bind(target):target[name]}})}
const db=wrap(prisma),mocks={
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 '@/extensions/server/modules':{isModuleEnabled:async()=>state.enabled},
 '@/modules/identity/server/access':{resolveCurrentUser: async (id, _at, tx = db) => { const u = await tx.user.findUnique({where:{id}}); return u?.status === 'ACTIVE' ? u : null },requireUser:async(req,tx=db)=>tx.user.findUnique({where:{id:Number(req.headers.get('x-fixture-user'))}}),requirePerm:async(req,_p,tx=db)=>tx.user.findUnique({where:{id:Number(req.headers.get('x-fixture-user'))}})},
 '@/modules/identity/server/authentication-restrictions':{globalAuthenticationDenied:async()=>state.globalDenied},
 '@/modules/account/server/section-access':{userOpensSection:async()=>true},
 '@/modules/site/server/maintenance':{loadMaintenance:async()=>state.maintenance?{'mobocom-pay':{enabled:true}}:{}},
 '@/modules/billing/server/pay/bot/transport':{sendBotVerification:async(url,token,id)=>{state.sends++;assert.equal(url,'https://merchant.invalid/api/payment');assert.equal(token,'independent-bot-payment-secret');assert.ok(id.startsWith('order-'));if(state.mode==='timeout')throw Error('transport interrupted');return {status:200,body:state.mode==='unknown'?'{"unknown":true}':'{"ok":true}'}}},
}
const load=require('./connected-source-loader.cjs')(mocks),pay=load('src/modules/billing/server/pay.ts'),policy=load('src/modules/billing/domain/pay-policy.ts')
let merchant,otherMerchant,terminal,bank,gateway,connection
const put=(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{value}})
const actor=u=>({id:u.id,email:u.email,req:new NextRequest('https://mobocom.invalid/api/pay',{headers:{origin:'https://mobocom.invalid','x-fixture-user':String(u.id)}})})
async function main(){
 for(const key of keys)snapshots.set(key,await db.setting.findUnique({where:{key}}))
 for(const label of['owner','other','admin'])users.push(await db.user.create({data:{email:stamp+label+'@example.invalid',passwordHash:'!'}}))
 const a=actor(users[0]),b=actor(users[1]),r=actor(users[2])
 bank=await db.bankAccount.create({data:{bankName:stamp,holderName:stamp,accountNumber:'123456789'}})
 gateway=await db.gateway.create({data:{name:stamp,provider:'CARD_TRANSFER',active:true,fiat:'IRR'}})
 await put(keys[0],JSON.stringify({...policy.defaults(),incomingEnabled:true,providerId:'fixture',bankAccountIds:[bank.id],minPaymentRial:'1'}));await put(keys[1],'true')
 merchant=await pay.enrollMerchant(r,{userId:users[0].id,note:'Synthetic Admin provision',name:stamp,website:'https://merchant.invalid'});await pay.changeMerchant(r,{id:merchant.id,status:'ACTIVE'})
 terminal=await pay.createTerminal(a,{name:stamp,returnUrl:'https://merchant.invalid/return'})
 const config={terminalId:terminal.id,version:0,callbackUrl:'https://merchant.invalid/api/payment',callbackToken:'independent-bot-payment-secret',ackPolicy:'JSON_OK',responseMode:'URL',active:true}
 await assert.rejects(pay.saveBotIntegration(b,config),e=>e.status===403)
 otherMerchant=await pay.enrollMerchant(r,{userId:users[1].id,note:'Synthetic Admin provision',name:stamp+'other',website:'https://merchant.invalid'});await pay.changeMerchant(r,{id:otherMerchant.id,status:'ACTIVE'})
 await assert.rejects(pay.saveBotIntegration(b,config),e=>e.status===404)
 assert.deepEqual(await pay.botIntegrations(b),[])
 await assert.rejects(pay.saveBotIntegration(a,{...config,ackPolicy:'UNCONFIGURED'}))
 await assert.rejects(pay.saveBotIntegration(a,{...config,callbackUrl:'https://foreign.invalid/api/payment'}))
 const created=await pay.saveBotIntegration(a,config);connection=created.integration
 const token=created.token;assert.match(token,/^mcpbot_/)
 const stored=await db.payBotIntegration.findUniqueOrThrow({where:{id:connection.id}});assert.notEqual(stored.keyHash,token);assert.match(stored.callbackTokenCiphertext,/^encv1:/)
 assert.equal(JSON.stringify(await pay.botIntegrations(a)).includes('independent-bot-payment-secret'),false)
 const input={api_key:token,amount:10000,order_id:'order-one',user_id:123456789,type:'purchase',payment_count:3,membership_days:45,register:1735689600,balance:25000,username:'example',first_name:'علی'}
 const create=data=>pay.createBotPayment(new NextRequest('https://mobocom.invalid/api/v1/pay/bot/'+connection.id),connection.id,data)
 const results=await Promise.all([create(input),create(input)]);assert.equal(results[0].url,results[1].url)
 const paymentId=new URL(results[0].url).pathname.split('/').pop()
 let payment=await db.payPayment.findUniqueOrThrow({where:{id:paymentId}}),delivery=await db.payBotDelivery.findUniqueOrThrow({where:{paymentId}})
 assert.equal(payment.amountMinor,100000n);assert.equal(payment.status,'PENDING');assert.equal(delivery.status,'WAITING')
 await pay.deliverBotPayment({deliveryId:delivery.id});assert.equal(state.sends,0)
 await assert.rejects(create({...input,amount:10001}),e=>e.status===409)
 await assert.rejects(create({...input,user_id:987654321}),e=>e.status===409)
 await assert.rejects(create({...input,amount:1.2}));await assert.rejects(create({...input,api_key:'bad'}))
 state.enabled=false;await assert.rejects(create(input));state.enabled=true
 state.globalDenied=true;await assert.rejects(create(input));state.globalDenied=false
 await assert.rejects(db.payBotDelivery.update({where:{id:delivery.id},data:{status:'QUEUED'}}),'database denies pre-payment delivery')
 async function settle(id,ref){
  await db.payPayment.update({where:{id},data:{payerVerifiedAt:new Date()}})
  await pay.reportPayReference(id,ref)
  const row=await db.payPayment.findUniqueOrThrow({where:{id}})
  return pay.acceptBankEvent({providerId:'fixture',externalId:stamp+ref,bankAccountId:bank.id,transferReference:ref,amountRial:row.totalMinor.toString(),occurredAt:new Date().toISOString(),targetPaymentId:id},stamp+ref)
 }
 state.auditFault=true;await assert.rejects(settle(paymentId,'BOTREF001'),/late audit fault/);state.auditFault=false
 assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:paymentId}})).status,'PENDING')
 assert.equal((await db.payBotDelivery.findUniqueOrThrow({where:{paymentId}})).status,'WAITING')
 assert.equal(await db.backgroundJob.count({where:{kind:'pay.bot-delivery',payload:{contains:delivery.id}}}),0)
 await settle(paymentId,'BOTREF001');delivery=await db.payBotDelivery.findUniqueOrThrow({where:{paymentId}})
 assert.equal(delivery.status,'QUEUED');assert.equal(await db.walletTx.count({where:{userId:a.id,type:'PAY_CREDIT'}}),1)
 assert.equal(await db.backgroundJob.count({where:{kind:'pay.bot-delivery',payload:{contains:delivery.id}}}),1)
 for(const flag of ['enabled','maintenance']){
  state[flag]=flag==='maintenance';await pay.deliverBotPayment({deliveryId:delivery.id});assert.equal(state.sends,0)
  delivery=await db.payBotDelivery.findUniqueOrThrow({where:{id:delivery.id}});assert.equal(delivery.status,'BLOCKED')
  state[flag]=flag==='enabled';await pay.recoverBotDelivery(a,{id:delivery.id,version:delivery.version,action:'retry',confirmed:true})
 }
 state.mode='unknown';await Promise.all([pay.deliverBotPayment({deliveryId:delivery.id}),pay.deliverBotPayment({deliveryId:delivery.id})]);assert.equal(state.sends,1)
 delivery=await db.payBotDelivery.findUniqueOrThrow({where:{id:delivery.id}});assert.equal(delivery.status,'UNKNOWN')
 await pay.deliverBotPayment({deliveryId:delivery.id});assert.equal(state.sends,1,'unknown outcome never retries automatically')
 await assert.rejects(pay.recoverBotDelivery(b,{id:delivery.id,version:delivery.version,action:'retry',confirmed:true}),e=>e.status===404)
 assert.deepEqual(await pay.botDeliveries(b),[])
 await assert.rejects(pay.recoverBotDelivery(a,{id:delivery.id,version:delivery.version,action:'retry',confirmed:false}))
 await pay.recoverBotDelivery(a,{id:delivery.id,version:delivery.version,action:'retry',confirmed:true})
 await assert.rejects(pay.recoverBotDelivery(a,{id:delivery.id,version:delivery.version,action:'retry',confirmed:true}),e=>e.status===409)
 state.mode='ok';await pay.deliverBotPayment({deliveryId:delivery.id});assert.equal((await db.payBotDelivery.findUniqueOrThrow({where:{id:delivery.id}})).status,'SENT');assert.equal(state.sends,2)
 await pay.deliverBotPayment({deliveryId:delivery.id});assert.equal(state.sends,2)
 const second=await create({...input,order_id:'order-two'}),secondId=new URL(second.url).pathname.split('/').pop()
 await settle(secondId,'BOTREF002');let next=await db.payBotDelivery.findUniqueOrThrow({where:{paymentId:secondId}})
 const rotated=await pay.saveBotIntegration(a,{...config,version:connection.version,rotateKey:true,responseMode:'LINKS',callbackToken:''});connection=rotated.integration
 await assert.rejects(create(input),e=>e.status===401)
 const list=await create({...input,api_key:rotated.token,order_id:'order-three'});assert.equal(list.links.length,1)
 const thirdId=new URL(list.links[0].url).pathname.split('/').pop()
 const now=Date.now;Date.now=()=>now()+3600000
 try{assert.equal((await pay.botDeliveries(a)).find(row=>row.paymentId===thirdId).paymentStatus,'EXPIRED')}finally{Date.now=now}
 await pay.deliverBotPayment({deliveryId:next.id});next=await db.payBotDelivery.findUniqueOrThrow({where:{id:next.id}});assert.equal(next.status,'BLOCKED')
 await pay.recoverBotDelivery(a,{id:next.id,version:next.version,action:'retry',confirmed:true});await pay.deliverBotPayment({deliveryId:next.id});assert.equal((await db.payBotDelivery.findUniqueOrThrow({where:{id:next.id}})).status,'SENT')
 const fourth=await create({...input,api_key:rotated.token,order_id:'order-four'}),fourthId=new URL(fourth.links[0].url).pathname.split('/').pop();await settle(fourthId,'BOTREF004')
 let interrupted=await db.payBotDelivery.findUniqueOrThrow({where:{paymentId:fourthId}})
 await db.payBotDelivery.update({where:{id:interrupted.id},data:{status:'SENDING',attemptToken:randomUUID(),lastAttemptAt:new Date(Date.now()-130000)}})
 const sends=state.sends;await pay.deliverBotPayment({deliveryId:interrupted.id});assert.equal(state.sends,sends);interrupted=await db.payBotDelivery.findUniqueOrThrow({where:{id:interrupted.id}});assert.equal(interrupted.status,'UNKNOWN')
 await pay.recoverBotDelivery(a,{id:interrupted.id,version:interrupted.version,action:'confirm',confirmed:true});assert.equal(state.sends,sends)
 assert.equal(await db.walletTx.count({where:{userId:a.id,type:'PAY_CREDIT'}}),3,'delivery retries never repeat Wallet credit')
 console.log('Pay bot native acceptance: exact Toman, terminal keys, concurrent idempotency, current authority, financial/delivery atomicity, privacy, uncertain response, rotation, interrupted lease and explicit recovery passed')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{
  const ids=merchant?(await db.payBotDelivery.findMany({where:{payment:{merchantId:merchant.id}},select:{id:true}})).map(x=>x.id):[]
  if(ids.length)await db.backgroundJob.deleteMany({where:{kind:'pay.bot-delivery',OR:ids.map(id=>({payload:{contains:id}}))}})
  if(merchant){await db.payBotDelivery.deleteMany({where:{payment:{merchantId:merchant.id}}});await db.payBotIntegration.deleteMany({where:{terminal:{merchantId:merchant.id}}});await db.payBankEvent.deleteMany({where:{bankAccountId:bank.id}});await db.payPayment.deleteMany({where:{merchantId:merchant.id}});await db.payTerminal.deleteMany({where:{merchantId:merchant.id}});await db.payMerchant.deleteMany({where:{id:merchant.id}})}
  if(otherMerchant)await db.payMerchant.deleteMany({where:{id:otherMerchant.id}})
  const idsUsers=users.map(u=>u.id)
  await db.payment.deleteMany({where:{userId:{in:idsUsers}}});await db.walletTx.deleteMany({where:{userId:{in:idsUsers}}});await db.walletAccount.deleteMany({where:{userId:{in:idsUsers}}});await db.auditLog.deleteMany({where:{actorUserId:{in:idsUsers}}});await db.userNotification.deleteMany({where:{userId:{in:idsUsers}}});await db.user.deleteMany({where:{id:{in:idsUsers}}})
  if(gateway)await db.gateway.delete({where:{id:gateway.id}});if(bank)await db.bankAccount.delete({where:{id:bank.id}})
  for(const[key,row]of snapshots){if(row)await put(key,row.value);else await db.setting.deleteMany({where:{key}})}
 }catch(e){console.error('Owned fixture cleanup failed',e);process.exitCode=1}finally{await db.$disconnect()}
})
