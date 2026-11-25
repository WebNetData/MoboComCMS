const assert=require('node:assert/strict'),{createHmac,randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client')
;(async()=>{const h=await require('./pay-center.fixture.cjs')('webhooks'),{db,pay,actors:[admin,,owner,other]}=h;const RealDate=Date;let clock=RealDate.now();const setClock=n=>{clock=n;global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}};try{
 const config=await pay.saveWebhookEndpoint(owner,{terminalId:h.terminal.id,url:'https://receiver.invalid/hook',active:true})
 assert.match(config.secret,/^[A-Za-z0-9_-]{43}$/);assert.equal(JSON.stringify(await pay.webhookOverview(owner,new URLSearchParams())).includes(config.secret),false)
 await assert.rejects(pay.saveWebhookEndpoint(other,{terminalId:h.terminal.id,url:'https://receiver.invalid/hook',active:true}))
 for(const url of ['http://receiver.invalid/hook','https://receiver.invalid:444/hook','https://receiver.invalid/hook?token=x','https://127.0.0.1/hook'])await assert.rejects(pay.saveWebhookEndpoint(owner,{terminalId:h.terminal.id,version:1,url,active:true}))
 const paid=await h.paid();let row=await db.payWebhookDelivery.findUniqueOrThrow({where:{paymentId:paid.payment.id}});const event=JSON.parse(row.payloadJson)
 assert.equal(event.id,row.id);assert.equal(event.data.status,'PAID');assert.equal(event.data.merchant_credit_amount,'10000000');assert.equal(event.created_at,paid.payment.paidAt.toISOString());assert.equal(event.data.invoice_total_rial,'10000000');assert.equal(Object.keys(event.data).length,9)
 await pay.acceptBankEvent(paid.event,'synthetic');assert.equal(await db.payWebhookDelivery.count({where:{paymentId:paid.payment.id}}),1)
 const creditBefore=await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}})
 await pay.deliverPayWebhook({deliveryId:row.id});assert.equal(h.calls.length,1)
 const [url,body,headers]=h.calls[0];assert.equal(url,row.url);assert.equal(body,row.payloadJson);assert.equal(headers['X-MoboCom-Event-Id'],row.id);assert.equal(headers['X-MoboCom-Signature'],'v1='+createHmac('sha256',config.secret).update(headers['X-MoboCom-Timestamp']+'.'+body).digest('hex'))
 row=await db.payWebhookDelivery.findUniqueOrThrow({where:{id:row.id}});assert.equal(row.status,'DELIVERED');await pay.deliverPayWebhook({deliveryId:row.id});assert.equal(h.calls.length,1)
 await assert.rejects(db.payWebhookDelivery.updateMany({where:{id:row.id},data:{payloadJson:'{}',version:{increment:1}}}))
 await assert.rejects(pay.recoverWebhookDelivery(owner,{id:row.id,version:row.version,configVersion:1,action:'redeliver',ackReplay:false}))
 await pay.saveWebhookEndpoint(owner,{terminalId:h.terminal.id,version:1,url:'https://receiver.invalid/new-hook',active:true,rotateSecret:true})
 await assert.rejects(pay.recoverWebhookDelivery(owner,{id:row.id,version:row.version,configVersion:1,action:'redeliver',ackReplay:true}),e=>e.status===409)
 await pay.recoverWebhookDelivery(owner,{id:row.id,version:row.version,configVersion:2,action:'redeliver',ackReplay:true})
 await pay.deliverPayWebhook({deliveryId:row.id});const attempts=await db.payWebhookAttempt.findMany({where:{deliveryId:row.id},orderBy:{number:'asc'}});assert.equal(attempts.length,2);assert.equal(attempts[0].configVersion,1);assert.equal(attempts[0].url,'https://receiver.invalid/hook');assert.equal(attempts[1].configVersion,2);assert.equal(h.calls[1][1],body);assert.notEqual(h.calls[1][2]['X-MoboCom-Attempt-Id'],headers['X-MoboCom-Attempt-Id'])
 await assert.rejects(db.payWebhookAttempt.updateMany({where:{id:attempts[0].id},data:{url:'https://receiver.invalid/rewritten'}}))
 const failing=await h.paid();const failureId=(await db.payWebhookDelivery.findUniqueOrThrow({where:{paymentId:failing.payment.id}})).id;h.setTransport(async()=>({status:503,body:'untrusted secret response'}))
 for(let i=0;i<8;i++){row=await db.payWebhookDelivery.findUniqueOrThrow({where:{id:failureId}});setClock(Math.max(clock,row.nextAttemptAt.getTime()+1));await pay.deliverPayWebhook({deliveryId:failureId})}
 row=await db.payWebhookDelivery.findUniqueOrThrow({where:{id:failureId}});assert.equal(row.status,'FAILED');assert.equal(row.attempts,8);assert.equal(JSON.stringify(await pay.webhookOverview(owner,new URLSearchParams())).includes('untrusted secret response'),false)
 global.Date=RealDate;h.setTransport(async()=>({status:204,body:''}));const blocked=await h.paid();const blockedRow=await db.payWebhookDelivery.findUniqueOrThrow({where:{paymentId:blocked.payment.id}});const section=h.load('src/modules/account/server/section-access.ts');assert.equal(await section.userOpensSection('mobocom-pay',owner.id),true)
 const secondDb=new PrismaClient();try{await secondDb.setting.update({where:{key:'site.section-access.v1'},data:{value:JSON.stringify({'mobocom-pay':['group:999999999']})}})}finally{await secondDb.$disconnect()}
 const n=h.calls.length;await pay.deliverPayWebhook({deliveryId:blockedRow.id});assert.equal(h.calls.length,n);assert.equal((await db.payWebhookDelivery.findUniqueOrThrow({where:{id:blockedRow.id}})).status,'PAUSED');await h.put('site.section-access.v1','{}')
 const paused=await h.paid();const pauseRow=await db.payWebhookDelivery.findUniqueOrThrow({where:{paymentId:paused.payment.id}});await pay.saveWebhookEndpoint(admin,{id:config.endpoint.id,version:2,active:false},true);await pay.deliverPayWebhook({deliveryId:pauseRow.id});assert.equal(h.calls.length,n)
 assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),creditBefore+3)
 await pay.saveWebhookEndpoint(owner,{terminalId:h.terminal.id,version:3,url:'https://receiver.invalid/recovered',active:true})
 const crash=await h.paid();const crashRow=await db.payWebhookDelivery.findUniqueOrThrow({where:{paymentId:crash.payment.id}})
 let release;const gate=new Promise(resolve=>release=resolve);h.setTransport(async()=>{await gate;return{status:204,body:''}})
 const running=pay.deliverPayWebhook({deliveryId:crashRow.id})
 let claimed;for(let i=0;i<100;i++){claimed=await db.payWebhookDelivery.findUniqueOrThrow({where:{id:crashRow.id}});if(claimed.status==='SENDING')break;await new Promise(resolve=>setTimeout(resolve,5))}assert.equal(claimed.status,'SENDING')
 setClock(claimed.leaseExpiresAt.getTime()+1);await pay.deliverPayWebhook({deliveryId:crashRow.id});release();await running
 const unknown=await db.payWebhookDelivery.findUniqueOrThrow({where:{id:crashRow.id}});assert.equal(unknown.status,'RETRY');assert.equal((await db.payWebhookAttempt.findFirstOrThrow({where:{deliveryId:crashRow.id}})).status,'UNKNOWN')
 h.setTransport(async()=>({status:204,body:''}));setClock(unknown.nextAttemptAt.getTime()+1);await pay.deliverPayWebhook({deliveryId:crashRow.id});assert.equal((await db.payWebhookDelivery.findUniqueOrThrow({where:{id:crashRow.id}})).status,'DELIVERED');global.Date=RealDate
 const deliveriesBefore=await db.payWebhookDelivery.count(),creditsBefore=await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}})
 h.setAuditFault(true);try{await assert.rejects(h.paid(),/synthetic webhook audit failure/)}finally{h.setAuditFault(false)}
 assert.equal(await db.payWebhookDelivery.count(),deliveriesBefore);assert.equal(await db.walletTx.count({where:{userId:owner.id,type:'PAY_CREDIT'}}),creditsBefore)
 // Synthetic directory rows exercise Admin pagination beyond one page. No extra payments.
 const ciphertext=(await db.payWebhookEndpoint.findUniqueOrThrow({where:{id:config.endpoint.id}})).secretCiphertext
 for(let i=0;i<26;i++){const t=await db.payTerminal.create({data:{id:randomUUID(),merchantId:h.merchant.id,name:'Directory '+i,returnUrl:'',channelType:'PAYMENT_LINK'}});await db.payWebhookEndpoint.create({data:{id:randomUUID(),terminalId:t.id,url:'https://receiver.invalid/directory',secretCiphertext:ciphertext}})}
 const firstPage=await pay.webhookOverview(admin,new URLSearchParams(),true),secondPage=await pay.webhookOverview(admin,new URLSearchParams({endpointPage:'2'}),true)
 const endpointTotal=await db.payWebhookEndpoint.count()
 assert.equal(firstPage.endpointPages,Math.ceil(endpointTotal/25));assert.equal(firstPage.endpoints.length,25);assert.equal(secondPage.endpoints.length,Math.min(25,endpointTotal-25))
 assert.equal(new Set([...firstPage.endpoints,...secondPage.endpoints].map(e=>e.id)).size,Math.min(50,endpointTotal))
 assert(firstPage.deliveryEndpoints.some(e=>e.id===config.endpoint.id),'Current delivery binding survives directory pagination')
 console.log('Webhooks PASS: atomic paid event, signature/secret privacy, replay/redelivery/version race, immutable historical targets,8 retries, fresh section revocation and Admin pause; delivery never credits')
 }finally{global.Date=RealDate;await h.cleanup()}})().catch(e=>{console.error(e.stack);process.exitCode=1})
