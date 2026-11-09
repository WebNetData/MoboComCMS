const assert=require('node:assert/strict'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt'),db=new PrismaClient(),stamp='owned-page-ai-'+Date.now(),users=[],roles=[],posts=[],orders=[],products=[]
assert(/test|check/.test(new URL(process.env.DATABASE_URL).pathname))
process.env.NEXTAUTH_SECRET=crypto.randomBytes(32).toString('hex')
let calls=0,promptSeen,actorSeen,purposeSeen,mutate,off='',limited=false
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'@/extensions/server/modules':{moduleGuard:async module=>off===module?new Response('{}',{status:423}):null},
 '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:!limited})},
 '../generation':{generate:async(prompt,config,purpose)=>{calls++;promptSeen=prompt;const context=load('src/modules/ai/server/admin-context.ts');actorSeen=context.personalAiActor();purposeSeen=context.personalAiPurpose();assert.equal(purpose,purposeSeen);if(mutate){const m=mutate;mutate=null;await m()}return{text:'پیشنهاد آزمایشی؛ هیچ تغییری اجرا نشده است.',model:'owned-model',provider:'owned-test'}}},
})
const api=load('src/modules/ai/server/http/page-assistant.ts'),record=load('src/modules/ai/server/page-assistant/record.ts')
const req=(method,body,token,origin='https://owned.test')=>new NextRequest('https://owned.test/api/admin/ai/context'+(method==='GET'?'?'+new URLSearchParams(body):''),{method,headers:{Host:'owned.test',...(token?{Cookie:'next-auth.session-token='+token}:{}),...(origin?{Origin:origin}:{}),'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})})
async function main(){try{
 const actors={}
 for(const [who,perm]of [['admin',null],['author','journal.author'],['pages','cms.pages'],['wrong','music.manage'],['customer','']]){
  let roleId=null;if(perm){const r=await db.role.create({data:{name:stamp+who,permissions:perm}});roles.push(r.id);roleId=r.id}
  const u=await db.user.create({data:{email:stamp+who+'@invalid.test',passwordHash:'unused',name:who,role:who==='customer'?'CUSTOMER':'ADMIN',roleId,status:'ACTIVE'}});users.push(u.id);actors[who]={...u,token:await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(u.id),authAt:Date.now()}})}
 }
 for(const [n,authorId]of [[0,actors.admin.id],[1,actors.author.id]])posts.push((await db.post.create({data:{slug:stamp+n,title:'Owned '+n,content:'<p>PRIVATE_SAVED_BODY_'+n+'</p>',excerpt:'OWNED_EXCERPT',status:'DRAFT',authorId}})).id)
 const target={kind:'posts',id:posts[0]},input={path:'/admin/posts',target,expectedActorId:actors.admin.id,instruction:'این مطلب موبوکام را بررسی کن',includeRecord:true,selectedText:'متن انتخابی من',turns:[]}
 let response=await api.GET(req('GET',{path:input.path,kind:target.kind,id:String(target.id)},actors.admin.token));assert.equal(response.status,200);assert.equal(calls,0);assert(!JSON.stringify(await response.json()).includes('PRIVATE_SAVED_BODY'))
 const before=await db.post.findUniqueOrThrow({where:{id:posts[0]}}),proposals=await db.aiAssistantProposal.count()
 response=await api.POST(req('POST',input,actors.admin.token));assert.equal(response.status,200,await response.text());assert.equal(actorSeen,actors.admin.id);assert.equal(purposeSeen,'editor');let facts=JSON.parse(promptSeen.user);assert.equal(facts.savedRecord.id,posts[0]);assert(facts.savedRecord.content.includes('PRIVATE_SAVED_BODY_0'));assert(!promptSeen.system.includes('PRIVATE_SAVED_BODY_0'));assert(promptSeen.system.includes('Canonical source inventory'))
 assert.deepEqual(await db.post.findUniqueOrThrow({where:{id:posts[0]}}),before);assert.equal(await db.aiAssistantProposal.count(),proposals,'advice cannot create an executable proposal or save content')
 response=await api.POST(req('POST',{...input,includeRecord:false,turns:[{role:'user',text:'سؤال قبلی'},{role:'assistant',text:'پاسخ قبلی'}]},actors.admin.token));assert.equal(response.status,200);facts=JSON.parse(promptSeen.user);assert.equal(facts.savedRecord,null);assert.equal(facts.conversation.length,2)
 const n=calls;assert.equal((await api.POST(req('POST',{...input,expectedActorId:actors.author.id},actors.admin.token))).status,409,'an old account transcript is rejected before any inference');assert.equal(calls,n)
 for(const who of ['wrong','pages','customer'])assert.equal((await api.POST(req('POST',input,actors[who].token))).status,403,who)
 assert.equal((await api.POST(req('POST',input,null))).status,403)
 assert.equal((await api.POST(req('POST',input,actors.admin.token,'https://evil.test'))).status,403)
 assert.equal((await api.POST(req('POST',input,actors.admin.token,null))).status,403)
 assert.equal(calls,n)
 response=await api.POST(req('POST',{...input,expectedActorId:actors.author.id},actors.author.token));assert.equal(response.status,404);assert.equal(calls,n,'author cannot read another author record')
 const own={...input,expectedActorId:actors.author.id,target:{kind:'posts',id:posts[1]}}
 assert.equal((await api.POST(req('POST',own,actors.author.token))).status,200);assert.equal(actorSeen,actors.author.id)
 for(const body of [{...input,path:'/admin/pages'},{...input,target:{kind:'products',id:1}},{...input,path:'/admin/posts?secret=x'},{...input,selectedText:'x'.repeat(4001)}])assert.equal((await api.POST(req('POST',body,actors.admin.token))).status,422)
 off='journal';assert.equal((await api.POST(req('POST',input,actors.admin.token))).status,423);off='ai-assistant';assert.equal((await api.GET(req('GET',{path:'/admin'},actors.admin.token))).status,423);off=''
 limited=true;assert.equal((await api.POST(req('POST',input,actors.admin.token))).status,429);limited=false
 mutate=()=>db.post.update({where:{id:posts[0]},data:{content:'changed'}});assert.equal((await api.POST(req('POST',input,actors.admin.token))).status,409,'changed source response suppressed without replay')
 mutate=()=>db.user.update({where:{id:actors.admin.id},data:{status:'BANNED'}});assert.equal((await api.POST(req('POST',input,actors.admin.token))).status,403,'fresh role/status check suppresses delayed response');await db.user.update({where:{id:actors.admin.id},data:{status:'ACTIVE'}})
 const p=await db.product.create({data:{slug:stamp,name:'Owned product',kind:'VIRTUAL',priceMinor:12345n,currency:'USD'}});products.push(p.id)
 const o=await db.order.create({data:{userId:actors.customer.id,productId:p.id,totalMinor:12345n,totalAmount:123.45,currency:'USD',status:'PAID',meta:'PRIVATE_PAYMENT_SECRET'}});orders.push(o.id)
 const projected=await record.pageAssistantRecord({kind:'orders',id:o.id},null);assert.equal(projected.id,o.id);assert.equal(projected.totalDecimal,'123.45');assert.equal((await record.pageAssistantRecord({kind:'products',id:p.id},null)).priceDecimal,'123.45');assert(!JSON.stringify(projected).includes('PRIVATE_PAYMENT_SECRET'));assert(!Object.hasOwn(projected,'userId'))
 response=await api.POST(req('POST',{path:'/admin/store/orders/'+o.id,expectedActorId:actors.admin.id,instruction:'وضعیت این سفارش چیست؟',includeRecord:true},actors.admin.token));assert.equal(response.status,200);assert.equal(purposeSeen,'operations');assert.equal(JSON.parse(promptSeen.user).savedRecord.id,o.id)
 assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).status,'PAID')
 console.log('Contextual Admin native PG: real JWT/role/author scoping, consent, bounded facts/history, per-actor/purpose routing, no model on GET/no mutation on advice, Origin/rate/module guards, source/status races and private order projection passed')
}finally{
 await db.order.deleteMany({where:{id:{in:orders}}});await db.product.deleteMany({where:{id:{in:products}}});await db.post.deleteMany({where:{id:{in:posts}}});await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}});await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
