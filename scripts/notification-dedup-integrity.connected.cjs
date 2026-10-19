// Canonical inbox owner on a real owned PostgreSQL/SQLite fixture; no external sends.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript-api');
const clientModule=process.env.MOBOCOM_TEST_CLIENT||'@prisma/client';
const {PrismaClient,Prisma}=require(clientModule),errors=[];
const prisma=new PrismaClient({log:[{emit:'event',level:'error'}]});prisma.$on('error',e=>errors.push(e));
const seed=`inbox-${Date.now()}-${require('crypto').randomUUID()}`,users=[],noticeIds=[];
let failQueue=false,collisionKey='',collisionReads=0,releaseCollision;
const collisionBarrier=new Promise(resolve=>{releaseCollision=resolve;});
const db=new Proxy(prisma,{get(target,key){
 if(key==='userNotification')return new Proxy(target.userNotification,{get(model,method){
  if(method==='findUnique')return async args=>{
   const row=await model.findUnique(args);
   if(args.where.dedupeKey===collisionKey){if(++collisionReads===2)releaseCollision();await collisionBarrier;}
   return row;
  };
  return typeof model[method]==='function'?model[method].bind(model):model[method];
 }});
 if(key==='$executeRaw')return sql=>{
  if(failQueue&&sql.strings?.join('').includes('BackgroundJob'))return target.$executeRaw(Prisma.sql`INSERT INTO "BackgroundJob" ("kind") VALUES (NULL)`);
  return target.$executeRaw(sql);
 };
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
function owner(){
 const compiled=ts.transpileModule(fs.readFileSync('src/modules/notifications/server/inbox.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='@/platform/database/prisma'?{db}:name==='@prisma/client'?require(clientModule):name.startsWith('@/')?(()=>{throw Error('Unexpected outside service: '+name)})():require(name),mod,mod.exports);
 return mod.exports;
}
const jobsWhere=id=>({dedupeKey:{in:['sms','email','push'].map(channel=>`notification:${id}:${channel}`)}});
async function main(){
 if(process.env.DATABASE_URL?.startsWith('file:')){await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');}
 for(let i=0;i<2;i++){const user=await prisma.user.create({data:{email:`${seed}-${i}@example.invalid`,passwordHash:'fixture-only'}});users.push(user.id);}
 const {createInboxEvent}=owner(),event={userId:users[0],kind:'TEST',dedupeKey:seed,titleEn:'fixture',titleFa:'آزمون',href:'/dashboard/notifications'};
 const created=await Promise.all(Array.from({length:24},()=>createInboxEvent(event)));
 const id=created[0].id;noticeIds.push(id);
 assert.ok(created.every(row=>row.id===id));
 assert.equal(await prisma.userNotification.count({where:{dedupeKey:seed}}),1);
 const jobs=await prisma.backgroundJob.findMany({where:jobsWhere(id),orderBy:{dedupeKey:'asc'}});
 assert.equal(jobs.length,3);
 assert.deepEqual(jobs.map(job=>JSON.parse(job.payload)),['email','push','sms'].map(channel=>({notificationId:id,channel})));
 assert.ok(jobs.every(job=>job.kind==='notification.deliver'&&job.status==='QUEUED'&&job.attempts===0));
 assert.equal(errors.length,0,'ordinary concurrent deduplication must not emit native database errors');
 await prisma.userNotification.update({where:{id},data:{readAt:new Date('2026-10-01T00:00:00Z')}});
 await prisma.backgroundJob.updateMany({where:jobsWhere(id),data:{status:'DONE',attempts:2,result:'fixture-delivered',finishedAt:new Date()}});
 const before=await prisma.userNotification.findUniqueOrThrow({where:{id}}),beforeJobs=await prisma.backgroundJob.findMany({where:jobsWhere(id),orderBy:{id:'asc'}});
 assert.deepEqual(await createInboxEvent({...event,titleEn:'replacement',titleFa:'replacement',href:'/music'}),before,'replay preserves stored payload and read history');
 assert.deepEqual(await prisma.backgroundJob.findMany({where:jobsWhere(id),orderBy:{id:'asc'}}),beforeJobs,'replay never resets completed delivery jobs');
 await prisma.backgroundJob.deleteMany({where:jobsWhere(id)});
 await createInboxEvent(event);assert.equal(await prisma.backgroundJob.count({where:jobsWhere(id)}),0,'a historical replay does not recreate removed jobs');
 await assert.rejects(createInboxEvent({...event,userId:users[1]}),/dedupe key collision/);
 assert.deepEqual(await prisma.userNotification.findUniqueOrThrow({where:{id}}),before);
 assert.equal(await prisma.backgroundJob.count({where:jobsWhere(id)}),0);
 // Hold both real pre-reads until they finish, exercising the collision inside
 // the batch rather than relying only on the already-existing-row fast path.
 collisionKey=seed+'-cross-owner';
 const competing=await Promise.allSettled(users.map(userId=>createInboxEvent({...event,userId,dedupeKey:collisionKey})));
 assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(competing.filter(result=>result.status==='rejected').length,1);
 const failed=competing.find(result=>result.status==='rejected');assert.match(failed.reason.message,/dedupe key collision/);
 const winner=await prisma.userNotification.findUniqueOrThrow({where:{dedupeKey:collisionKey}});noticeIds.push(winner.id);
 const won=competing.find(result=>result.status==='fulfilled');assert.equal(won.value.userId,winner.userId);
 assert.equal(await prisma.backgroundJob.count({where:jobsWhere(winner.id)}),3);
 assert.equal(errors.length,0,'cross-owner conflict is refused without native constraint errors');
 collisionKey='';
 for(const href of ['//evil.invalid','https://evil.invalid','/dashboard<bad>'])await assert.rejects(createInboxEvent({...event,dedupeKey:seed+'-invalid',href}),/invalid inbox event/);
 assert.equal(await prisma.userNotification.count({where:{dedupeKey:seed+'-invalid'}}),0);
 const retry={...event,dedupeKey:seed+'-rollback'};failQueue=true;
 await assert.rejects(createInboxEvent(retry));failQueue=false;
 assert.equal(await prisma.userNotification.count({where:{dedupeKey:retry.dedupeKey}}),0,'queue failure rolls back the inbox row');
 const recovered=await createInboxEvent(retry);noticeIds.push(recovered.id);
 assert.equal(await prisma.backgroundJob.count({where:jobsWhere(recovered.id)}),3,'retry creates exactly one job per channel');
 console.log('Inbox integrity: actual concurrent deduplication/no duplicate errors, atomic three-channel queue, immutable replay/read history/completed jobs, no historical requeue, owner collision, invalid URL and rollback/retry passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{
  const all=await prisma.userNotification.findMany({where:{userId:{in:users}},select:{id:true}});
  const ids=[...new Set([...noticeIds,...all.map(row=>row.id)])];
  await prisma.backgroundJob.deleteMany({where:{dedupeKey:{in:ids.flatMap(id=>['sms','email','push'].map(channel=>`notification:${id}:${channel}`))}}});
  await prisma.userNotification.deleteMany({where:{userId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users},email:{startsWith:seed}}});
 }finally{await prisma.$disconnect();}
});
