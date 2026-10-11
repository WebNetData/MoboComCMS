const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt'),{chromium}=require('@playwright/test'),{fixtureTLS}=require('./e2e-fixture-tls.cjs');
const baseURL=process.env.E2E_BASE_URL;
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||baseURL!=='https://e2e.mobocom.test:3443'||!process.env.DATABASE_URL||!process.env.NEXTAUTH_SECRET)throw Error('OWNED_COMPILED_FIXTURE_REQUIRED');
const db=new PrismaClient(),stamp=`ia-${Date.now().toString(36)}`,users=[],contexts=[],roles=[],restrictionIds=[];
let browser,jobId,fileKey;
const settings={source:stamp,mapping:{externalId:'id',title:'title',content:'content'}};
async function restricted(user){const row=await db.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp}});restrictionIds.push(row.id);return row;}
async function request(client,body,status=200){const response=await client.post('/api/admin/imports',{headers:{Origin:baseURL},data:body});assert.equal(response.status(),status,'import '+body.op);return response.json();}
async function waitFor(status){const deadline=Date.now()+30000;for(;;){const row=await db.importJob.findUniqueOrThrow({where:{id:jobId}});if(row.status===status)return row;if(['FAILED','CANCELLED','DONE_WITH_ERRORS'].includes(row.status))throw Error('Unexpected import state '+row.status+': '+row.error);if(Date.now()>deadline)throw Error('Import did not reach '+status+'; last='+row.status);await new Promise(r=>setTimeout(r,100));}}
async function main(){
 const role=await db.role.create({data:{name:stamp,permissions:'dashboard.view,imports.manage'}});roles.push(role);
 for(const suffix of ['creator','operator','repair'])users.push(await db.user.create({data:{email:`${stamp}-${suffix}@example.invalid`,name:stamp,passwordHash:'fixture-only',role:'ADMIN',roleId:suffix==='repair'?role.id:null,totpEnabledAt:new Date()}}));
 browser=await chromium.launch({headless:true,args:fixtureTLS(baseURL).args});
 for(const user of users){const context=await browser.newContext({baseURL,ignoreHTTPSErrors:fixtureTLS(baseURL).ignoreHTTPSErrors,extraHTTPHeaders:{'x-forwarded-for':`10.126.4.${contexts.length+1}`}});const value=await encode({secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),role:user.role,roleId:user.roleId,email:user.email,permissions:user.roleId?['dashboard.view','imports.manage']:null,authAt:Date.now()},maxAge:3600});await context.addCookies([{name:'__Secure-next-auth.session-token',value,url:baseURL}]);contexts.push(context);}
 const [creator,operator,repair]=contexts.map(context=>context.request);
 const upload=await creator.post('/api/admin/imports/upload?adapter=magazine&offset=0&final=1',{headers:{Origin:baseURL,'x-file-name':encodeURIComponent(stamp+'.json'),'content-type':'application/octet-stream'},data:Buffer.from(JSON.stringify([{id:stamp,title:stamp,content:'<p>owned import authority fixture</p>'}]))});assert.equal(upload.status(),200);const saved=await upload.json();jobId=saved.job.id;fileKey=(await db.importJob.findUniqueOrThrow({where:{id:jobId}})).fileKey;
 await request(creator,{op:'settings',id:jobId,settings});await request(creator,{op:'dry-run',id:jobId,settings});
 await restricted(users[0]);await request(creator,{op:'start',id:jobId,settings},403);assert.equal((await db.importJob.findUniqueOrThrow({where:{id:jobId}})).status,'DRAFT');
 await request(operator,{op:'start',id:jobId,settings});const imported=await waitFor('DONE');assert.equal(imported.createdById,users[0].id);assert.equal(imported.createdByEmail,users[0].email);assert.equal(imported.executionActorId,users[1].id);assert.equal(imported.executionMode,'RUN');assert.equal(imported.cursor,1);assert.equal(await db.importRecord.count({where:{jobId,status:'OK'}}),1);
 const post=await db.post.findFirstOrThrow({where:{title:stamp}});const completed=await db.auditLog.findFirstOrThrow({where:{action:'import.completed',targetId:String(jobId)},orderBy:{id:'desc'}});assert.equal(completed.actorUserId,users[1].id);assert.equal(JSON.parse(completed.metadata).createdById,users[0].id);
 await restricted(users[1]);await request(operator,{op:'rollback',id:jobId,confirm:true},403);assert.equal((await db.importJob.findUniqueOrThrow({where:{id:jobId}})).status,'DONE');assert.equal((await db.post.findUniqueOrThrow({where:{id:post.id}})).title,stamp);
 // The worker's denial pause is proven by the connected gate. This fixture supplies that paused state to the real HTTP resume/queue path.
 const paused=await db.importJob.updateMany({where:{id:jobId,status:'DONE'},data:{status:'PAUSED',executionMode:'ROLLBACK',lockedUntil:null,error:'owned worker authority pause'}});assert.equal(paused.count,1);
 const resumed=await request(repair,{op:'resume',id:jobId});assert.equal(resumed.status,'ROLLING_BACK');const repaired=await waitFor('ROLLED_BACK');assert.equal(repaired.executionActorId,users[2].id);assert.equal(repaired.createdById,users[0].id);assert.equal(await db.post.findUnique({where:{id:post.id}}),null);assert.equal(await db.importRecord.count({where:{jobId,status:'ROLLED_BACK'}}),1);
 const rolled=await db.auditLog.findFirstOrThrow({where:{action:'import.rolled_back',targetId:String(jobId)},orderBy:{id:'desc'}});assert.equal(rolled.actorUserId,users[2].id);assert.equal(JSON.parse(rolled.metadata).createdById,users[0].id);
 const page=await contexts[2].newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});const response=await page.goto('/admin/imports');assert.equal(response.status(),200);await page.getByRole('heading',{name:'ورود گروهی اطلاعات',exact:true}).waitFor();assert.equal(errors.length,0);
 console.log('Compiled import authority: real HTTPS upload/dry-run/import/queue/content/audits; denied creator/operator commands, captured current operator, immutable provenance, imports-only staff repairing denied owners through rollback resume, actual admin page with no page errors passed');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 try{
  for(const context of contexts)await context.close();await browser?.close();
  if(jobId){await db.backgroundJob.deleteMany({where:{kind:{in:['imports.run','imports.rollback']},payload:JSON.stringify({jobId})}});await db.importExternalRef.deleteMany({where:{jobId,source:stamp}});await db.importJob.deleteMany({where:{id:jobId,fileName:stamp+'.json'}});}
  await db.post.deleteMany({where:{title:stamp}});await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(user=>user.id)}}});await db.accessRestriction.deleteMany({where:{id:{in:restrictionIds},reason:stamp}});await db.user.deleteMany({where:{id:{in:users.map(user=>user.id)},email:{startsWith:stamp}}});await db.role.deleteMany({where:{id:{in:roles.map(role=>role.id)},name:stamp}});
  if(fileKey){const directory=path.resolve('storage/imports'),target=path.resolve(directory,fileKey);if(!target.startsWith(directory+path.sep))throw Error('Fixture upload cleanup outside owner storage');await fs.promises.rm(target,{force:true});}
 }finally{await db.$disconnect()}
});
