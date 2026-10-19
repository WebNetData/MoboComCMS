/* Actual canonical command/read policies and existing Admin route against PostgreSQL. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api');
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server');
if(process.argv.includes('--single-connection')){const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('pool_timeout','2');process.env.DATABASE_URL=url.toString()}
const db=new PrismaClient(),seed=`restrictions-${Date.now()}`;let actor,enabled=true;
const actors=[],roles=[],targets=[];
const mocks={
 '@/platform/database/prisma':{db},
 '@/modules/identity/server/access':{requirePerm:async(_req,key)=>actor?.role==='ADMIN'&&(actor.roleId==null||actor.permissions?.includes(key))?actor:null},
 '@/extensions/server/modules':{moduleGuard:async()=>enabled?null:new Response('{}',{status:404}),isModuleEnabled:async()=>enabled},
 '@/modules/forum/server/community':{refreshStats:async()=>{}},
 '@/modules/forum/server/actions':{},'@/modules/forum/server/people':{},'@/modules/forum/server/team':{},'@/modules/forum/server/forum':{},
};
const cache=new Map();
function load(file){
 const full=path.resolve(file.endsWith('.ts')?file:fs.existsSync(file+'.ts')?file+'.ts':path.join(file,'index.ts'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(name.startsWith('@/')?'src/'+name.slice(2):path.resolve(path.dirname(full),name),'utf8'));
  if(name.startsWith('@/'))return load('src/'+name.slice(2));if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name));return require(name);
 },mod,mod.exports);return mod.exports;
}
const route=load('src/modules/forum/server/http/admin.ts'),service=load('src/modules/forum/server/restrictions.ts');
const policy=load('src/modules/forum/domain/community.ts'),messaging=load('src/modules/forum/domain/discourse.ts');
const request=body=>new NextRequest('http://localhost:3000/api/admin/forum',{method:'PATCH',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});
const patch=(userId,data)=>route.PATCH(request({section:'restrictions',userId,...data}));
const issue=async(userId,days=2,extra={})=>{const response=await patch(userId,{action:'issue',effectKey:'forum.silence',days,reason:'دلیل آزمایشی',...extra});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return response.json()};
const state=id=>service.forumRestrictionState(id);
const context=()=>({actor,req:request({})});
async function createTarget(name,data={}){
 const user=await db.user.create({data:{email:`${seed}-${name}@example.invalid`,passwordHash:'test-only',...data}});targets.push(user);
 await db.forumProfile.create({data:{userId:user.id,username:`${seed}-${name}`}});return user;
}
async function refused(who,target,body,status=403){
 actor=who;const before=await db.forumProfile.findUniqueOrThrow({where:{userId:target.id}});
 const count=await db.accessRestriction.count({where:{userId:target.id}}),audits=await db.auditLog.count({where:{actorUserId:who.id}});
 assert.equal((await patch(target.id,body)).status,status);
 assert.deepEqual(await db.forumProfile.findUniqueOrThrow({where:{userId:target.id}}),before);
 assert.equal(await db.accessRestriction.count({where:{userId:target.id}}),count);
 assert.equal(await db.auditLog.count({where:{actorUserId:who.id}}),audits,'refusal has no successful audit');
}
async function main(){
 for(const [name,permissions]of[['forum',['forum.moderate']],['roles',['forum.moderate','roles.manage']],['magazine',['cms.posts']]]){
  const role=await db.role.create({data:{name:`${seed}-${name}`,permissions:permissions.join(',')}});roles.push(role);
  const user=await db.user.create({data:{email:`${seed}-actor-${name}@example.invalid`,passwordHash:'test-only',role:'ADMIN',roleId:role.id}});actors.push({...user,permissions});
 }
 const full=await db.user.create({data:{email:`${seed}-actor-full@example.invalid`,passwordHash:'test-only',role:'ADMIN'}});actors.push({...full,permissions:null});
 const customer=await createTarget('customer'),staff=await createTarget('staff',{role:'ADMIN',roleId:roles[0].id}),owner=await createTarget('owner',{role:'ADMIN'});
 const body={action:'issue',effectKey:'forum.silence',days:2,reason:'آزمایش'};
 await refused(actors[0],staff,body);await refused(actors[0],owner,body);await refused(actors[1],owner,body);await refused(actors[2],customer,body);
 actor=actors[0];
 const auditService=load('src/platform/audit/server.ts'),strictAudit=auditService.auditAdminStrict;
 const beforeFault=await db.forumProfile.findUniqueOrThrow({where:{userId:customer.id}});
 auditService.auditAdminStrict=async()=>{throw new Error('intentional audit outage')};
 try{
  assert.equal((await patch(customer.id,body)).status,503);
  assert.equal(await db.accessRestriction.count({where:{userId:customer.id}}),0,'strict audit failure rolls back issued row');
  assert.deepEqual(await db.forumProfile.findUniqueOrThrow({where:{userId:customer.id}}),beforeFault,'strict audit failure rolls back legacy projection');
 }finally{auditService.auditAdminStrict=strictAudit}
 let a=await issue(customer.id,2),b=await issue(customer.id,5);
 assert(a.id&&b.id&&a.id!==b.id);assert(a.issuanceAuditId&&b.issuanceAuditId);
 assert((await state(customer.id)).silenced);assert((await state(customer.id)).participationDenied);
 let projection=await db.forumProfile.findUniqueOrThrow({where:{userId:customer.id}});assert.equal(projection.silencedUntil.toISOString(),b.expiresAt);
 const revoke=id=>patch(customer.id,{action:'revoke',id,reason:'لغو آزمایشی'});
 assert.equal((await revoke(b.id)).status,200);assert((await state(customer.id)).silenced,'other overlapping row remains active');
 projection=await db.forumProfile.findUniqueOrThrow({where:{userId:customer.id}});assert.equal(projection.silencedUntil.toISOString(),a.expiresAt);
 const auditCount=await db.auditLog.count({where:{actorUserId:actor.id}});
 assert.equal((await revoke(b.id)).status,409);assert.equal(await db.auditLog.count({where:{actorUserId:actor.id}}),auditCount);
 const row=await db.accessRestriction.findUniqueOrThrow({where:{id:b.id}});assert.equal(row.revokedByUserId,actor.id);assert(row.revocationAuditId);assert.equal(row.issuanceAuditId,b.issuanceAuditId);
 await refused(actors[0],staff,{action:'revoke',id:a.id,reason:'نباید تغییر کند'});
 actor=actors[0];
 const future=await issue(customer.id,1,{startsAt:new Date(Date.now()+86_400_000).toISOString(),effectKey:'forum.suspend'});
 assert.equal((await state(customer.id)).suspended,false,'future start does not deny early');
 assert.equal((await service.forumRestrictionState(customer.id,new Date(future.startsAt))).suspended,true);
 assert.equal((await service.forumRestrictionState(customer.id,new Date(future.expiresAt))).suspended,false,'expiry is exclusive without a worker');
 await db.accessRestriction.update({where:{id:a.id},data:{expiresAt:new Date(Date.now()-1),startsAt:new Date(Date.now()-60000)}});
 assert.equal((await state(customer.id)).silenced,false);
 for(const extra of [{scope:'GLOBAL'},{moduleKey:'music'},{capabilities:['identity.login']},{resourceId:'anything'},{days:0},{days:1.5},{days:3651},{startsAt:'not-a-date'},{effectKey:'forum.unknown'},{reason:''}])await refused(actors[0],customer,{...body,...extra},400);
 const outsider=await createTarget('outsider');actor=actors[0];assert.equal((await patch(outsider.id,{action:'revoke',id:future.id,reason:'غلط'})).status,404);
 const concurrent=await createTarget('concurrent');
 const [one,two]=await Promise.all([issue(concurrent.id,2),issue(concurrent.id,7)]);assert.notEqual(one.id,two.id);
 const responses=await Promise.all([patch(concurrent.id,{action:'revoke',id:two.id,reason:'اول'}),patch(concurrent.id,{action:'revoke',id:two.id,reason:'دوم'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert((await state(concurrent.id)).silenced);
 const legacy=await createTarget('legacy');
 const until=new Date(Date.now()+60000);await db.forumProfile.update({where:{userId:legacy.id},data:{silencedUntil:until,moderationNote:'دلیل قدیمی'}});
 assert((await state(legacy.id)).silenced);assert.equal((await state(legacy.id)).participationDenied,false,'legacy staff exemption remains');
 const imported=await db.accessRestriction.findFirstOrThrow({where:{userId:legacy.id}});assert.equal(imported.source,'LEGACY');assert.equal(imported.issuedByUserId,null);assert.equal(imported.reason,'دلیل قدیمی');
 await state(legacy.id);assert.equal(await db.accessRestriction.count({where:{userId:legacy.id}}),1,'lazy import idempotent');
 await issue(legacy.id,3);
 await db.forumProfile.update({where:{userId:legacy.id},data:{silencedUntil:null}});assert.equal((await state(legacy.id)).silenced,false,'old writer clear deliberately clears that same effect');
 assert.equal(await db.accessRestriction.count({where:{userId:legacy.id}}),2,'old writer preserves history');
 const oldRequest=request({section:'users',userId:legacy.id,silenceDays:2,suspendDays:3,moderationNote:'سازگاری'});assert.equal((await route.PATCH(oldRequest)).status,200);
 assert.equal((await state(legacy.id)).participationDenied,false,'legacy API source keeps inspected exemptions');
 assert.equal((await route.PATCH(request({section:'users',userId:legacy.id,silenceDays:0}))).status,200);assert.equal((await state(legacy.id)).silenced,false);assert((await state(legacy.id)).suspended,'clear of silence preserves suspension');
 const longNote=await createTarget('long-note'),oldNote='یادداشت تاریخی طولانی '.repeat(50);
 await db.forumProfile.update({where:{userId:longNote.id},data:{moderationNote:oldNote}});
 assert.equal((await route.PATCH(request({section:'users',userId:longNote.id,silenceDays:2}))).status,200,'long stored note does not break the old date-only command');
 assert.equal((await db.forumProfile.findUniqueOrThrow({where:{userId:longNote.id}})).moderationNote,oldNote,'new command preserves every historical note character');
 const longNoteRow=await db.accessRestriction.findFirstOrThrow({where:{userId:longNote.id}});assert(longNoteRow.reason.length<=500);assert.match(longNoteRow.reason,/یادداشت کامل/);
 actor=actors[2];const historyReq=new NextRequest(`http://localhost:3000/api/admin/forum?section=restrictions&userId=${legacy.id}`);assert.equal((await route.GET(historyReq)).status,403);
 await assert.rejects(service.forumRestrictionHistory(context(),legacy.id),e=>e.status===403);
 actor=actors[0];const history=await route.GET(historyReq);assert.equal(history.status,200);assert((await history.json()).rows.length>=4);
 assert.equal((await route.GET(new NextRequest(historyReq.url+'&before=invalid'))).status,400);
 const paged=await createTarget('paged');
 await db.accessRestriction.createMany({data:Array.from({length:53},(_,i)=>({userId:paged.id,scope:'MODULE',moduleKey:'forum',effectKey:'forum.silence',capabilities:'["forum.participate"]',reason:`old-${i}`,startsAt:new Date('2000-01-01'),expiresAt:new Date('2001-01-01'),source:'LEGACY'}))});
 const firstPage=await service.forumRestrictionHistory(context(),paged.id);assert.equal(firstPage.rows.length,50);assert(firstPage.next);
 const nextPage=await service.forumRestrictionHistory(context(),paged.id,firstPage.next);assert.equal(nextPage.rows.length,3);assert.equal(nextPage.next,null);
 assert.equal(new Set([...firstPage.rows,...nextPage.rows].map(row=>row.id)).size,53,'keyset pages retain every history row once');
 assert.equal('sourceMetadata' in firstPage.rows[0],false,'private storage metadata stays outside the UI contract');
 actor=actors[1];await issue(staff.id);actor=actors[3];await issue(owner.id);
 const viewer={userId:staff.id,groupIds:[],trustLevel:4,moderator:true,member:true,...await state(staff.id)};
 assert.deepEqual(policy.categoryAccess({access:'PUBLIC',locked:false},viewer),{see:true,reply:false,create:false});
 assert.equal(policy.canEditPost({userId:staff.id,createdAt:new Date()},viewer,24),false);assert.equal(messaging.canStartMessage(viewer,{messagesEnabled:true,messagesMinTrust:0}),false);
 assert.equal((await db.user.findUniqueOrThrow({where:{id:customer.id}})).status,'ACTIVE','forum restriction leaves global login standing active');
 const domain=load('src/modules/identity/domain/restrictions.ts');assert.equal(domain.deniedCapabilities([{id:one.id,effectKey:'forum.silence',source:'ADMIN',capabilities:'["forum.participate"]',startsAt:new Date(0),expiresAt:null,revokedAt:null}]).has('music.play'),false);
 enabled=false;await refused(actors[3],customer,body,404);actor=actors[3];await assert.rejects(service.changeForumRestrictions(context(),{userId:customer.id,operation:'issue',effectKey:'forum.silence',days:1,reason:'آزمایش'}),e=>e.status===404);enabled=true;
 console.log('Scoped forum restrictions: real PG records/handlers/staff hierarchy; overlap, single revoke, future/expiry, concurrency, strict audit, old reader/writer, scope/section/module refusal and participation policies passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{const ids=[...actors,...targets].map(x=>x.id);await db.auditLog.deleteMany({where:{actorUserId:{in:actors.map(x=>x.id)}}});await db.user.deleteMany({where:{id:{in:ids},email:{startsWith:seed}}});await db.role.deleteMany({where:{id:{in:roles.map(x=>x.id)},name:{startsWith:seed}}})}finally{await db.$disconnect()}
});
