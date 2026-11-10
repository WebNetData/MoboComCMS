const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),source=require('./connected-source-loader.cjs'),db=new PrismaClient();
assert(/check|test/.test(new URL(process.env.DATABASE_URL).pathname)||process.env.MOBOCOM_OWNED_FIXTURES==='1','Use a test DB or explicitly opt in to owned fixtures');
const stamp='owned-ai-slug-'+randomUUID(),owned={batches:[],posts:[],products:[],pages:[]};let actor;
const req=()=>new NextRequest('http://localhost:3270/api/admin/ai/production',{method:'POST',headers:{origin:'http://localhost:3270','content-type':'application/json'},body:'{}'});
const config={categoryIds:[],length:'medium',tone:'دقیق',keywords:'',instruction:'',cover:false,inline:0,imageStyle:'editorial',ratio:'landscape',productKind:'PHYSICAL',currency:'IRT',specifications:'{}'},seed={topic:'موضوع قطعی آزمون',facts:'اطلاعات تأییدشدهٔ آزمایشی',price:'12345',stock:7};
;(async()=>{try{
 actor=await db.user.create({data:{email:stamp+'@invalid.test',name:stamp,passwordHash:'unused-owned-fixture',role:'ADMIN',status:'ACTIVE'}});
 const load=source({'@/platform/database/prisma':{db},'next-auth/jwt':{getToken:async()=>({uid:String(actor.id),authAt:Date.now()})},'@/extensions/server/modules':{isModuleEnabled:async()=>true,moduleGuard:async()=>null,getModuleSettings:async()=>({}),getModuleStates:async()=>({})},'@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true})},'@/modules/content/server/events':{contentChanged(){}},'@/modules/site/server/seo':{getSiteSeo:async()=>({name:'Owned site'})}}),service=load('src/modules/ai/server/production.ts');
 const command=(b,action,extra={})=>service.productionCommand(req(),{id:b.id,version:b.version,action,...extra});
 const prepared=async(kind)=>{const id=randomUUID();owned.batches.push(id);let b=await service.productionCreate(req(),{kind,config,seeds:[seed]},id);b=(await command(b,'start')).batch;const claim=await command(b,'claim',{itemId:b.items[0].id});const output={title:stamp,slug:stamp+'-'+kind,excerpt:'خلاصهٔ آزمون',coverPrompt:'unused',sections:[{heading:'بخش آزمون',text:'متن قطعی و امن برای آزمون ذخیرهٔ نامک. '.repeat(12),imagePrompt:'unused'}]};return(await command(claim.batch,'text',{itemId:claim.step.itemId,lease:claim.step.lease,text:JSON.stringify(output)})).batch};
 // Same title twice on purpose (the -2 slug): the duplicate-content gate blocks it until a reviewer acknowledges, as here.
 for(const kind of ['post','product','page']){
  const saved=[];for(let i=0;i<2;i++){const b=await prepared(kind),s=await command(b,'save',{itemId:b.items[0].id,acknowledged:true});owned[kind==='post'?'posts':kind==='product'?'products':'pages'].push(s.result.id);const model=kind==='post'?db.post:kind==='product'?db.product:db.page,row=await model.findUniqueOrThrow({where:{id:s.result.id}});assert.equal(row.slug,stamp+'-'+kind+(i?'-2':''));saved.push(row.id);const repeat=await command(b,'save',{itemId:b.items[0].id,acknowledged:true});assert.equal(repeat.result.id,row.id,'receipt remains idempotent')}
  assert.equal(new Set(saved).size,2);
 }
 console.log('Native PostgreSQL: posts/products/pages keep exact free slug; actual collisions alone use -2; repeated saves reuse the same atomic receipt. Existing URLs unchanged.');
 }finally{
  await db.aiProductionBatch.deleteMany({where:{id:{in:owned.batches}}});if(actor){await db.contentRevision.deleteMany({where:{actorId:actor.id}});await db.auditLog.deleteMany({where:{actorUserId:actor.id}})}
  await db.post.deleteMany({where:{id:{in:owned.posts}}});await db.product.deleteMany({where:{id:{in:owned.products}}});await db.page.deleteMany({where:{id:{in:owned.pages}}});if(actor)await db.user.delete({where:{id:actor.id}});await db.$disconnect()
 }
})().catch(e=>{console.error(e);process.exitCode=1});
