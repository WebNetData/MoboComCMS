const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const prisma=new PrismaClient(),second=new PrismaClient(),stamp='mround'+Date.now()+process.pid
let actor,fault=false
function wrap(client){return new Proxy(client,{get(target,key){if(key==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options);if(key==='moderationDecision')return new Proxy(target[key],{get(model,method){if(method==='upsert')return args=>{if(fault)throw Error('injected round history');return model.upsert(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}})}
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db:wrap(prisma)},'@/modules/identity/server/access':{requirePerm:async()=>actor},'@/modules/journal/server/comment-notifications':{notifyCommentPublished:async()=>{}},'@/modules/store/server/marketing':{awardReviewBonus:async()=>{}},'@/platform/observability/logger':{logEvent:()=>{},requestIdFrom:()=>stamp}})
const cases=load('src/modules/moderation/server/cases.ts'),comments=load('src/modules/site/server/http/admin/comments/route.ts'),feedback=load('src/modules/catalog/server/http/admin/product-feedback/route.ts')
const req=body=>new NextRequest('http://localhost:3000/api/admin/comments',{method:'PATCH',headers:{origin:'http://localhost:3000',host:'localhost:3000','content-type':'application/json'},body:JSON.stringify(body)})
const ids=[]
async function main(){try{
 actor=await prisma.user.create({data:{email:stamp+'@example.invalid',passwordHash:'unused'}})
 const post=await prisma.post.create({data:{slug:stamp,title:stamp,content:'test',authorId:actor.id}}),product=await prisma.product.create({data:{slug:stamp,name:stamp}})
 const fixtures=[['article-comments',await prisma.postComment.create({data:{postId:post.id,userId:actor.id,body:'rounds'}}),'postComment',body=>comments.PATCH(req(body)),{}],['product-reviews',await prisma.productReview.create({data:{productId:product.id,userId:actor.id,rating:4,body:'rounds'}}),'productReview',body=>feedback.PATCH(req(body)),{kind:'review'}],['product-questions',await prisma.productQuestion.create({data:{productId:product.id,userId:actor.id,body:'rounds'}}),'productQuestion',body=>feedback.PATCH(req(body)),{kind:'question'}]]
 for(const[source,row,model,send,extra]of fixtures){
  const work=await prisma.moderationCase.create({data:{source,itemId:row.id,note:'first-round note'}});ids.push(work.id)
  assert.equal((await send({id:row.id,status:'APPROVED',...extra})).status,200)
  const first=await prisma.moderationDecision.findUniqueOrThrow({where:{caseId_round:{caseId:work.id,round:1}}})
  assert.deepEqual([first.decision,first.note,first.decidedById],['approve','first-round note',actor.id])
  assert.equal((await send({id:row.id,status:'PENDING',...extra})).status,200)
  assert.deepEqual([(await prisma.moderationCase.findUnique({where:{id:work.id}})).round,(await prisma.moderationCase.findUnique({where:{id:work.id}})).status],[2,'OPEN'])
  await send({id:row.id,status:'PENDING',...extra});assert.equal((await prisma.moderationCase.findUnique({where:{id:work.id}})).round,2,'same pending write does not create a round')
  assert.deepEqual(await cases.recordDecision(source,row.id,actor.id,'approve',1),{recorded:false},'stale acknowledgement cannot decide the new round')
  await assert.rejects(cases.claimCase(source,row.id,actor.id),e=>e.status===409,'old client must refresh before a later-round action')
  await cases.claimCase(source,row.id,actor.id,false,new Date(),2)
  fault=true;await assert.rejects(send({id:row.id,status:'REJECTED',...extra}),/injected round history/);fault=false
  assert.equal((await prisma[model].findUnique({where:{id:row.id}})).status,'PENDING','history fault rolls back the owner')
  assert.equal((await send({id:row.id,status:'REJECTED',...extra})).status,200)
  assert.equal(await prisma.moderationDecision.count({where:{caseId:work.id}}),2)
  assert.deepEqual(await prisma.moderationDecision.findUnique({where:{caseId_round:{caseId:work.id,round:1}}}),first,'earlier decision remains byte-for-byte the same')
  const race=await Promise.all([prisma.$transaction(tx=>cases.reopenOwnerCase(tx,source,row.id)),second.$transaction(tx=>cases.reopenOwnerCase(tx,source,row.id))])
  assert.equal(race.filter(result=>result.reopened).length,1,'only one reopening wins')
  assert.equal((await prisma.moderationCase.findUnique({where:{id:work.id}})).round,3)
 }
 const recent=await cases.recentDecisions(['article-comments','product-reviews','product-questions'],100)
 for(const [source,row]of fixtures)assert.deepEqual(recent.filter(entry=>entry.source===source&&entry.itemId===row.id).map(entry=>entry.round).sort(),[1,2])
 console.log('Moderation rounds: actual comment/product owner requeue, immutable decisions, stale callbacks/claims, atomic fault rollback and concurrent reopen passed')
}finally{
 fault=false;await prisma.moderationCase.deleteMany({where:{id:{in:ids}}})
 await prisma.post.deleteMany({where:{slug:stamp}});await prisma.product.deleteMany({where:{slug:stamp}})
 if(actor){await prisma.auditLog.deleteMany({where:{actorUserId:actor.id}});await prisma.user.delete({where:{id:actor.id}})}
 await prisma.$disconnect();await second.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
