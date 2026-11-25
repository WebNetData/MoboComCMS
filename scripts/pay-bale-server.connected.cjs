const assert=require('node:assert/strict'),{randomUUID,createHmac}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const {envelope,config,binding}=require('./pay-bale.fixture.cjs')
if(!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid').pathname.slice(1)))throw Error('Disposable Pay test database required')
process.env.NEXTAUTH_SECRET='synthetic-bale-source-connected-secret-only';process.env.NEXTAUTH_URL='https://mobocom.invalid'
const prisma=new PrismaClient(),stamp='bale-'+randomUUID(),keys=['publicApiEnabled','extension.mobocom-pay.state.v1','security.policy.v1'],snapshots=new Map(),users=[]
let fault=false,bank,role,gateway,secondBank
function wrap(client){return new Proxy(client,{get(target,name){
 if(name==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options)
 if(name==='auditLog')return new Proxy(target.auditLog,{get(model,method){if(method==='create')return args=>{if(fault&&args.data.action==='mobocom-pay.bale.received')throw Error('bale audit fault');return model.create(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}})
 return typeof target[name]==='function'?target[name].bind(target):target[name]
}})}
const db=wrap(prisma),load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn}}),pay=load('src/modules/billing/server/pay.ts'),card=load('src/modules/billing/server/card-transfer.ts'),access=load('src/modules/identity/server/access.ts'),http=load('src/modules/billing/server/http/pay-bale.ts'),gateways=load('src/modules/billing/server/gateways.ts')
const put=(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{value}}),status=n=>e=>e.status===n
const signed=e=>{const raw=Buffer.from(typeof e==='string'?e:JSON.stringify(e));return {raw,signature:'sha256='+createHmac('sha256',process.env.MOBOCOM_PAY_BALE_WEBHOOK_SECRET).update(raw).digest('hex')}}
const receive=e=>{const s=signed(e);return pay.receiveBaleBankMessage(s.signature,e.event_id,s.raw)}
async function actor(user){const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),authAt:Date.now()}});return pay.payActor(new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/bale-status',{headers:{origin:'https://mobocom.invalid',cookie:`next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`}}))}
async function moneySnapshot(){const tables=['invoice','payment','walletTx','walletAccount','payPayment','payBankEvent','payBotDelivery','backgroundJob'];const result={};for(const t of tables)result[t]=await db[t].findMany();return result}
async function main(){try{
 for(const key of keys)snapshots.set(key,await db.setting.findUnique({where:{key}}))
 bank=await db.bankAccount.create({data:{bankName:stamp,holderName:stamp,accountNumber:'0000000000000',active:true}})
 Object.assign(process.env,config(bank.id))
 role=await db.role.create({data:{name:stamp,permissions:'dashboard.view'}})
 for(const [suffix,standing,roleId] of [['admin','ADMIN',null],['denied','ADMIN',role.id],['customer','CUSTOMER',null]])users.push(await db.user.create({data:{email:`${stamp}-${suffix}@example.invalid`,passwordHash:'!',role:standing,roleId,status:'ACTIVE'}}))
 process.env.MOBOCOM_PAY_BALE_OWNER_USER_ID=String(users[0].id)
 await put(keys[0],'true');await put(keys[1],JSON.stringify({enabled:true,settings:{}}));await put(keys[2],JSON.stringify({requireAdmin2fa:false}));access.clearAdminPolicyCache()
 const admin=await actor(users[0]),denied=await actor(users[1]),customer=await actor(users[2])
 await assert.rejects(pay.baleSourceStatus(denied),status(403));await assert.rejects(pay.baleSourceStatus(customer),status(403))
 const historyBase=await db.payBaleNotice.count({where:{sourceType:'BALE'}}),before=await moneySnapshot(),body=envelope(1),s=signed(body)
 const response=await http.POST_bale(new NextRequest('https://mobocom.invalid/api/payment/mobocom-pay/bale-events',{method:'POST',headers:{origin:'https://mobocom.invalid','content-type':'application/json','x-hub-signature-256':s.signature,'x-goomni-event-id':body.event_id},body:s.raw}));assert.equal(response.status,200)
 const reply=(await response.json()).data;assert.equal(reply.status,'ORIGINAL_TRANSFER');assert.equal(reply.financialApproval,false)
 assert.equal((await receive(body)).duplicate,true)
 await assert.rejects(receive({...body,content:{...body.content,message:'altered'},payload:{...body.payload,body:'altered'}}),status(409))
 await assert.rejects(pay.receiveBaleBankMessage('sha256='+'0'.repeat(64),body.event_id,s.raw),status(401))
 for(const patch of [{sender_id:'999'},{device_id:'999'},{instance_id:'b'.repeat(64)},{session_id:'wrong'},{direction:'outgoing'},{event:'message.edited'}])await assert.rejects(receive({...envelope(100),...patch}),status(422))
 await assert.rejects(receive({...envelope(100),payload:{...envelope(100).payload,forwarded_from:{sender_id:binding.bankPeerId}}}),status(422))
 const dupRaw=JSON.stringify(envelope(100)).replace('"direction":"incoming"','"direction":"outgoing","direction":"incoming"'),dup=signed(dupRaw)
 await assert.rejects(pay.receiveBaleBankMessage(dup.signature,envelope(100).event_id,dup.raw),status(422))
 assert.equal((await receive(envelope(2))).status,'DUPLICATE')
 assert.equal((await receive(envelope(3,{amount:'100001'}))).status,'CONFLICT')
 assert.equal((await receive(envelope(4,{account:'1111111111111'}))).status,'DUPLICATE') // account text is not attribution
 assert.equal((await receive(envelope(5,{kind:'سود_پرداخت_شده',reference:'INTEREST123'}))).status,'IGNORED')
 assert.equal((await receive(envelope(6,{sign:'-',reference:'DEBIT12345'}))).status,'IGNORED')
 const repeated=envelope(7);repeated.message_id='1';repeated.payload.id='1';await assert.rejects(receive(repeated),status(409))
 const parallel=envelope(8,{reference:'CONCURRENT123'}),replies=await Promise.all([receive(parallel),receive(parallel)]);assert.equal(replies.filter(x=>x.duplicate).length,1)
 const audit=envelope(9,{reference:'AUDITFAIL123'});fault=true;try{await assert.rejects(receive(audit),/bale audit fault/)}finally{fault=false}
 assert.equal(await db.payBaleNotice.count({where:{sourceEventId:audit.event_id}}),0)
 const stored=await db.payBaleNotice.findUniqueOrThrow({where:{id:reply.id}});assert.equal(stored.amountMinor,100000n)
 const malformed={...stored,id:randomUUID(),sourceEventId:'d'.repeat(64),messageId:'7000000',bankFingerprint:'e'.repeat(64)}
 await assert.rejects(db.payBaleNotice.create({data:{...malformed,kind:'INTEREST'}}),'database denies interest as original transfer')
 await assert.rejects(db.payBaleNotice.create({data:{...malformed,bankFingerprint:null,status:'REJECTED',direction:'',transferReference:'',amountMinor:null,occurredFrom:new Date(),occurredBefore:null}}),'database denies incomplete optional minute pair')
 await assert.rejects(db.payBaleNotice.update({where:{id:reply.id},data:{amountMinor:1n}}))
 const overview=await pay.baleSourceStatus(admin);assert.equal(overview.receivingEnabled,true);assert.equal(overview.collectionReady,false);assert.equal(overview.bankUsername,'bam_bmi')
 const safe=JSON.stringify(overview);for(const privateValue of ['PRIVATE_BALANCE','PRIVATE_COUNTERPARTY','0000000000000',process.env.MOBOCOM_PAY_BALE_WEBHOOK_SECRET,binding.instanceId])assert.equal(safe.includes(privateValue),false,privateValue)
 for(let n=10;n<37;n++)await receive(envelope(n,{reference:'HISTORY'+String(n).padStart(5,'0')}))
 const page2=await pay.baleSourceStatus(admin,2);assert.equal(page2.events.items.length,Math.min(25,Math.max(0,historyBase+34-25)));assert.equal(page2.events.total,historyBase+34)
 await put(keys[0],'false');await assert.rejects(receive(envelope(100)),status(403));await put(keys[0],'true')
 process.env.MOBOCOM_PAY_BALE_OWNER_USER_ID=String(users[1].id);try{await assert.rejects(receive(envelope(100)),status(403))}finally{process.env.MOBOCOM_PAY_BALE_OWNER_USER_ID=String(users[0].id)}
 await db.user.updateMany({where:{id:users[0].id,status:'ACTIVE'},data:{status:'SUSPENDED'}});try{await assert.rejects(receive(envelope(100)),status(403))}finally{await db.user.updateMany({where:{id:users[0].id,status:'SUSPENDED'},data:{status:'ACTIVE'}})}
 await put(keys[1],JSON.stringify({enabled:false,settings:{}}));try{await assert.rejects(receive(envelope(100)),status(403))}finally{await put(keys[1],JSON.stringify({enabled:true,settings:{}}))}
 process.env.MOBOCOM_PAY_BALE_ENABLED='false';try{await assert.rejects(receive(envelope(100)),status(503));const stopped=await pay.baleSourceStatus(admin);assert.equal(stopped.receivingEnabled,false);assert.equal(stopped.events.total,historyBase+34)}finally{process.env.MOBOCOM_PAY_BALE_ENABLED='true'}
 await db.bankAccount.updateMany({where:{id:bank.id,active:true},data:{active:false}});try{await assert.rejects(receive(envelope(100)),status(503))}finally{await db.bankAccount.updateMany({where:{id:bank.id,active:false},data:{active:true}})}
 await assert.rejects(card.saveBankAccount({id:bank.id,bankName:bank.bankName,holderName:bank.holderName,accountNumber:'2222222222222',cardNumber:'',sheba:'',active:true}),status(409))
 const retired=await card.retireBankAccount(bank.id);assert.equal(retired.deactivated,true);assert.equal((await db.bankAccount.findUniqueOrThrow({where:{id:bank.id}})).active,false)
 gateway=await db.gateway.create({data:{name:stamp,provider:'MOBOCOM_PAY',active:true,isDefault:true,fiat:'IRR'}})
 assert.equal((await gateways.listCheckoutGateways('IRR')).some(g=>g.id===gateway.id),false)
 assert.deepEqual(await moneySnapshot(),before)
 // Separate personal accounts use isolated endpoint keys and immutable source identities.
 secondBank=await db.bankAccount.create({data:{bankName:stamp+'-second',holderName:stamp,accountNumber:'1111111111111',cardNumber:'0000000000000002',active:true,collectionUse:'MOBOCOM_PAY'}})
 const firstSource={...binding,id:'card-one',bankAccountId:bank.id,ownerUserId:users[0].id,secret:'a'.repeat(43),enabled:true,verified:true}
 const secondSource={...firstSource,id:'card-two',alias:'second_account',instanceId:'c'.repeat(64),accountId:'321',bankPeerId:'789',bankAccountId:secondBank.id,secret:'b'.repeat(43)}
 process.env.MOBOCOM_PAY_BALE_SOURCES=JSON.stringify([firstSource,secondSource])
 const second=envelope(200,{account:'1111111111111',reference:'MULTISOURCE200'});Object.assign(second,{session_id:secondSource.alias,instance_id:secondSource.instanceId,device_id:secondSource.accountId,peer:{type:'user',id:secondSource.bankPeerId},sender_id:secondSource.bankPeerId});Object.assign(second.payload,{chat_id:secondSource.bankPeerId,from:secondSource.bankPeerId})
 const secondRaw=Buffer.from(JSON.stringify(second)),secondSignature='sha256='+createHmac('sha256',secondSource.secret).update(secondRaw).digest('hex')
 await assert.rejects(pay.receiveBaleBankMessage(secondSignature,second.event_id,secondRaw),status(503))
 await assert.rejects(pay.receiveBaleBankMessage(secondSignature,second.event_id,secondRaw,firstSource.id),status(401))
 const routed=await http.POST_bale(new NextRequest('https://mobocom.invalid/api/payment/mobocom-pay/bale-events?source=card-two',{method:'POST',headers:{origin:'https://mobocom.invalid','x-hub-signature-256':secondSignature,'x-goomni-event-id':second.event_id},body:secondRaw}));assert.equal(routed.status,200)
 const routedId=(await routed.json()).data.id;assert.equal((await db.payBaleNotice.findUniqueOrThrow({where:{id:routedId}})).bankAccountId,secondBank.id)
 const multiStatus=await pay.baleSourceStatus(admin);assert.equal(multiStatus.sources.length,2);assert.equal(multiStatus.sources.find(s=>s.id==='card-two').financialReady,true)
 assert.equal(JSON.stringify(multiStatus).includes(secondSource.secret),false);assert.equal(JSON.stringify(multiStatus).includes(secondSource.instanceId),false)
 process.env.MOBOCOM_PAY_BALE_SOURCES=JSON.stringify([firstSource,{...secondSource,enabled:false}]);await assert.rejects(pay.receiveBaleBankMessage(secondSignature,second.event_id,secondRaw,secondSource.id),status(503))
 process.env.MOBOCOM_PAY_BALE_SOURCES='{';await assert.rejects(pay.receiveBaleBankMessage(secondSignature,second.event_id,secondRaw,secondSource.id),status(503));assert.equal((await pay.baleSourceStatus(admin)).configurationInvalid,true)
 delete process.env.MOBOCOM_PAY_BALE_SOURCES
 console.log('Bale server connected assertions passed: original-source identity, HMAC, durable dedupe/conflict, privacy, current guards, history, audit rollback and unchanged money; dormant shared provider excluded')
}finally{
 delete process.env.MOBOCOM_PAY_BALE_SOURCES
 const bankIds=[bank?.id,secondBank?.id].filter(Boolean),records=await db.payBaleNotice.findMany({where:{bankAccountId:{in:bankIds}},select:{id:true}})
 if(records.length){await db.auditLog.deleteMany({where:{action:'mobocom-pay.bale.received',targetId:{in:records.map(x=>x.id)}}});await db.payBaleNotice.deleteMany({where:{bankAccountId:{in:bankIds},duplicateOfId:{not:null}}});await db.payBaleNotice.deleteMany({where:{bankAccountId:{in:bankIds}}})}
 if(secondBank)await db.bankAccount.delete({where:{id:secondBank.id}})
 if(gateway)await db.gateway.delete({where:{id:gateway.id}});if(bank)await db.bankAccount.delete({where:{id:bank.id}})
 await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});if(role)await db.role.delete({where:{id:role.id}})
 for(const [key,old]of snapshots)if(old)await put(key,old.value);else await db.setting.deleteMany({where:{key}})
 access.clearAdminPolicyCache();await db.$disconnect()
}}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1})
