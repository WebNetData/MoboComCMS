const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),http=require('node:http')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL||'').pathname),'Disposable PostgreSQL required')
const db=new PrismaClient(),stamp='demand-'+Date.now(),ids={users:[],products:[],demands:[],carts:[],shares:[],roles:[],games:[],links:[]},oldSettings=new Map()
let viewer=null,offModule='',probeMode='fail',probeCalls=0,server
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},'next-auth/jwt':{getToken:async()=>viewer?{uid:String(viewer.id),authAt:Date.now()}:null},'@/extensions/server/modules':{isModuleEnabled:async id=>id!==offModule,moduleGuard:async id=>id===offModule?Response.json({error:'off'},{status:404}):null},'@/modules/downloads/server/remote':{probePublicFile:async()=>{probeCalls++;if(probeMode==='edit')await db.mediaLink.update({where:{id:ids.links[0]},data:{url:'https://files.example.com/changed.bin'}});return{ok:probeMode==='ok',status:probeMode==='ok'?200:404,detail:'Synthetic metadata response'}}}})
const demand=load('src/modules/support/server/demand.ts'),demandApi=load('src/modules/support/server/demand/http.ts'),cart=load('src/modules/store/server/cart.ts'),sharing=load('src/modules/store/server/shared-cart.ts'),shareApi=load('src/modules/store/server/http/shared-cart.ts'),health=load('src/modules/downloads/server/health.ts')
const request=(path,method='GET',body,foreign=false)=>new NextRequest('http://localhost'+path,{method,headers:{Host:'localhost',Origin:foreign?'https://foreign.invalid':'http://localhost','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
async function setting(key,value){if(!oldSettings.has(key))oldSettings.set(key,await db.setting.findUnique({where:{key}}));await db.setting.upsert({where:{key},create:{key,value},update:{value}})}
async function main(){
 const role=await db.role.create({data:{name:stamp,permissions:'games.manage'}});ids.roles.push(role.id)
 for(const [name,roleValue,roleId]of [['manager','ADMIN',role.id],['sender','CUSTOMER',null],['recipient','CUSTOMER',null],['other','CUSTOMER',null]]){const row=await db.user.create({data:{email:`${stamp}-${name}@example.invalid`,name,passwordHash:'!',role:roleValue,roleId,totpEnabledAt:roleValue==='ADMIN'?new Date():null,smsAlerts:false,emailAlerts:false,pushAlerts:false}});ids.users.push(row.id)}
 const [manager,sender,recipient,other]=await Promise.all(ids.users.map(id=>db.user.findUniqueOrThrow({where:{id}})))
 await setting('lease.downloads-health-batch','1970-01-01T00:00:00.000Z')
 const game=await db.gameTitle.create({data:{slug:stamp,title:'Synthetic requested game',status:'PUBLISHED',access:'PUBLIC',publishedAt:new Date()}});ids.games.push(game.id)
 const product=await db.product.create({data:{slug:stamp,name:'Synthetic shared laptop',kind:'PHYSICAL',active:true,approval:'APPROVED',access:'PUBLIC',currency:'IRT',price:1000,priceMinor:1000n,stock:8}});ids.products.push(product.id)
 // Grouping is explicit, scoped and private; canonical notification creates no external jobs.
 viewer=sender
 const created=await demandApi.POST(request('/api/support/requests','POST',{section:'games',title:'نام بازی',note:'PC version'}));assert.equal(created.status,201,await created.clone().text());const group=await created.json();ids.demands.push(group.id)
 viewer=recipient
 const needReview=await demandApi.POST(request('/api/support/requests','POST',{section:'games',title:'نام بازی'}));assert.equal(needReview.status,409)
 const join={section:'games',title:'نام بازی',joinDemandId:group.id,note:'Second requester'}
 assert.equal((await demandApi.POST(request('/api/support/requests','POST',join))).status,201)
 assert.equal((await demandApi.POST(request('/api/support/requests','POST',join))).status,201)
 assert.equal(await db.contentDemandSupporter.count({where:{demandId:group.id}}),2)
 viewer=other
 const mine=await demandApi.GET(request('/api/support/requests'));assert.deepEqual((await mine.json()).requests,[])
 viewer=manager
 assert.equal((await demandApi.GET(request('/api/support/requests?admin=1&section=store'))).status,403)
 const command={action:'decide',id:group.id,section:'games',version:1,status:'FULFILLED',gameId:game.id,note:'Prepared synthetic item'}
 await db.gameTitle.update({where:{id:game.id},data:{status:'DRAFT'}});assert.equal((await demandApi.POST(request('/api/support/requests','POST',command))).status,409)
 await db.gameTitle.update({where:{id:game.id},data:{status:'PUBLISHED'}})
 assert.equal((await demandApi.POST(request('/api/support/requests','POST',command,true))).status,403)
 const resolved=await demandApi.POST(request('/api/support/requests','POST',command));assert.equal(resolved.status,200,await resolved.clone().text())
 assert.equal((await demandApi.POST(request('/api/support/requests','POST',command))).status,409)
 await demand.deliverDemandFulfilled({demandId:group.id,version:2});await demand.deliverDemandFulfilled({demandId:group.id,version:2})
 const notices=await db.userNotification.findMany({where:{userId:{in:[sender.id,recipient.id]},kind:'CONTENT_DEMAND_FULFILLED'}});assert.equal(notices.length,2);assert(notices.every(row=>row.deliveryChannels==='-'&&row.href.includes('/dashboard/content-requests')))
 assert.equal(await db.backgroundJob.count({where:{kind:'notification.deliver',payload:{contains:stamp}}}),0)
 viewer=other;assert.equal((await demandApi.POST(request('/api/support/requests','POST',join))).status,201)
 const lateJob=await db.backgroundJob.findFirstOrThrow({where:{kind:'support.demand-fulfilled',dedupeKey:`demand:${group.id}:2:user:${other.id}`}})
 await demand.deliverDemandFulfilled({...JSON.parse(lateJob.payload),cursor:other.id+100})
 assert.equal(await db.userNotification.count({where:{userId:other.id,kind:'CONTENT_DEMAND_FULFILLED'}}),1,'late supporter receives notice independently of the batch cursor')
 const analytics=load('src/modules/analytics/domain/analytics.ts')
 assert.equal(analytics.normalizeTrackedPath('/shared-cart/'+'a'.repeat(48)),'')
 assert.equal(analytics.normalizeTrackedPath('/quote/'+'b'.repeat(48)),'')
 viewer=sender;const owned=await demandApi.GET(request('/api/support/requests'));assert.equal((await owned.json()).requests[0].target.href,`/games/${stamp}`)
 await db.gameTitle.update({where:{id:game.id},data:{access:'MEMBERS'}});assert.equal((await (await demandApi.GET(request('/api/support/requests'))).json()).requests[0].target,null)
 await db.gameTitle.update({where:{id:game.id},data:{access:'PUBLIC'}})
 offModule='games';assert.equal((await demandApi.POST(request('/api/support/requests','POST',{section:'games',title:'Another'}))).status,404);offModule=''
 // Share only ordinary public selections; atomically import through Cart and replay safely.
 const senderOwner={userId:sender.id,token:null},receiverOwner={userId:recipient.id,token:null}
 await cart.addToCart(senderOwner,{productId:product.id,quantity:2});const senderCart=await cart.findCart(senderOwner);ids.carts.push(senderCart.id)
 const receiverCart=await cart.ensureCart(receiverOwner);ids.carts.push(receiverCart.id)
 const share=await sharing.createSharedCart(senderOwner,{title:'Public combination'});ids.shares.push(share.id);const token=share.href.split('/').at(-1)
 const stored=await db.sharedCart.findUniqueOrThrow({where:{id:share.id}});assert(!JSON.stringify(stored).includes(token));assert(!stored.lines.includes('inputs'));assert(!stored.lines.includes('price'))
 let preview=await sharing.sharedCartPreview(token,receiverOwner)
 assert.equal(preview.lines[0].unitMinor,'1000');assert(!JSON.stringify(preview).includes(sender.email));assert(!JSON.stringify(preview).includes(senderCart.token))
 const oldPreview=preview
 await db.product.update({where:{id:product.id},data:{priceMinor:1200n,price:1200}})
 const wants=[{productId:product.id,variantId:null,quantity:2}],requestId=randomUUID()
 await assert.rejects(sharing.addSharedCart(receiverOwner,token,{confirmed:true,fingerprint:oldPreview.fingerprint,requestId,lines:wants}),error=>error.status===409)
 assert.equal(await db.cartLine.count({where:{cartId:receiverCart.id}}),0)
 preview=await sharing.sharedCartPreview(token,receiverOwner,wants)
 const add={confirmed:true,fingerprint:preview.fingerprint,requestId,lines:wants}
 await sharing.addSharedCart(receiverOwner,token,add);await sharing.addSharedCart(receiverOwner,token,add)
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:receiverCart.id}})).quantity,2)
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:senderCart.id}})).quantity,2)
 const over=[{productId:product.id,variantId:null,quantity:8}],overPreview=await sharing.sharedCartPreview(token,receiverOwner,over)
 await assert.rejects(sharing.addSharedCart(receiverOwner,token,{confirmed:true,fingerprint:overPreview.fingerprint,requestId:randomUUID(),lines:over}),error=>error.status===409)
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:receiverCart.id}})).quantity,2)
 await assert.rejects(sharing.revokeSharedCart(receiverOwner,share.id,1),error=>error.status===409)
 await sharing.revokeSharedCart(senderOwner,share.id,1);await assert.rejects(sharing.sharedCartPreview(token,receiverOwner),error=>error.status===404)
 await db.product.update({where:{id:product.id},data:{orderFields:'[{"key":"secret","label":"Private answer","kind":"text","required":true}]'}})
 await assert.rejects(sharing.createSharedCart(senderOwner,{title:'No private answers'}),error=>error.status===409)
 // Persisted current-source health, deduped ordinary report, no network for unlisted hosts.
 const link=await db.mediaLink.create({data:{ownerType:'game',ownerId:game.id,url:'https://files.example.com/game.bin'}});ids.links.push(link.id)
 await setting('downloads.health.v1',JSON.stringify({enabled:true,hosts:['files.example.com'],intervalHours:6,batchSize:2}))
 await setting('downloads.health.cursor.v1','{}');await health.syncHealthInventory()
 const healthRow=await db.downloadLinkHealth.findUniqueOrThrow({where:{sourceKey:`link:${link.id}`}})
 async function due(){await db.downloadLinkHealth.update({where:{id:healthRow.id},data:{nextCheckAt:new Date(0),leaseUntil:null}});await db.setting.update({where:{key:'lease.downloads-health-batch'},data:{value:'1970-01-01T00:00:00.000Z'}})}
 for(let n=0;n<3;n++){await due();await health.runHealthBatch()}
 assert.equal(await db.linkReport.count({where:{linkId:link.id,visitor:`health:${healthRow.id}`,status:'OPEN'}}),1)
 assert.equal((await db.mediaLink.findUniqueOrThrow({where:{id:link.id}})).disabled,false)
 probeMode='ok';await due();await health.runHealthBatch();const good=await db.downloadLinkHealth.findUniqueOrThrow({where:{id:healthRow.id}});assert.equal(good.failureCount,0);assert(good.lastSuccessAt)
 probeMode='edit';await due();await health.runHealthBatch();assert.equal((await db.downloadLinkHealth.findUniqueOrThrow({where:{id:healthRow.id}})).checkedAt.getTime(),good.checkedAt.getTime(),'late result for changed URL is ignored')
 await health.syncHealthInventory();const reset=await db.downloadLinkHealth.findUniqueOrThrow({where:{id:healthRow.id}});assert.equal(reset.status,'PENDING');assert.equal(reset.lastSuccessAt,null)
 await setting('downloads.health.v1',JSON.stringify({enabled:true,hosts:['other.example.com'],intervalHours:6,batchSize:2}));const beforeCalls=probeCalls;await due();await health.runHealthBatch();assert.equal(probeCalls,beforeCalls)
 const skipped=await db.downloadLinkHealth.findUniqueOrThrow({where:{id:healthRow.id}});assert.equal(skipped.failureCount,0,'a skipped host is not a failed probe');assert(skipped.nextCheckAt>new Date(Date.now()+5*3600_000))
 // Real loopback-only transport verifies HEAD, redirect refusal and range fallback without full body.
 const transport=require('./connected-source-loader.cjs')()('src/modules/downloads/server/remote.ts')
 process.env.IMPORT_ALLOW_LOOPBACK='1'
 const methods=[],portReady=new Promise(resolve=>{server=http.createServer((req,res)=>{methods.push([req.url,req.method,req.headers.range]);if(req.url==='/redirect'){res.writeHead(302,{location:'http://169.254.169.254/latest/meta-data'});res.end();return}if(req.url==='/fallback'&&req.method==='HEAD'){res.writeHead(405);res.end();return}res.writeHead(req.method==='HEAD'?200:206,{'content-type':'application/octet-stream','content-length':'1','content-range':'bytes 0-0/1000000'});res.end(req.method==='HEAD'?undefined:'x')});server.listen(0,'127.0.0.1',resolve)})
 await portReady;const base=`http://127.0.0.1:${server.address().port}`
 assert.equal((await transport.probePublicFile(base+'/file')).ok,true)
 assert.equal((await transport.probePublicFile(base+'/fallback')).ok,true)
 assert.equal((await transport.probePublicFile(base+'/redirect')).ok,false)
 assert(methods.some(row=>row[0]==='/fallback'&&row[1]==='GET'&&row[2]==='bytes=0-0'))
 assert.equal((await transport.probePublicFile('http://10.1.2.3/file')).ok,false)
 console.log('Site demand/shared cart/link health PostgreSQL passed: explicit grouping/privacy/scoped manager/public target/inbox-only replay; source-private share/current repricing/atomic quantity/replay/revocation; persisted health/stale source/report dedupe; actual guarded HEAD/range/private redirect refusal')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve))
 await db.backgroundJob.deleteMany({where:{kind:'support.demand-fulfilled',payload:{contains:String(ids.demands[0]||-1)}}})
 await db.userNotification.deleteMany({where:{userId:{in:ids.users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:ids.users}}})
 await db.contentDemandSupporter.deleteMany({where:{demandId:{in:ids.demands}}});await db.contentDemand.deleteMany({where:{id:{in:ids.demands}}})
 await db.sharedCartImport.deleteMany({where:{shareId:{in:ids.shares}}});await db.sharedCart.deleteMany({where:{id:{in:ids.shares}}});await db.cartLine.deleteMany({where:{cartId:{in:ids.carts}}});await db.cart.deleteMany({where:{id:{in:ids.carts}}})
 await db.mediaLink.deleteMany({where:{id:{in:ids.links}}});await db.product.deleteMany({where:{id:{in:ids.products}}});await db.gameTitle.deleteMany({where:{id:{in:ids.games}}})
 await db.user.deleteMany({where:{id:{in:ids.users}}});await db.role.deleteMany({where:{id:{in:ids.roles}}})
 for(const[key,row]of oldSettings){if(row)await db.setting.updateMany({where:{key},data:{value:row.value}});else await db.setting.deleteMany({where:{key}})}await db.$disconnect()
})
