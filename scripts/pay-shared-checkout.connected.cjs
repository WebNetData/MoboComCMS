// Disposable PostgreSQL only; real owners with SMS/bank transports and request identity doubled.
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server');
if(!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid').pathname.slice(1)))throw Error('Owned mobocom_pay_test_* database required');
const db=new PrismaClient(),tag='pay-shared-'+randomUUID(),users=[],merchants=[],gateways=[],invoiceIds=[],images=[],snapshots=new Map(),codes=[];
process.env.NEXTAUTH_SECRET='synthetic-pay-shared-secret';process.env.PANEL_CREDENTIAL_KEY=randomBytes(32).toString('hex');process.env.NEXTAUTH_URL='https://example.invalid';process.env.MOBOCOM_PAY_BANK_PROVIDER='fixture';process.env.MOBOCOM_PAY_BANK_SECRET='synthetic-bank-secret-only-0123456789';
const state={enabled:true,reviewer:0,createCount:0,unknown:false,auditFails:false,reversalCount:0};const mocks={
 '@/platform/database/prisma':{db},'@/extensions/server/modules':{isModuleEnabled:async()=>state.enabled},
 '@/modules/identity/server/access':{resolveCurrentUser: async (id, _at, tx = db) => { const u = await tx.user.findUnique({where:{id}}); return u?.status === 'ACTIVE' ? u : null },requireUser:async(req,tx=db)=>tx.user.findUnique({where:{id:Number(req.headers.get('x-fixture-user')||-1)}}),requirePerm:async(req,perm,tx=db)=>Number(req.headers.get('x-fixture-user'))===state.reviewer&&perm==='mobocom-pay.manage'?tx.user.findUnique({where:{id:state.reviewer}}):null},
 '@/modules/identity/server/authentication-restrictions':{globalAuthenticationDenied:async()=>false},'@/modules/account/server/section-access':{userOpensSection:async()=>true},
 '@/modules/identity/server/human-check':{verifyHuman:async token=>token==='synthetic-human'},
 '@/modules/public-api/server/api-keys':{resolveApiCaller:async()=>null},'@/modules/public-api/server/availability':{isPublicApiEnabled:async()=>false},
 '@/modules/sms/server/ippanel':{sendText:async(key,from,to,text)=>{codes.push(text.match(/\b\d{6}\b/)[0]);return{ok:true,id:'fixture-sms',error:''}},sendPattern:async()=>{throw Error('unexpected pattern')}},
};
const originalFetch=global.fetch;global.fetch=async(url,init)=>{
 if(String(url).startsWith('https://bpm.shaparak.ir/')){const body=String(init.body),method=(body.match(/<m:(\w+)/)||body.match(/<ns1:(\w+)/)||[])[1];if(body.includes('bpPayRequest')){state.createCount++;if(state.unknown)throw Error('synthetic ambiguous transport');return new Response('<return>0,FIXTUREPAYREF'+state.createCount+'</return>')}
 if(body.includes('bpReversalRequest'))state.reversalCount++;return new Response('<return>0</return>')}
 throw Error('No external network in native check: '+url)
};
const load=require('./connected-source-loader.cjs')(mocks),policy=load('src/modules/billing/domain/pay-policy.ts'),smsDomain=load('src/modules/sms/domain/sms.ts');
const realAudit=load('src/platform/audit/server.ts');mocks['@/platform/audit/server']={...realAudit,auditSystemStrict:(...a)=>{if(state.auditFails)throw Error('synthetic audit failure');return realAudit.auditSystemStrict(...a)},auditAdminStrict:(...a)=>{if(state.auditFails)throw Error('synthetic audit failure');return realAudit.auditAdminStrict(...a)}};
const pay=load('src/modules/billing/server/pay.ts'),payer=load('src/modules/billing/server/pay/payer.ts'),gatewayOwner=load('src/modules/billing/server/pay/checkout-gateways.ts'),billing=load('src/modules/billing/server/billing.ts'),mellat=load('src/modules/billing/server/http/payment/mellat.ts'),mellatInfra=load('src/modules/billing/infrastructure/mellat.ts');
const req=(id='',cookie='',body,method='GET',user)=>new NextRequest('https://example.invalid/api/pay/checkout/'+id,{method,headers:{origin:'https://example.invalid',...(cookie?{cookie}:{}),...(user?{'x-fixture-user':String(user)}:{}),...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
const actor=u=>({id:u.id,email:u.email,req:req('','',null,'GET',u.id)});
let bank,owner,reviewer,terminal,merchant,settings;
async function set(key,value){if(!snapshots.has(key))snapshots.set(key,await db.setting.findUnique({where:{key}}));await db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})}
async function make(suffix,amount='1000000'){return pay.createPayPayment(actor(owner),{terminalId:terminal.id,externalId:tag+'-'+suffix,amountRial:amount},randomUUID())}
async function proof(row,index){const phone='+98912000'+String(index).padStart(4,'0'),sent=await payer.requestPayPayerOtp(req(row.id),row.id,{phone,humanToken:'synthetic-human'});const challenge=payer.payPayerChallengeCookie(row.id)+'='+sent.challengeToken;const verified=await payer.verifyPayPayerOtp(req(row.id,challenge),row.id,{phone,code:codes.at(-1)});return{phone,cookie:payer.payPayerCookie(row.id)+'='+verified.token}}
async function receipt(row,proof,tracking='NATIVE'+randomUUID().replaceAll('-','').slice(0,12)){const body=new FormData();for(const[k,v]of Object.entries({method:'CARD',payerName:'مشتری آزمایشی',payerBank:'بانک آزمایشی',trackingCode:tracking,payerCard:'1234'}))body.set(k,v);body.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'receipt.png');const result=await pay.submitPayReceipt(req(row.id,proof.cookie,body,'POST'),row.id);const r=await db.paymentReceipt.findUniqueOrThrow({where:{id:result.id}});images.push(r.image);return r}
async function main(){
 for(const email of ['owner','reviewer']){const u=await db.user.create({data:{email:tag+'-'+email+'@example.invalid',passwordHash:'fixture-only',role:email==='reviewer'?'ADMIN':'USER'}});users.push(u.id);if(email==='owner')owner=u;else reviewer=u}state.reviewer=reviewer.id;
 bank=await db.bankAccount.create({data:{bankName:tag,holderName:'نمونه',cardNumber:'6037990000000000'}});
 for(const provider of ['CARD_TRANSFER','MELLAT']){const g=await db.gateway.create({data:{name:tag+'-'+provider,provider,fiat:'IRR',active:true,apiKey:provider==='MELLAT'?'123':'',accountUser:'fixture',secretKey:'fixture',isDefault:provider==='CARD_TRANSFER'}});gateways.push(g)}
 settings={...policy.defaults(),incomingEnabled:true,providerId:'fixture',bankAccountIds:[bank.id],minPaymentRial:'1',feeBps:200,flatFeeRial:'1000',feeCapRial:'10000'};await set('billing.mobocom-pay.v1',settings);await set('sms.config.v1',{...smsDomain.DEFAULT_SMS,enabled:true,apiKey:'synthetic-ippanel-key',fromNumber:'3000505'});
 merchant=await pay.enrollMerchant(actor(reviewer),{userId:owner.id,note:'Synthetic Admin provision',name:tag,website:'https://example.invalid'});merchants.push(merchant.id);await pay.changeMerchant(actor(reviewer),{id:merchant.id,status:'ACTIVE'});terminal=await pay.createTerminal(actor(owner),{name:'پایانه آزمایشی',returnUrl:'https://example.invalid/return'});
 const p=await make('merchant-fee');assert.equal(p.feeMinor,10000n);assert.equal(p.totalMinor,1000000n);assert.equal(p.netMinor,990000n);
 await pay.changeMerchant(actor(reviewer),{action:'terms',id:merchant.id,feeBearer:'CUSTOMER',feeBps:250,flatFeeRial:'2000',feeCapRial:'12000'});const customer=await make('customer-fee');assert.equal(customer.feeMinor,12000n);assert.equal(customer.totalMinor,1012000n);assert.equal(customer.netMinor,1000000n);assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:p.id}})).feeMinor,10000n);
 await assert.rejects(() => pay.saveMerchantFeeShare(actor(reviewer), {customerFeeShareBps:3000}), e => e.status === 403);
 await assert.rejects(() => pay.saveMerchantFeeShare(actor(owner), {customerFeeShareBps:10001}), e => e.status === 422);
 await pay.saveMerchantFeeShare(actor(owner), {customerFeeShareBps:3000});
 const shared = await make('shared-fee');
 assert.equal(shared.feeBearer, 'SPLIT'); assert.equal(shared.feeMinor,12000n); assert.equal(shared.totalMinor,1003600n); assert.equal(shared.netMinor,991600n);
 const sharedView = await pay.checkoutView(shared.id,req(shared.id));
 assert.equal(sharedView.customerFeeRial,'3600'); assert.equal(sharedView.merchantFeeRial,'8400');
 const zero = policy.paymentAmounts('1001',{...settings,feeBps:0,flatFeeRial:'1',feeCapRial:'0'}, {...policy.merchantFeeTerms(settings),feeBps:0,flatFeeRial:'1',feeCapRial:'0',customerFeeShareBps:5000});
 assert.equal(zero.feeBearer,'MERCHANT'); assert.equal(zero.netMinor,1000n); assert.equal(zero.totalMinor,1001n);
 await pay.saveMerchantFeeShare(actor(owner), {customerFeeShareBps:0});
 const selfPaid = await make('self-fee'); assert.equal(selfPaid.totalMinor,1000000n); assert.equal(selfPaid.netMinor,988000n);
 await pay.saveMerchantFeeShare(actor(owner), {customerFeeShareBps:10000});
 const allCustomer = await make('all-customer-fee'); assert.equal(allCustomer.totalMinor,1012000n); assert.equal(allCustomer.netMinor,1000000n);
 await pay.saveMerchantFeeShare(actor(owner), {customerFeeShareBps:null});
 assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:shared.id}})).netMinor,991600n);
 const publicView=await pay.checkoutView(p.id,req(p.id));assert.equal(publicView.bank,null);assert.deepEqual(publicView.gateways,[]);assert.equal(publicView.verification.verified,false);await assert.rejects(gatewayOwner.startPayGateway(req(p.id),p.id,{gatewayRef:'db:'+gateways[0].id}),e=>e.status===401);
 const phone='+989120009999';await assert.rejects(payer.requestPayPayerOtp(req(p.id),p.id,{phone,humanToken:'wrong'}));const challenge=await payer.requestPayPayerOtp(req(p.id),p.id,{phone,humanToken:'synthetic-human'});const challengeCookie=payer.payPayerChallengeCookie(p.id)+'='+challenge.challengeToken;
 await assert.rejects(payer.verifyPayPayerOtp(req(p.id),p.id,{phone,code:codes.at(-1)}));for(let i=0;i<2;i++)await assert.rejects(payer.verifyPayPayerOtp(req(p.id,challengeCookie),p.id,{phone,code:'000000'}));assert.equal((await db.otpCode.findFirst({where:{phone},orderBy:{id:'desc'}})).attempts,2);
 const valid=await payer.verifyPayPayerOtp(req(p.id,challengeCookie),p.id,{phone,code:codes.at(-1)}),first={cookie:payer.payPayerCookie(p.id)+'='+valid.token};await assert.rejects(payer.verifyPayPayerOtp(req(p.id,challengeCookie),p.id,{phone,code:codes.at(-1)}));await assert.rejects(payer.requirePayPayer(req(customer.id,first.cookie),customer.id));
 assert.match((await db.payPayment.findUniqueOrThrow({where:{id:p.id}})).payerPhoneCiphertext,/^encv1:/);assert.equal(await db.user.count({where:{id:{in:users}}}),2);
 const options=(await pay.checkoutView(p.id,req(p.id,first.cookie))).gateways;assert(options.some(g=>g.provider==='MELLAT'));assert(options.some(g=>g.provider==='CARD_TRANSFER'));const start=await gatewayOwner.startPayGateway(req(p.id,first.cookie),p.id,{gatewayRef:'db:'+gateways[0].id});invoiceIds.push(start.invoiceId);assert.equal(start.manual,true);assert.equal((await db.invoice.findUniqueOrThrow({where:{id:start.invoiceId}})).userId,null);
 const r=await receipt(p,first);await assert.rejects(receipt(p,first),e=>e.status===409);assert.equal((await pay.checkoutView(p.id,req(p.id,first.cookie))).receipt.status,'PENDING');await assert.rejects(pay.reviewPayReceipt(actor(owner),{id:r.id,action:'approve'}));
 await pay.reviewPayReceipt(actor(reviewer),{id:r.id,action:'reject',note:'رسید خوانا نیست'});const retry=await receipt(p,first,'');
 assert.equal(retry.trackingCode, '');
 assert.equal(retry.paidAt, null);
 await assert.rejects(pay.reviewPayReceipt(actor(reviewer), { id: retry.id, action: 'approve' }), e => e.status === 422);
 const reviewInput = { id: retry.id, action: 'approve', trackingCode: 'VERIFIED' + randomUUID().replaceAll('-', '') };
 state.auditFails=true;await assert.rejects(pay.reviewPayReceipt(actor(reviewer),reviewInput));state.auditFails=false;assert.equal((await db.paymentReceipt.findUniqueOrThrow({where:{id:retry.id}})).status,'PENDING');assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:p.id}})).status,'PENDING');
 const races=await Promise.allSettled([pay.reviewPayReceipt(actor(reviewer),reviewInput),pay.reviewPayReceipt(actor(reviewer),reviewInput)]);assert.equal(races.filter(x=>x.status==='fulfilled'&&!x.value.alreadyPaid).length,1,JSON.stringify(races.map(x=>x.status==='rejected'?x.reason.message:x.value)));assert.equal((await pay.reviewPayReceipt(actor(reviewer),{id:retry.id,action:'approve'})).alreadyPaid,true);assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),1);assert.equal(await db.payment.count({where:{invoiceId:start.invoiceId,status:'CONFIRMED'}}),1);
 assert.equal((await db.paymentReceipt.findUniqueOrThrow({where:{id:retry.id}})).trackingCode, reviewInput.trackingCode);
 assert.equal((await pay.payPaymentById(actor(owner), p.id)).receiptIds, undefined);
 const cp=await proof(customer,1),online=await gatewayOwner.startPayGateway(req(customer.id,cp.cookie),customer.id,{gatewayRef:'db:'+gateways[1].id});invoiceIds.push(online.invoiceId);assert.equal(online.status,'READY');assert.equal(state.createCount,1);await gatewayOwner.startPayGateway(req(customer.id,cp.cookie),customer.id,{gatewayRef:'db:'+gateways[1].id});assert.equal(state.createCount,1);
 const invoice=await db.invoice.findUniqueOrThrow({where:{id:online.invoiceId}}),form=new FormData();for(const[k,v]of Object.entries({RefId:invoice.providerTxnId,ResCode:'0',SaleOrderId:String(mellatInfra.mellatOrderId(invoice.number)),SaleReferenceId:String(Date.now())}))form.set(k,v);
 const callback=()=>mellat.POST_callback(new NextRequest('https://example.invalid/api/payment/mellat/callback',{method:'POST',body:form}));const response=await callback();assert.equal(new URL(response.headers.get('location')).pathname,'/pay/'+customer.id);await callback();assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:customer.id}})).status,'PAID');assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),2);assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:owner.id,currency:'IRR'}}})).balanceMinor,1990000n);
 const auto=await make('bank-evidence'),ap=await proof(auto,2),autoStart=await gatewayOwner.startPayGateway(req(auto.id,ap.cookie),auto.id,{gatewayRef:'db:'+gateways[0].id});invoiceIds.push(autoStart.invoiceId);const autoReceipt=await receipt(auto,ap,'AUTOBANK'+randomUUID().replaceAll('-','').slice(0,16));
 const bankEvent={providerId:'fixture',externalId:randomUUID(),targetPaymentId:auto.id,bankAccountId:bank.id,amountRial:auto.totalMinor.toString(),transferReference:autoReceipt.trackingCode,occurredAt:new Date().toISOString()};await pay.acceptBankEvent(bankEvent,randomUUID());assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:auto.id}})).status,'PAID');assert.equal((await db.paymentReceipt.findUniqueOrThrow({where:{id:autoReceipt.id}})).status,'APPROVED');assert.equal((await pay.reviewPayReceipt(actor(reviewer),{id:autoReceipt.id,action:'approve'})).alreadyPaid,true);assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),3);
 const overview=await pay.payOverview(actor(owner));assert.equal(overview.stats.grossRial,'3024000');assert.equal(BigInt(overview.stats.grossRial),BigInt(overview.stats.netRial)+BigInt(overview.stats.feeRial));
 const duplicate = await make('duplicate-reviewed-reference'), duplicateProof = await proof(duplicate, 6);
 const duplicateStart = await gatewayOwner.startPayGateway(req(duplicate.id, duplicateProof.cookie), duplicate.id, { gatewayRef: 'db:' + gateways[0].id });
 invoiceIds.push(duplicateStart.invoiceId);
 const duplicateReceipt = await receipt(duplicate, duplicateProof, '');
 await assert.rejects(pay.reviewPayReceipt(actor(reviewer), { ...reviewInput, id: duplicateReceipt.id, trackingCode: reviewInput.trackingCode.toLowerCase() }), e => e.status === 409);
 assert.equal((await db.paymentReceipt.findUniqueOrThrow({where:{id:duplicateReceipt.id}})).status, 'PENDING');
 const limitedRole = await db.role.create({ data: { name: tag + '-limited', permissions: 'mobocom-pay.manage' } });
 const ownApproval = { id: duplicateReceipt.id, action: 'approve', trackingCode: 'OWN' + randomUUID().replaceAll('-', '') };
 try {
  await db.user.update({ where: { id: owner.id }, data: { role: 'ADMIN', roleId: limitedRole.id } });
  state.reviewer = owner.id;
  await assert.rejects(pay.reviewPayReceipt(actor(owner), ownApproval), error => error.status === 403);
  await db.user.update({ where: { id: owner.id }, data: { roleId: null } });
  await assert.rejects(pay.reviewPayReceipt(actor(owner), { ...ownApproval, action: 'reject', note: 'Synthetic review' }), error => error.status === 403);
  assert.equal((await pay.reviewPayReceipt(actor(owner), ownApproval)).status, 'APPROVED');
  assert.equal((await pay.reviewPayReceipt(actor(owner), ownApproval)).alreadyPaid, true);
  assert.equal(await db.payment.count({ where: { invoiceId: duplicateStart.invoiceId, status: 'CONFIRMED' } }), 1);
  assert.equal(await db.walletTx.count({ where: { userId: owner.id, idempotencyKey: 'pay-credit:' + duplicate.id, type: 'PAY_CREDIT' } }), 1);
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorUserId: owner.id, action: 'mobocom-pay.receipt.approve', targetId: duplicate.id } });
  assert.equal(JSON.parse(audit.metadata).selfReview, true);
 } finally {
  state.reviewer = reviewer.id;
  await db.user.update({ where: { id: owner.id }, data: { role: owner.role, roleId: null } });
  await db.role.delete({ where: { id: limitedRole.id } });
 }
 const unknown=await make('unknown'),up=await proof(unknown,3);state.unknown=true;const uncertain=await gatewayOwner.startPayGateway(req(unknown.id,up.cookie),unknown.id,{gatewayRef:'db:'+gateways[1].id});invoiceIds.push(uncertain.invoiceId);assert.equal(uncertain.status,'UNKNOWN');const count=state.createCount;await gatewayOwner.startPayGateway(req(unknown.id,up.cookie),unknown.id,{gatewayRef:'db:'+gateways[1].id});assert.equal(state.createCount,count);state.unknown=false;
 const burned=await make('burned-otp'),burnPhone='+989120008888',burn=await payer.requestPayPayerOtp(req(burned.id),burned.id,{phone:burnPhone,humanToken:'synthetic-human'}),burnCookie=payer.payPayerChallengeCookie(burned.id)+'='+burn.challengeToken,burnCode=codes.at(-1),wrongCode=burnCode==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)await assert.rejects(payer.verifyPayPayerOtp(req(burned.id,burnCookie),burned.id,{phone:burnPhone,code:wrongCode}));await assert.rejects(payer.verifyPayPayerOtp(req(burned.id,burnCookie),burned.id,{phone:burnPhone,code:burnCode}));assert.equal(await db.user.count({where:{phone:{in:[phone,burnPhone]}}}),0);
 const held=await make('held-merchant'),hp=await proof(held,5),heldStart=await gatewayOwner.startPayGateway(req(held.id,hp.cookie),held.id,{gatewayRef:'db:'+gateways[1].id});invoiceIds.push(heldStart.invoiceId);await pay.changeMerchant(actor(reviewer),{id:merchant.id,status:'SUSPENDED'});
 const heldInvoice=await db.invoice.findUniqueOrThrow({where:{id:heldStart.invoiceId}}),heldForm=new FormData();for(const[k,v]of Object.entries({RefId:heldInvoice.providerTxnId,ResCode:'0',SaleOrderId:String(mellatInfra.mellatOrderId(heldInvoice.number)),SaleReferenceId:String(Date.now())}))heldForm.set(k,v);await mellat.POST_callback(new NextRequest('https://example.invalid/api/payment/mellat/callback',{method:'POST',body:heldForm}));assert.equal(state.reversalCount,1);assert.equal((await db.payPayment.findUniqueOrThrow({where:{id:held.id}})).status,'PENDING');assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),4);
 await assert.rejects(db.payPayment.update({where:{id:p.id},data:{totalMinor:1n}}));await assert.rejects(db.invoice.update({where:{id:invoice.id},data:{totalMinor:1n}}));
 state.enabled=false;await assert.rejects(pay.checkoutView(customer.id,req(customer.id,cp.cookie)),e=>e.status===404);state.enabled=true;
 console.log('PASS shared Pay PostgreSQL: fee sides/cap/snapshot; OTP/privacy/attempts/replay/cross-ticket; canonical receipt/reject/audit rollback/concurrency; real Mellat parser/callback/replay; single Wallet/journal; ambiguous no-retry/module-off');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{global.fetch=originalFetch;try{
 const paymentRows=await db.payPayment.findMany({where:{merchantId:{in:merchants}},select:{invoiceId:true}});const ids=[...new Set([...invoiceIds,...paymentRows.flatMap(r=>r.invoiceId?[r.invoiceId]:[])])];
 await db.payBankEvent.deleteMany({where:{bankAccountId:bank?.id||-1}});await db.payPayment.deleteMany({where:{merchantId:{in:merchants}}});await db.payTerminal.deleteMany({where:{merchantId:{in:merchants}}});await db.payMerchant.deleteMany({where:{id:{in:merchants}}});await db.paymentReceipt.deleteMany({where:{invoiceId:{in:ids}}});await db.payment.deleteMany({where:{invoiceId:{in:ids}}});await db.invoice.deleteMany({where:{id:{in:ids}}});await db.walletTx.deleteMany({where:{userId:{in:users}}});await db.walletAccount.deleteMany({where:{userId:{in:users}}});await db.userNotification.deleteMany({where:{userId:{in:users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.gateway.deleteMany({where:{id:{in:gateways.map(g=>g.id)}}});if(bank)await db.bankAccount.delete({where:{id:bank.id}});await db.otpCode.deleteMany({where:{phone:{startsWith:'+98912000'}}});await db.smsLog.deleteMany({where:{phone:{startsWith:'+98912000'}}});for(const[key,row]of snapshots)if(row)await db.setting.update({where:{key},data:{value:row.value}});else await db.setting.deleteMany({where:{key}});for(const image of images)await require('node:fs/promises').unlink(require('node:path').join(process.cwd(),'storage/receipts',image)).catch(()=>{});
}catch(e){console.error('Owned cleanup failed',e);process.exitCode=1}finally{await db.$disconnect()}});
