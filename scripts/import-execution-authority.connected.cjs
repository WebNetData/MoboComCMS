// Real PostgreSQL job/content/history and canonical Identity. File/adapter/queue/audit boundaries are explicit fixture doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api');
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient();
const stamp=`import-authority-${Date.now()}`,users=[],roles=[],jobs=[],audits=[],queued=[];
let unavailable=false,planHook=null,applyHook=null,prepared=0,applied=0,rolledBack=0,policyBefore;
const actorIds=[];
const db=new Proxy(prisma,{get(target,key){
 if(key==='accessRestriction')return new Proxy(target[key],{get(model,method){if(method==='findMany')return args=>{if(unavailable)throw Error('owned authority unavailable');return model.findMany(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
const adapter={id:'owned-authority',label:'owned',entity:'film',module:null,fields:[{key:'title',label:'title',type:'text',requiredOnCreate:true}],supports:{},identity:['title'],options:[],normalizeOptions:()=>({}),
 prepare:async()=>{prepared++},
 plan:async(item)=>{if(planHook){const hook=planHook;planHook=null;await hook()}return {action:'CREATE',title:String(item.values.title),sourceKey:String(item.index),messages:[],counters:{},preview:{title:String(item.values.title),action:'CREATE',lines:[],messages:[]}}},
 apply:async(item,plan,ctx)=>{applied++;actorIds.push(ctx.actor.id);const row=await prisma.cinemaTitle.create({data:{slug:`${stamp}-${ctx.jobId}-${item.index}`,title:plan.title,kind:'MOVIE'}});if(applyHook){const hook=applyHook;applyHook=null;await hook()}return {action:'CREATE',entityType:'cinemaTitle',entityId:row.id,changes:[{kind:'created',entity:'cinemaTitle',id:row.id,stamp:row.updatedAt.toISOString()}],messages:[],counters:{}}},
 rollback:async(changes)=>{rolledBack++;for(const change of changes){const result=await prisma.cinemaTitle.deleteMany({where:{id:change.id,slug:{startsWith:stamp},updatedAt:new Date(change.stamp)}});assert.equal(result.count,1)}return {undone:changes.length,conflicts:[]}},
};
const cache=new Map();
function load(relative){
 const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(name==='@/platform/database/prisma')return {db};
  if(name==='@/platform/config/env')return {authSecret:()=> 'owned-import-authority-fixture'};
  if(name==='@/platform/observability/logger')return {logEvent:()=>{}};
  if(name==='@/platform/audit/server')return {auditSystem:async event=>audits.push(event)};
  if(name==='@/extensions/server/modules')return {isModuleEnabled:async()=>true};
  if(name==='@/modules/imports/server/adapters')return {};
  if(name==='@/modules/imports/server/files')return {loadParsed:async()=>({rows:[{title:'owned one'},{title:'owned two'}]})};
  if(name==='@/modules/imports/server/media')return {knownSources:async()=>new Set(),importImage:()=>{throw Error('Unexpected external image')}};
  if(name==='@/modules/operations/server/queue')return {enqueue:async(kind,payload)=>queued.push({kind,payload}),runQueue:async()=>{}};
  if(name.startsWith('@/')){const candidate='src/'+name.slice(2);if(candidate.endsWith('.json'))return JSON.parse(fs.readFileSync(candidate,'utf8'));return load(fs.existsSync(candidate+'.ts')?candidate+'.ts':candidate+'/index.ts')}
  return require(name);
 },mod,mod.exports);return mod.exports;
}
const registry=load('src/modules/imports/server/registry.ts');registry.registerImporter(adapter);
const engine=load('src/modules/imports/server/execution.ts'),commands=load('src/modules/imports/server/commands.ts'),access=load('src/modules/identity/server/access.ts'),authority=load('src/modules/imports/server/authority.ts');
const row=job=>prisma.importJob.findUniqueOrThrow({where:{id:job.id}});
async function createJob(creator,operator=creator,extra={}){
 const job=await prisma.importJob.create({data:{adapter:adapter.id,fileName:`${stamp}.json`,createdById:creator.id,createdByEmail:creator.email,status:'QUEUED',settings:JSON.stringify({mapping:{title:'title'}}),...(operator?{executionActorId:operator.id,executionAuthorizedAt:new Date()}:{}),...extra}});jobs.push(job);return job;
}
async function restriction(user,extra={}){return prisma.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp,...extra}})}
async function clear(user){await prisma.accessRestriction.deleteMany({where:{userId:user.id,reason:stamp}})}
async function denied(user,label){
 const job=await createJob(user),before=applied,prepareBefore=prepared;
 assert.deepEqual(await engine.runSlice(job.id),{done:false,next:false},label);
 const paused=await row(job);assert.equal(paused.status,'PAUSED',label);assert.equal(paused.cursor,0);assert.equal(paused.executionMode,'RUN');assert.equal(paused.lockedUntil,null);
 assert.equal(applied,before);assert.equal(prepared,prepareBefore);assert.equal(await prisma.importRecord.count({where:{jobId:job.id}}),0);return paused;
}
async function main(){
 for(const suffix of ['creator','operator'])users.push(await prisma.user.create({data:{email:`${stamp}-${suffix}@example.invalid`,passwordHash:'fixture-only',role:'ADMIN',totpEnabledAt:new Date()}}));
 const [creator,operator]=users;
 const legacy=await createJob(creator,null);assert.deepEqual(await engine.runSlice(legacy.id),{done:true,next:false});assert.equal((await row(legacy)).status,'DONE');assert.equal(actorIds.at(-1),creator.id);
 await restriction(creator);await denied(creator,'full access is not a GLOBAL exemption');
 const takeover=await createJob(creator,operator);await engine.runSlice(takeover.id);assert.equal((await row(takeover)).status,'DONE');assert.equal((await row(takeover)).createdById,creator.id);assert.equal(actorIds.at(-1),operator.id);assert.equal(audits.at(-1).actor.id,operator.id);assert.equal(audits.at(-1).metadata.createdById,creator.id);
 await clear(creator);
 await restriction(creator,{scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]'});const moduleJob=await createJob(creator);await engine.runSlice(moduleJob.id);assert.equal((await row(moduleJob)).status,'DONE');await clear(creator);
 await restriction(creator,{startsAt:new Date(Date.now()+60000)});const future=await createJob(creator);await engine.runSlice(future.id);assert.equal((await row(future)).status,'DONE');await clear(creator);
 await restriction(creator,{startsAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)});const expired=await createJob(creator);await engine.runSlice(expired.id);assert.equal((await row(expired)).status,'DONE');await clear(creator);
 const revoked=await restriction(creator);await prisma.accessRestriction.updateMany({where:{id:revoked.id,revokedAt:null},data:{revokedAt:new Date(),revocationReason:stamp,revokedByUserId:operator.id}});const released=await createJob(creator);await engine.runSlice(released.id);assert.equal((await row(released)).status,'DONE');await clear(creator);
 await prisma.user.update({where:{id:creator.id},data:{status:'BANNED'}});await denied(creator,'current standing');await prisma.user.update({where:{id:creator.id},data:{status:'ACTIVE',role:'CUSTOMER'}});await denied(creator,'current staff role');await prisma.user.update({where:{id:creator.id},data:{role:'ADMIN'}});
 const role=await prisma.role.create({data:{name:stamp,permissions:'settings.manage'}});roles.push(role);await prisma.user.update({where:{id:creator.id},data:{roleId:role.id}});await denied(creator,'current permission');await prisma.role.update({where:{id:role.id},data:{permissions:'imports.manage'}});const delegated=await createJob(creator);await engine.runSlice(delegated.id);assert.equal((await row(delegated)).status,'DONE');await prisma.user.update({where:{id:creator.id},data:{roleId:null}});
 const reset=await createJob(creator);await prisma.user.update({where:{id:creator.id},data:{passwordChangedAt:new Date(Date.now()+2000)}});assert.equal((await engine.runSlice(reset.id)).next,false);assert.equal((await row(reset)).status,'PAUSED');await prisma.user.update({where:{id:creator.id},data:{passwordChangedAt:null}});
 policyBefore=await prisma.setting.findUnique({where:{key:'security.policy.v1'}});await prisma.setting.upsert({where:{key:'security.policy.v1'},create:{key:'security.policy.v1',value:'{"requireAdmin2fa":true}'},update:{value:'{"requireAdmin2fa":true}'}});access.clearAdminPolicyCache();await prisma.user.update({where:{id:creator.id},data:{totpEnabledAt:null}});await denied(creator,'current 2FA policy');await prisma.user.update({where:{id:creator.id},data:{totpEnabledAt:new Date()}});
 const duringPlan=await createJob(creator);planHook=()=>restriction(creator);const beforePlan=applied;await engine.runSlice(duringPlan.id);assert.equal(applied,beforePlan);assert.equal((await row(duringPlan)).status,'PAUSED');assert.equal((await row(duringPlan)).cursor,0);await clear(creator);
 const partial=await createJob(creator);applyHook=()=>restriction(creator);await engine.runSlice(partial.id);const paused=await row(partial);assert.equal(paused.status,'PAUSED');assert.equal(paused.cursor,1);assert.equal(JSON.parse(paused.stats).processed,1);assert.equal(await prisma.importRecord.count({where:{jobId:partial.id}}),1);
 const resumed=await commands.setJobState(paused,'resume',operator);assert.equal(resumed.executionActorId,operator.id);await engine.runSlice(partial.id);assert.equal((await row(partial)).status,'DONE');assert.equal((await row(partial)).createdById,creator.id);assert.equal(await prisma.importRecord.count({where:{jobId:partial.id}}),2);assert.equal(actorIds.at(-1),operator.id);
 const repair=await commands.startRollback(await row(partial),operator);assert.equal(repair.executionMode,'ROLLBACK');await restriction(operator);const undoBefore=rolledBack;await engine.rollbackSlice(partial.id);assert.equal(rolledBack,undoBefore);const pausedRepair=await row(partial);assert.equal(pausedRepair.status,'PAUSED');assert.equal(pausedRepair.executionMode,'ROLLBACK');assert.equal(await prisma.importRecord.count({where:{jobId:partial.id,status:'OK'}}),2);
 await clear(creator);const resumedRepair=await commands.setJobState(pausedRepair,'resume',creator);assert.equal(resumedRepair.status,'ROLLING_BACK');assert.equal(queued.at(-1).kind,'imports.rollback');await engine.rollbackSlice(partial.id);assert.equal((await row(partial)).status,'ROLLED_BACK');assert.equal(await prisma.importRecord.count({where:{jobId:partial.id,status:'ROLLED_BACK'}}),2);assert.equal(audits.at(-1).actor.id,creator.id);await clear(operator);
 unavailable=true;await denied(creator,'authority storage failure');unavailable=false;
 const concurrency=await createJob(creator,creator,{status:'DONE'});const results=await Promise.allSettled([commands.startRollback(concurrency,creator),commands.startRollback(concurrency,operator)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 await assert.rejects(prisma.importJob.update({where:{id:concurrency.id},data:{executionActorId:null,executionAuthorizedAt:new Date()}}),/constraint|check/i);
 // Same actor and same clock millisecond must still be a different execution grant.
 const generation=await createJob(creator,creator,{status:'RUNNING'}),oldGrant=await row(generation);
 await prisma.importJob.updateMany({where:{id:generation.id,status:'RUNNING'},data:{status:'PAUSED'}});
 const nextGrant=await commands.setJobState(await row(generation),'resume',creator);assert.equal(nextGrant.executionGeneration,oldGrant.executionGeneration+1);
 await prisma.importJob.updateMany({where:{id:generation.id,status:'QUEUED'},data:{status:'RUNNING',executionAuthorizedAt:oldGrant.executionAuthorizedAt}});
 assert.equal(await authority.continuingImportActor(oldGrant,'RUNNING'),null,'old generation cannot continue even with the same timestamp');
 await authority.pauseForImportAuthority(oldGrant);assert.equal((await row(generation)).status,'RUNNING','old worker cannot pause a newer grant');
 await assert.rejects(prisma.importJob.update({where:{id:generation.id},data:{executionGeneration:-1}}),/constraint|check/i);
 const inFlight=await createJob(creator,creator,{status:'PAUSED',lockedUntil:new Date(Date.now()+60000)});
 await assert.rejects(commands.setJobState(inFlight,'resume',creator),error=>error.status===409);
 await assert.rejects(commands.startRollback(inFlight,creator),error=>error.status===409);
 assert.equal((await row(inFlight)).status,'PAUSED');assert.equal((await row(inFlight)).executionGeneration,0,'no new grant overlaps an acknowledged active record lease');
 const staleCommand=await createJob(creator,creator,{status:'RUNNING'}),oldCommand=await row(staleCommand);
 await prisma.importJob.updateMany({where:{id:staleCommand.id,status:'RUNNING'},data:{status:'PAUSED'}});
 await commands.setJobState(await row(staleCommand),'resume',creator);
 await prisma.importJob.updateMany({where:{id:staleCommand.id,status:'QUEUED'},data:{status:'RUNNING',updatedAt:oldCommand.updatedAt}});
 await assert.rejects(commands.setJobState(oldCommand,'pause',creator),error=>error.status===409,'stale commands cannot target a new generation after a status/clock cycle');
 console.log('Import execution authority: actual PostgreSQL jobs/content/history; legacy identity, GLOBAL/module/start/expiry/revoke, current standing/permission/password/2FA, mid-plan denial, partial progress/takeover, rollback direction/operator, unavailable authority, state concurrency and actor-pair constraint passed');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 try{
  if(policyBefore!==undefined){if(policyBefore)await prisma.setting.updateMany({where:{key:'security.policy.v1',value:'{"requireAdmin2fa":true}'},data:{value:policyBefore.value}});else await prisma.setting.deleteMany({where:{key:'security.policy.v1',value:'{"requireAdmin2fa":true}'}});access.clearAdminPolicyCache()}
  await prisma.importJob.deleteMany({where:{id:{in:jobs.map(j=>j.id)},fileName:`${stamp}.json`}});await prisma.cinemaTitle.deleteMany({where:{slug:{startsWith:stamp}}});await prisma.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)},reason:stamp}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});await prisma.role.deleteMany({where:{id:{in:roles.map(r=>r.id)},name:stamp}});
 }finally{await prisma.$disconnect()}
});
