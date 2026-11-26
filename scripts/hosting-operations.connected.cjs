// Owned PostgreSQL; production operation/queue/audit/settlement owners, synthetic external drivers.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),source=require('./connected-source-loader.cjs')
const db=new PrismaClient(),prefix='cloudop-'+Date.now(),ids={users:[],providers:[],products:[],domains:[],tlds:[],orders:[]},state={enabled:true,allowed:true,denied:false,staff:true,writes:0,reads:0,result:null,hold:null}
process.env.PANEL_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex')
const mocks={'@/platform/database/prisma':{db},'@/modules/billing/server/billing':{voidOpenInvoice:async()=>{throw Error('Unexpected invoice void')}},'@/extensions/server/modules':{isModuleEnabled:async()=>state.enabled},'@/modules/account/server/section-access':{userOpensSection:async()=>state.allowed},'@/modules/identity/server/authentication-restrictions':{globalAuthenticationDenied:async()=>state.denied},'@/modules/identity/server/access':{resolveCurrentUser:async()=>({id:1}),currentAdminHasPermission:()=>state.staff}}
const nativeRead=fs.readFileSync;if(process.env.HOSTING_CLOUD_FAULT==='repeat')fs.readFileSync=function(file,...args){const value=nativeRead.call(fs,file,...args);return typeof value==='string'&&String(file).replaceAll('\\','/').endsWith('cloud-operations/runner.ts')?value.replace("attempt.mode === 'write'",'true'):value}
const load=source(mocks),owner=load('src/modules/hosting/server/cloud-operations.ts'),common=load('src/modules/hosting/server/cloud-operations/common.ts'),registry=load('src/modules/hosting/server/drivers/registry.ts'),credentials=load('src/modules/providers/server/panel-credentials.ts');fs.readFileSync=nativeRead
function register(driver){registry.registerHostingDriver(driver,c=>({id:driver,capabilities:['create','start','stop','shutdown','reboot','delete','register','renew'],testConnection:async()=>({ok:true}),performOperation:async input=>{state.writes++;if(state.hold)await state.hold;return state.result||{state:'UNKNOWN',code:'SYNTHETIC_LOST_RESPONSE'}},inspectOperation:async input=>{state.reads++;return state.result||{state:'UNKNOWN',code:'SYNTHETIC_PENDING'}}}))}
const get=id=>db.hostingOperation.findUniqueOrThrow({where:{id}})
async function paid(user,meta){const order=await db.order.create({data:{userId:user.id,status:'PAID',totalAmount:100,totalMinor:100n,currency:'IRT',meta:JSON.stringify(meta)}});ids.orders.push(order.id);await db.invoice.create({data:{orderId:order.id,userId:user.id,number:prefix+'-'+order.id,status:'PAID',totalMinor:100n,currency:'IRT',paidAt:new Date()}});return order}
async function main(){
 const user=await db.user.create({data:{email:prefix+'@example.invalid',passwordHash:'!'}});ids.users.push(user.id)
 const provider=await db.hostingProvider.create({data:{name:prefix,family:'COMPUTE',driver:'TEST_OPERATIONS',url:'https://synthetic.invalid',secret:credentials.encryptPanelCredential('synthetic-key'),config:JSON.stringify({autoOperations:true})}});ids.providers.push(provider.id);register('TEST_OPERATIONS')
 const product=await db.hostingProduct.create({data:{slug:prefix,name:prefix,kind:'CLOUD_SERVER',fulfillment:'DRIVER',providerId:provider.id,providerPlan:'test'}});ids.products.push(product.id)
 const make=async()=>{const order=await paid(user,{kind:'hosting'});return db.hostingService.create({data:{userId:user.id,productId:product.id,providerId:provider.id,orderId:order.id,label:prefix,hostname:'test.example.invalid',cycle:'MONTH',priceMinor:100n}})}
 const service=await make(),op=await owner.queueServiceOperation(service.id),frozen=common.decode(op.snapshot)
 assert.equal((await owner.queueServiceOperation(service.id)).id,op.id);assert.ok(op.snapshot.startsWith('encv1:'));assert.ok(!op.snapshot.includes(frozen.input.password));assert.equal(await db.backgroundJob.count({where:{dedupeKey:'hosting-operation:'+op.id+':1'}}),1)
 assert.equal((await db.hostingService.findUniqueOrThrow({where:{id:service.id}})).status,'PROVISIONING')
 const invoice=await db.invoice.findUniqueOrThrow({where:{orderId:service.orderId}}),closure=load('src/modules/billing/server/order-closure.ts');assert.equal((await closure.refundPaidInvoice(invoice,{totalMinor:100n,walletMinor:100n,by:'synthetic',actorId:user.id})).status,409)
 await assert.rejects(db.invoice.updateMany({where:{id:invoice.id,status:'PAID'},data:{status:'REFUNDED'}}),/cloud operation is unresolved/);await assert.rejects(db.order.updateMany({where:{id:service.orderId,status:'PAID'},data:{status:'REFUNDED'}}),/cloud operation is unresolved/);assert.equal((await db.invoice.findUniqueOrThrow({where:{id:invoice.id}})).status,'PAID');assert.equal(await db.payment.count({where:{invoiceId:invoice.id,status:'REFUNDED'}}),0)
 await assert.rejects(db.hostingService.updateMany({where:{id:service.id,status:'PROVISIONING'},data:{status:'FAILED'}}),/cloud operation is unresolved/)
 await assert.rejects(owner.assertNoCloudOperation(service.id),/تعیین تکلیف/)
 let release;state.hold=new Promise(r=>release=r)
 const one=owner.runCloudOperation({id:op.id});while(!state.writes)await new Promise(r=>setTimeout(r,5))
 const second=await owner.runCloudOperation({id:op.id});assert.equal(second.status,'RUNNING');release();await one;state.hold=null
 assert.equal(state.writes,1);assert.equal((await get(op.id)).status,'UNKNOWN')
 await owner.runCloudOperation({id:op.id});assert.equal(state.writes,1,'uncertain writes are never automatically repeated');assert.equal(state.reads,1)
 assert.equal((await db.hostingService.findUniqueOrThrow({where:{id:service.id}})).status,'PROVISIONING')
 state.result={state:'DONE',code:'SYNTHETIC_CONFIRMED',resourceId:'resource-1',data:{ipv4:'198.51.100.5',powerState:'RUNNING'}}
 await owner.runCloudOperation({id:op.id});await owner.runCloudOperation({id:op.id})
 const active=await db.hostingService.findUniqueOrThrow({where:{id:service.id}});assert.equal(active.status,'ACTIVE');assert.equal(credentials.decryptPanelCredential(active.loginSecret),frozen.input.password);assert.equal(await db.hostingAction.count({where:{idempotencyKey:'cloud-result:'+op.id}}),1)
 assert.equal(await db.userNotification.count({where:{dedupeKey:'cloud-result:'+op.id}}),1);assert.equal(await db.walletTx.count({where:{userId:user.id}}),0,'provider settlement never credits/debits a wallet')
 const view=await owner.operationOverview();assert.doesNotMatch(JSON.stringify(view),/snapshot|synthetic-key|loginSecret/)
 state.result={state:'PENDING',code:'SYNTHETIC_PENDING',reference:'task-1'}
 const stop=await owner.queueServiceOperation(service.id,'SHUTDOWN',{kind:'CUSTOMER',id:user.id,key:'stop-0001'})
 await owner.runCloudOperation({id:stop.id});assert.equal((await get(stop.id)).status,'PENDING');assert.equal((await db.hostingService.findUniqueOrThrow({where:{id:service.id}})).powerState,'RUNNING')
 await assert.rejects(owner.queueServiceOperation(service.id,'START',{key:'start-0001'}),/تعیین تکلیف/)
 state.result={state:'DONE',code:'SYNTHETIC_STOPPED',data:{powerState:'STOPPED'}};await owner.runCloudOperation({id:stop.id});assert.equal((await db.hostingService.findUniqueOrThrow({where:{id:service.id}})).powerState,'STOPPED')
 await assert.rejects(owner.queueServiceOperation(service.id,'UNSUSPEND',{key:'invalid-state'}),/وضعیت سرویس/)
 // Off/revocation/config changes are checked at dispatch, after enqueue.
 let rejectedIntent
 for(const kind of ['module','section','global','staff','automation','provider']){
  const item=await make(),intent=await owner.queueServiceOperation(item.id,'CREATE',kind==='staff'?{kind:'STAFF',id:user.id}:{}),before=state.writes
  if(kind==='module')state.enabled=false;if(kind==='section')state.allowed=false;if(kind==='global')state.denied=true;if(kind==='staff')state.staff=false;if(kind==='provider')await db.hostingProvider.update({where:{id:provider.id},data:{secret:credentials.encryptPanelCredential('changed')}})
  if(kind==='automation')await db.hostingProvider.update({where:{id:provider.id},data:{config:'{"autoOperations":false}'}})
  await owner.runCloudOperation({id:intent.id});assert.equal((await get(intent.id)).status,'FAILED');assert.equal(state.writes,before,kind+' prevents dispatch')
  state.enabled=state.allowed=state.staff=true;state.denied=false
  if(kind==='automation')await db.hostingProvider.update({where:{id:provider.id},data:{config:provider.config}})
  rejectedIntent=intent
 }
 const commands=load('src/modules/hosting/server/cloud-operations/commands.ts'),rejected=await get(rejectedIntent.id),passwordBefore=common.decode(rejected.snapshot).input.password
 await commands.retryCloudOperation(user.id,rejected.id,rejected.version);state.result={state:'DONE',code:'SYNTHETIC_RETRIED',resourceId:'retry-resource'};await owner.runCloudOperation({id:rejected.id});assert.equal((await get(rejected.id)).status,'DONE');assert.equal(common.decode((await get(rejected.id)).snapshot).input.password,passwordBefore)
 const uncertain=await owner.queueServiceOperation(service.id,'START',{kind:'CUSTOMER',id:user.id,key:'credential-recovery'});state.result=null;await owner.runCloudOperation({id:uncertain.id});await db.hostingProvider.update({where:{id:provider.id},data:{secret:credentials.encryptPanelCredential('rotated-key')}});await owner.runCloudOperation({id:uncertain.id});assert.equal((await get(uncertain.id)).status,'BLOCKED');const blocked=await get(uncertain.id),writes=state.writes;await commands.reconcileCloudOperation(user.id,blocked.id,blocked.version);state.result={state:'DONE',code:'SYNTHETIC_RUNNING',data:{powerState:'RUNNING'}};await owner.runCloudOperation({id:blocked.id});assert.equal((await get(blocked.id)).status,'DONE');assert.equal(state.writes,writes,'credential rotation recovery inspects, never repeats writes')
 const rollbackService=await make(),auditOwner=load('src/platform/audit/server.ts'),originalAudit=auditOwner.auditSystemStrict;auditOwner.auditSystemStrict=async()=>{throw Error('synthetic audit outage')};try{await assert.rejects(owner.queueServiceOperation(rollbackService.id),/audit outage/)}finally{auditOwner.auditSystemStrict=originalAudit}assert.equal((await db.hostingService.findUniqueOrThrow({where:{id:rollbackService.id}})).status,'PENDING');assert.equal(await db.hostingOperation.count({where:{serviceId:rollbackService.id}}),0,'audit failure rolls back state, intent and queue together')
 await assert.rejects(owner.customerPowerOperation(999999,service.id,'START','request-0001'),/پیدا نشد/)
 // Registrar acceptance is not activation or expiry advancement; renew is applied once on confirmed results.
 register('JOKER');const joker=await db.hostingProvider.create({data:{name:prefix+' registrar',family:'REGISTRAR',driver:'JOKER',secret:credentials.encryptPanelCredential('synthetic-registry'),config:JSON.stringify({autoOperations:true,jokerMaxPrice:'30',jokerCurrency:'USD',nameservers:['ns1.example.invalid','ns2.example.invalid']})}});ids.providers.push(joker.id)
 const tld=await db.domainTld.create({data:{suffix:'test'+Date.now(),registrarId:joker.id,registerMinor:100n,renewMinor:100n}});ids.tlds.push(tld.id)
 const order=await paid(user,{kind:'domain',jokerContact:'COCO-1234'}),domain=await db.domain.create({data:{userId:user.id,tldId:tld.id,name:prefix+'.com',orderId:order.id,renewMinor:100n}});ids.domains.push(domain.id)
 const registration=await owner.queueDomainOperation(domain.id,order.id,'REGISTER');state.result={state:'PENDING',code:'REGISTRY_PENDING',reference:'proc-1'};await owner.runCloudOperation({id:registration.id})
 assert.equal((await db.domain.findUniqueOrThrow({where:{id:domain.id}})).status,'PENDING');await assert.rejects(db.domain.updateMany({where:{id:domain.id,status:'PENDING'},data:{status:'CANCELLED'}}),/cloud operation is unresolved/)
 const expiry=new Date(Date.now()+370*86400000).toISOString();state.result={state:'DONE',code:'REGISTRY_CONFIRMED',data:{expiresAt:expiry}};await owner.runCloudOperation({id:registration.id});assert.equal((await db.domain.findUniqueOrThrow({where:{id:domain.id}})).expiresAt.toISOString(),expiry)
 const renewalOrder=await paid(user,{kind:'domain-renewal',domainId:domain.id,years:1}),renewal=await owner.queueDomainOperation(domain.id,renewalOrder.id,'RENEW');state.result={state:'PENDING',code:'REGISTRY_PENDING',reference:'proc-2'};await owner.runCloudOperation({id:renewal.id});assert.equal((await db.domain.findUniqueOrThrow({where:{id:domain.id}})).expiresAt.toISOString(),expiry)
 const extended=new Date(expiry);extended.setUTCFullYear(extended.getUTCFullYear()+1);state.result={state:'DONE',code:'REGISTRY_CONFIRMED',data:{expiresAt:extended.toISOString()}};await owner.runCloudOperation({id:renewal.id});await owner.runCloudOperation({id:renewal.id});assert.equal((await db.domain.findUniqueOrThrow({where:{id:domain.id}})).expiresAt.toISOString(),extended.toISOString())
 // Starting in a previously billed stopped hour adds only the exact running-rate difference once.
 const now=new Date(),hour=new Date(Math.floor(now.getTime()/3600000)*3600000),power=load('src/modules/hosting/server/hourly-power.ts')
 await db.walletAccount.create({data:{userId:user.id,currency:'IRT',balanceMinor:1000n}})
 const hourly=await db.hostingService.create({data:{userId:user.id,productId:product.id,label:prefix,status:'ACTIVE',cycle:'HOURLY',priceMinor:100n,stoppedHourlyMinor:20n,powerState:'STOPPED',startedAt:hour,chargedUntil:hour}})
 await power.prepareHourlyPower(hourly.id,'START',now);await power.prepareHourlyPower(hourly.id,'START',now)
 assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:user.id,currency:'IRT'}}})).balanceMinor,900n)
 assert.equal((await db.hostingUsageCharge.findFirstOrThrow({where:{serviceId:hourly.id}})).amountMinor,100n)
 assert.equal(await db.walletTx.count({where:{userId:user.id}}),2,'one stopped-hour debit plus one running difference, despite repeats')
 const erased=await make(),erasureOp=await owner.queueServiceOperation(erased.id),financial=load('src/modules/identity/server/erasure/financial.ts');await db.$transaction(tx=>financial.eraseFinancialIdentity(tx,user.id),{timeout:15000});assert.equal((await get(erasureOp.id)).code,'ACCOUNT_ERASED');assert.equal(credentials.decryptPanelCredential((await get(op.id)).snapshot),'{"erased":true}');await owner.runCloudOperation({id:erasureOp.id})
 console.log('Cloud operations: encrypted frozen intents, exclusive dispatch, unknown-read-only recovery, DB/manual fences, authority, one settlement, zero wallet side effects, domain expiry, erasure verified')
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{try{
 const ops=await db.hostingOperation.findMany({where:{providerId:{in:ids.providers}},select:{id:true}}),opIds=ops.map(o=>o.id)
 await db.backgroundJob.deleteMany({where:{OR:opIds.map(id=>({dedupeKey:{startsWith:'hosting-operation:'+id+':'}}))}})
 await db.auditLog.deleteMany({where:{targetType:'hosting-operation',targetId:{in:opIds}}})
 await db.hostingOperation.deleteMany({where:{id:{in:opIds}}});await db.userNotification.deleteMany({where:{userId:{in:ids.users}}})
 await db.hostingUsageCharge.deleteMany({where:{userId:{in:ids.users}}});await db.hostingService.deleteMany({where:{userId:{in:ids.users}}});await db.walletTx.deleteMany({where:{userId:{in:ids.users}}});await db.walletAccount.deleteMany({where:{userId:{in:ids.users}}});await db.domain.deleteMany({where:{id:{in:ids.domains}}});await db.domainTld.deleteMany({where:{id:{in:ids.tlds}}});await db.invoice.deleteMany({where:{orderId:{in:ids.orders}}});await db.order.deleteMany({where:{id:{in:ids.orders}}});await db.hostingProduct.deleteMany({where:{id:{in:ids.products}}});await db.hostingProvider.deleteMany({where:{id:{in:ids.providers}}});await db.user.deleteMany({where:{id:{in:ids.users}}})
 }finally{await db.$disconnect()}})
