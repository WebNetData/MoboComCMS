// Shared disposable native fixture; real financial owners, doubled external HTTPS only.
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
module.exports=async function setup(label){
 if(!/^mobocom_pay_test_[a-z0-9_]+$/.test(new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid').pathname.slice(1)))throw Error('Disposable Pay DB required')
 process.env.NEXTAUTH_SECRET=randomBytes(32).toString('hex');process.env.NEXTAUTH_URL='https://mobocom.invalid';process.env.PANEL_CREDENTIAL_KEY='12'.repeat(32);process.env.MOBOCOM_PAY_BANK_PROVIDER='fixture';process.env.MOBOCOM_PAY_BANK_SECRET='synthetic-fixture-secret-only-0123456789abcdef'
 const db=new PrismaClient(),stamp=label+'-'+randomUUID(),users=[],merchantIds=[],bankIds=[],gatewayIds=[],roles=[],keys=['billing.mobocom-pay.v1','extension.mobocom-pay.state.v1','security.policy.v1','publicApiEnabled','site.section-access.v1','site.maintenance.v1'],snapshots=new Map(),calls=[]
 let transport=async()=>({status:204,body:''}),auditFault=false
 const sourceDb=new Proxy(db,{get(t,k){if(k==='$transaction')return(work,options)=>t.$transaction(tx=>work(new Proxy(tx,{get(x,n){if(n==='auditLog')return new Proxy(x.auditLog,{get(m,f){if(f==='create')return args=>{if(auditFault&&(String(args.data.action).includes('webhook')||String(args.data.action)==='mobocom-pay.payment.verified'))throw Error('synthetic webhook audit failure');return m.create(args)};return typeof m[f]==='function'?m[f].bind(m):m[f]}});return typeof x[n]==='function'?x[n].bind(x):x[n]}})),options);return typeof t[k]==='function'?t[k].bind(t):t[k]}})
 const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db:sourceDb},react:{...require('react'),cache:fn=>fn},'../outbound':{publicHttpsPost:async(...args)=>{calls.push(args);return transport(...args)}}}),pay=load('src/modules/billing/server/pay.ts'),policy=load('src/modules/billing/domain/pay-policy.ts'),access=load('src/modules/identity/server/access.ts')
 const put=(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{value}})
 for(const key of keys)snapshots.set(key,await db.setting.findUnique({where:{key}}))
 for(const[name,role]of[['first','ADMIN'],['second','ADMIN'],['owner','CUSTOMER'],['other','CUSTOMER']])users.push(await db.user.create({data:{name,email:stamp+'-'+name+'@example.invalid',passwordHash:'!',role,status:'ACTIVE'}}))
 const actors=await Promise.all(users.map(async u=>{const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(u.id),authAt:Date.now()-1000}});return{id:u.id,email:u.email,req:new NextRequest('https://mobocom.invalid/api/pay',{headers:{cookie:'__Secure-next-auth.session-token='+token,origin:'https://mobocom.invalid'}})}}))
 let settings={...policy.defaults(),incomingEnabled:true,providerId:'fixture',minPaymentRial:'1',minSettlementRial:'1',bankAccountIds:[]}
 await put(keys[1],'{"enabled":true,"settings":{}}');await put(keys[2],'{"requireAdmin2fa":false}');await put(keys[3],'true');await put(keys[4],'{}');access.clearAdminPolicyCache()
 const bank=await db.bankAccount.create({data:{bankName:stamp,holderName:stamp,accountNumber:stamp,collectionUse:'GENERAL',active:true}});bankIds.push(bank.id)
 const gateway=await db.gateway.create({data:{name:stamp,provider:'CARD_TRANSFER',active:true,fiat:'IRR'}});gatewayIds.push(gateway.id);settings.bankAccountIds=[bank.id];await put(keys[0],JSON.stringify(settings))
 const merchant=await pay.enrollMerchant(actors[0],{userId:actors[2].id,name:stamp,website:'https://merchant.invalid',note:'Synthetic setup'});merchantIds.push(merchant.id)
 await pay.manageMerchant(actors[0],{id:merchant.id,version:(await db.payMerchant.findUniqueOrThrow({where:{id:merchant.id}})).version,action:'status',status:'ACTIVE',note:'Synthetic activation'})
 const terminal=await pay.createTerminal(actors[2],{name:'Synthetic link',channelType:'PAYMENT_LINK'})
 let serial=0
 async function paid(amount='10000000'){
  const p=await pay.createPayPayment(actors[2],{terminalId:terminal.id,externalId:stamp+'-'+(++serial),amountRial:amount},randomUUID())
  await db.payPayment.updateMany({where:{id:p.id,status:'PENDING',payerVerifiedAt:null},data:{payerVerifiedAt:new Date(),payerSessionHash:createHash('sha256').update(randomUUID()).digest('hex')}})
  const reference='PC'+randomUUID().replaceAll('-','').slice(0,24);await pay.reportPayReference(p.id,reference)
  const event={providerId:'fixture',externalId:stamp+serial,transferReference:reference,amountRial:amount,bankAccountId:bank.id,occurredAt:new Date().toISOString(),targetPaymentId:p.id}
  await pay.acceptBankEvent(event,'synthetic');return{payment:await db.payPayment.findUniqueOrThrow({where:{id:p.id}}),event}
 }
 async function cleanup(){
  const mids=merchantIds,ids=users.map(u=>u.id),payments=await db.payPayment.findMany({where:{merchantId:{in:mids}},select:{id:true,invoiceId:true}}),pids=payments.map(p=>p.id),invoices=payments.map(p=>p.invoiceId).filter(Boolean),deliveries=await db.payWebhookDelivery.findMany({where:{paymentId:{in:pids}},select:{id:true}}),dids=deliveries.map(d=>d.id)
  if(dids.length)await db.backgroundJob.deleteMany({where:{kind:'pay.webhook-delivery',OR:dids.map(id=>({payload:{contains:id}}))}})
  for(const[table,trigger,work]of [['PayWebhookAttempt','PayWebhookAttempt_guard',()=>db.payWebhookAttempt.deleteMany({where:{deliveryId:{in:dids}}})],['PayWebhookDelivery','PayWebhookDelivery_guard',()=>db.payWebhookDelivery.deleteMany({where:{id:{in:dids}}})],['PayWebhookEndpoint','PayWebhookEndpoint_guard',()=>db.payWebhookEndpoint.deleteMany({where:{terminal:{merchantId:{in:mids}}}})]]){await db.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);try{await work()}finally{await db.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`)}}
  await db.paySettlement.deleteMany({where:{merchantId:{in:mids}}});await db.paySettlementQuote.deleteMany({where:{merchantId:{in:mids}}})
  await db.$executeRawUnsafe('ALTER TABLE "PaySettlementDestination" DISABLE TRIGGER "PaySettlementDestination_guard"');try{await db.paySettlementDestination.deleteMany({where:{merchantId:{in:mids}}})}finally{await db.$executeRawUnsafe('ALTER TABLE "PaySettlementDestination" ENABLE TRIGGER "PaySettlementDestination_guard"')}
  await db.payBankEvent.deleteMany({where:{bankAccountId:{in:bankIds}}});await db.payPayment.deleteMany({where:{id:{in:pids}}});await db.payTerminal.deleteMany({where:{merchantId:{in:mids}}});await db.payMerchant.deleteMany({where:{id:{in:mids}}})
  await db.payment.deleteMany({where:{OR:[{invoiceId:{in:invoices}},{userId:{in:ids},provider:'MOBOCOM_PAY'}]}});await db.invoice.deleteMany({where:{id:{in:invoices}}});await db.walletTx.deleteMany({where:{userId:{in:ids}}});await db.walletAccount.deleteMany({where:{userId:{in:ids}}});await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}});await db.userNotification.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.role.deleteMany({where:{id:{in:roles}}});await db.bankAccount.deleteMany({where:{id:{in:bankIds}}});await db.gateway.deleteMany({where:{id:{in:gatewayIds}}})
  for(const[k,row]of snapshots)if(row)await put(k,row.value);else await db.setting.deleteMany({where:{key:k}});delete globalThis.__mobocomSectionAccess;access.clearAdminPolicyCache();await db.$disconnect()
 }
 return{db,load,pay,policy,actors,merchant,terminal,bank,gateway,stamp,calls,put,paid,cleanup,setTransport:fn=>transport=fn,setAuditFault:v=>auditFault=v,setPolicy:async patch=>{settings=policy.normalizePaySettings({...settings,...patch});await put(keys[0],JSON.stringify(settings));return settings}}
}
