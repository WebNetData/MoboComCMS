// Owned PostgreSQL only: actual CMS/Journal/Operations/Inbox, deterministic interleavings and delivery faults.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/mobocom_review_reliability_[a-z0-9_]+$/,'owned editorial reliability database required')
const raw=new PrismaClient(),stamp='review-safe-'+Date.now(),started=new Date(),postIds=[],userIds=[]
let viewer,manager,author,role,original,settingsRead=false,afterOne=null,afterMany=null,selectedJobs=[],inboxFault='',intentFault=false,auditFault=false,noticeCalls=0
const db=raw.$extends({query:{
  post:{
    async findUnique({args,query}){const result=await query(args);if(afterOne&&args.select?.trashedStatus){const fn=afterOne;afterOne=null;await fn(result)}return result},
    async findMany({args,query}){const result=await query(args);if(afterMany&&args.select?.slug&&args.where?.id?.in){const fn=afterMany;afterMany=null;await fn(result)}return result},
  },
  backgroundJob:{
    async findFirst({args,query}){return query({...args,where:{...args.where,id:{in:selectedJobs}}})},
    async create({args,query}){if(intentFault&&args.data.kind==='journal.editorial-decision')throw Error('owned intent failure');return query(args)},
  },
  auditLog:{async create({args,query}){if(auditFault)throw Error('owned audit failure');return query(args)}},
}})
const mocks={
  '@/platform/database/prisma':{db},
  '@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
  'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:started.toISOString()}:null},
  '@/extensions/server/modules':{isModuleEnabled:async()=>true,requireModule:async()=>{},moduleGuard:async()=>null,getModuleStates:async()=>({journal:true}),getModuleSettings:async()=>({})},
  '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true}),rateLimitHit:async()=>({ok:true})},
  '@/modules/seo/server/indexnow':{publicPathFor:()=>null,queueIndexNow:async()=>{}},
  react:{...require('react'),cache:fn=>fn},
}
const loader=require('./connected-source-loader.cjs'),inbox=loader(mocks)('src/modules/notifications/server/inbox.ts')
const load=loader({...mocks,'@/modules/notifications/server/inbox':{createInboxEvent:async event=>{noticeCalls++;if(inboxFault==='before')throw Error('owned Inbox unavailable');const result=await inbox.createInboxEvent(event);if(inboxFault==='after')throw Error('owned interrupted completion');return result}}})
const cms=load('src/modules/site/server/http/admin/cms/route.ts'),review=load('src/modules/journal/server/review.ts'),queue=load('src/modules/operations/server/queue.ts'),delivery=load('src/modules/journal/server/review-notifications.ts')
const req=body=>new NextRequest('http://site.invalid/api/admin/cms?type=posts',{method:'PATCH',headers:{host:'site.invalid',origin:'http://site.invalid','content-type':'application/json'},body:JSON.stringify(body)})
async function call(method,body){const r=await cms[method](req(body));return{status:r.status,body:await r.json()}}
async function post(status='PENDING'){const p=await raw.post.create({data:{slug:stamp+'-'+postIds.length,title:'عنوان بررسی‌شده',content:'<p>متن</p>',status,authorId:author.id}});postIds.push(p.id);return p}
const state=id=>raw.post.findUniqueOrThrow({where:{id},include:{editProposal:true,categories:true}})
const jobs=id=>raw.backgroundJob.findMany({where:{kind:'journal.editorial-decision'},orderBy:{id:'asc'}}).then(rows=>rows.filter(row=>JSON.parse(row.payload).postId===id))
async function run(job){selectedJobs=[job.id];await queue.runQueue(2500);selectedJobs=[];return raw.backgroundJob.findUniqueOrThrow({where:{id:job.id}})}
async function counts(id){return Promise.all([raw.contentRevision.count({where:{entityType:'posts',entityId:id}}),raw.auditLog.count({where:{targetType:'posts',targetId:String(id)}}),jobs(id).then(rows=>rows.length)])}
async function main(){
  original=await raw.setting.findUnique({where:{key:'journal.home.v1'}});settingsRead=true
  await raw.setting.upsert({where:{key:'journal.home.v1'},create:{key:'journal.home.v1',value:'{"reviewAuthorPosts":true}'},update:{value:'{"reviewAuthorPosts":true}'}})
  role=await raw.role.create({data:{name:stamp,permissions:'dashboard.view,journal.author'}})
  manager=await raw.user.create({data:{email:stamp+'-manager@example.invalid',passwordHash:'owned fixture',role:'ADMIN'}});userIds.push(manager.id)
  author=await raw.user.create({data:{email:stamp+'-author@example.invalid',passwordHash:'owned fixture',role:'ADMIN',roleId:role.id}});userIds.push(author.id)
  const approve=id=>review.decidePostReview({req:req({}),actor:manager,id,decision:'approve'})

  // Exact reported race, including a nested category write: manager wins before the author's transactional claim.
  let p=await post(),r;viewer=author
  const cat=await raw.postCategory.create({data:{slug:stamp,name:'آزمایش'}})
  afterOne=async row=>{assert.equal(row.id,p.id);await approve(p.id)}
  r=await call('PATCH',{id:p.id,title:'تغییر بدون بازبینی',categoryIds:[String(cat.id)]})
  assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(afterOne,null)
  let stored=await state(p.id);assert.deepEqual([stored.status,stored.title,stored.categories.length,stored.editProposal],['PUBLISHED','عنوان بررسی‌شده',0,null])
  // A fresh retry takes the legitimate proposal path, retaining the live version.
  r=await call('PATCH',{id:p.id,title:'پیشنهاد تازه'});assert.equal(r.status,200);assert.equal(r.body.proposed,true);assert.equal((await state(p.id)).title,'عنوان بررسی‌شده')

  // Same status, newer content or a different owner: a stale save must not overwrite either.
  for(const ownerChange of [false,true]){p=await post();afterOne=async row=>{await raw.post.update({where:{id:row.id},data:{title:'نسخهٔ تازه',updatedAt:new Date(row.updatedAt.getTime()+1000),...(ownerChange?{authorId:manager.id}:{})}})};r=await call('PATCH',{id:p.id,title:'نسخهٔ قدیمی'});assert.equal(r.status,409);assert.equal((await state(p.id)).title,'نسخهٔ تازه')}
  // Bulk preserves partial results and never takes an article off the site after the manager approves it.
  const bulk=await post(),unchanged=await post('DRAFT');afterMany=async()=>approve(bulk.id)
  r=await call('BULK',{ids:[bulk.id,unchanged.id],action:'draft'});assert.equal(r.body.changed,1);assert.deepEqual(r.body.failed.map(x=>x.id),[bulk.id]);assert.equal((await state(bulk.id)).status,'PUBLISHED');assert.equal((await state(unchanged.id)).status,'DRAFT')

  // Explicit approval commits while Inbox is unavailable; the actual scheduler retries it with its same lease/id.
  viewer=manager;p=await post();const callsBefore=noticeCalls;inboxFault='before'
  r=await call('PATCH',{id:p.id,review:'approve'});assert.equal(r.status,200);assert.equal(noticeCalls,callsBefore)
  let job=(await jobs(p.id))[0];assert.equal(job.status,'QUEUED')
  job=await run(job);assert.equal(job.status,'QUEUED');assert.equal(job.attempts,1);assert.ok(job.runAt.getTime()>Date.now()+60000)
  const event=JSON.parse(job.payload),dedupeKey='journal-editorial:'+event.eventId
  assert.equal(await raw.userNotification.count({where:{dedupeKey}}),0)
  inboxFault='';await raw.backgroundJob.update({where:{id:job.id},data:{runAt:new Date(0)}});job=await run(job)
  assert.equal(job.status,'DONE');assert.equal(job.attempts,2);assert.equal(await raw.userNotification.count({where:{dedupeKey}}),1)

  // Interruption after Inbox commits: replay creates neither another Inbox event nor duplicate channel intents.
  p=await post();r=await call('PATCH',{id:p.id,review:'return',note:'منبع را اضافه کنید'});assert.equal(r.status,200)
  job=(await jobs(p.id))[0];inboxFault='after';job=await run(job);assert.equal(job.status,'QUEUED')
  const key='journal-editorial:'+JSON.parse(job.payload).eventId,notice=await raw.userNotification.findUniqueOrThrow({where:{dedupeKey:key}})
  assert.match(notice.bodyFa,/منبع را اضافه کنید/)
  assert.equal(await raw.backgroundJob.count({where:{dedupeKey:{startsWith:`notification:${notice.id}:`}}}),3)
  inboxFault='';await raw.backgroundJob.update({where:{id:job.id},data:{runAt:new Date(0)}});assert.equal((await run(job)).status,'DONE')
  assert.equal(await raw.userNotification.count({where:{dedupeKey:key}}),1);assert.equal(await raw.backgroundJob.count({where:{dedupeKey:{startsWith:`notification:${notice.id}:`}}}),3)

  // Normal form and bulk decisions use the same transactional outbox.
  const form=await post(),batch=await post();r=await call('PATCH',{id:form.id,status:'PUBLISHED'});assert.equal(r.status,200);assert.equal((await jobs(form.id)).length,1)
  r=await call('BULK',{ids:[batch.id],action:'publish'});assert.equal(r.body.changed,1);assert.equal((await jobs(batch.id)).length,1)
  // A failed intent rolls back state, revisions and strict decision audit in every entry point.
  for(const method of ['explicit','form','bulk']){p=await post();const before=await counts(p.id);intentFault=true
    const command=()=>method==='bulk'?call('BULK',{ids:[p.id],action:'publish'}):call('PATCH',{id:p.id,...(method==='form'?{status:'PUBLISHED'}:{review:'approve'})})
    if(method==='form')assert.equal((await command()).status,400);else await assert.rejects(command,/owned intent failure/)
    intentFault=false;assert.equal((await state(p.id)).status,'PENDING');assert.deepEqual(await counts(p.id),before)
  }
  p=await post();const beforeAudit=await counts(p.id);auditFault=true;await assert.rejects(()=>call('PATCH',{id:p.id,review:'approve'}));auditFault=false;assert.equal((await state(p.id)).status,'PENDING');assert.deepEqual(await counts(p.id),beforeAudit)

  // Proposal apply/reject share the same outbox and rollback the deletion when queue/audit fails.
  p=await post('PUBLISHED');viewer=author;assert.equal((await call('PATCH',{id:p.id,title:'عنوان پیشنهادی'})).body.proposed,true)
  viewer=manager;intentFault=true;r=await call('PATCH',{id:p.id,proposalDecision:'apply'});intentFault=false;assert.equal(r.status,400);assert.ok((await state(p.id)).editProposal);assert.equal((await state(p.id)).title,'عنوان بررسی‌شده')
  r=await call('PATCH',{id:p.id,proposalDecision:'apply'});assert.equal(r.status,200);job=(await jobs(p.id))[0];assert.equal(JSON.parse(job.payload).proposal,true);assert.equal((await run(job)).status,'DONE')
  viewer=author;await call('PATCH',{id:p.id,title:'تغییر بعدی'});viewer=manager;auditFault=true;r=await call('PATCH',{id:p.id,proposalDecision:'reject'});auditFault=false;assert.equal(r.status,400);assert.ok((await state(p.id)).editProposal)
  r=await call('PATCH',{id:p.id,proposalDecision:'reject',note:'عنوان فعلی بماند'});assert.equal(r.status,200);job=(await jobs(p.id))[1];assert.equal((await run(job)).status,'DONE');assert.equal((await state(p.id)).editProposal,null)

  for(const patch of [{authorId:-1},{decision:['approve']},{eventId:'bad'},{note:'x'.repeat(1001)}])await assert.rejects(()=>delivery.deliverReviewDecision({...event,...patch}),/Invalid editorial/)
  // The changed per-row claims must still handle the existing maximum request, including one intent per decision.
  await raw.post.createMany({data:Array.from({length:100},(_,i)=>({slug:stamp+'-bounded-'+i,title:'بازبینی گروهی',content:'<p>متن</p>',status:'PENDING',authorId:author.id}))})
  const bounded=(await raw.post.findMany({where:{slug:{startsWith:stamp+'-bounded-'}},select:{id:true}})).map(x=>x.id);postIds.push(...bounded)
  const bulkStarted=Date.now();r=await call('BULK',{ids:bounded,action:'publish'});assert.equal(r.status,200);assert.equal(r.body.changed,100);assert.deepEqual(r.body.failed,[])
  const boundedSet=new Set(bounded),intents=(await raw.backgroundJob.findMany({where:{kind:'journal.editorial-decision'},select:{payload:true}})).filter(x=>boundedSet.has(JSON.parse(x.payload).postId))
  assert.equal(intents.length,100);console.log('Bounded 100-article approval/claims/history/audit/intents completed in '+(Date.now()-bulkStarted)+'ms (local only).')
  console.log('Journal reliability passed: single/bulk/version/owner interleavings refused; fresh proposal retry; actual Operations backoff and DONE; interrupted Inbox/channel dedupe; form/bulk/proposal transactional intents; queue/audit rollback; invalid payload refusal.')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{try{
  const noticeIds=(await raw.userNotification.findMany({where:{userId:{in:userIds}},select:{id:true}})).map(x=>x.id)
  const owned=(await raw.backgroundJob.findMany({where:{kind:'journal.editorial-decision'},select:{id:true,payload:true}})).filter(x=>postIds.includes(JSON.parse(x.payload).postId)).map(x=>x.id)
  await raw.backgroundJob.deleteMany({where:{OR:[{id:{in:owned}},...noticeIds.map(id=>({dedupeKey:{startsWith:`notification:${id}:`}}))]}})
  await raw.contentRevision.deleteMany({where:{entityType:'posts',entityId:{in:postIds}}});await raw.auditLog.deleteMany({where:{actorUserId:{in:userIds}}})
  await raw.post.deleteMany({where:{id:{in:postIds}}});await raw.postCategory.deleteMany({where:{slug:stamp}});await raw.userNotification.deleteMany({where:{userId:{in:userIds}}});await raw.user.deleteMany({where:{id:{in:userIds}}});if(role)await raw.role.delete({where:{id:role.id}})
  if(settingsRead){if(original)await raw.setting.upsert({where:{key:original.key},create:original,update:{value:original.value}});else await raw.setting.deleteMany({where:{key:'journal.home.v1'}})}
}finally{await raw.$disconnect()}})
