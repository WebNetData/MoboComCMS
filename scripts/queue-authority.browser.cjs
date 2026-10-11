const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt'),{chromium}=require('@playwright/test'),{fixtureTLS}=require('./e2e-fixture-tls.cjs');
const baseURL=process.env.E2E_BASE_URL;
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||baseURL!=='https://e2e.mobocom.test:3443'||!process.env.INTERNAL_JOBS_SECRET)throw Error('OWNED_COMPILED_FIXTURE_REQUIRED');
const db=new PrismaClient(),stamp='qa-browser-'+Date.now(),users=[],contexts=[],restrictions=[];let browser,role,jobId;
async function command(client,body,status=200){const response=await client.post('/api/admin/performance',{headers:{Origin:baseURL},data:body});assert.equal(response.status(),status);return response.json()}
async function drain(client){const response=await client.post('/api/internal/imports/run',{headers:{Origin:baseURL,Authorization:'Bearer '+process.env.INTERNAL_JOBS_SECRET}});assert.equal(response.status(),200)}
async function main(){try{
 role=await db.role.create({data:{name:stamp,permissions:'dashboard.view,settings.manage'}});
 for(const suffix of ['creator','operator'])users.push(await db.user.create({data:{email:stamp+'-'+suffix+'@example.invalid',name:stamp,passwordHash:'owned',role:'ADMIN',roleId:suffix==='operator'?role.id:null,totpEnabledAt:new Date()}}));
 browser=await chromium.launch({headless:true,args:fixtureTLS(baseURL).args});
 for(const user of users){const context=await browser.newContext({baseURL,ignoreHTTPSErrors:fixtureTLS(baseURL).ignoreHTTPSErrors});const token=await encode({secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),email:user.email,role:user.role,roleId:user.roleId,authAt:Date.now()},maxAge:3600});await context.addCookies([{name:'__Secure-next-auth.session-token',value:token,url:baseURL}]);contexts.push(context)}
 const [creator,operator]=contexts.map(c=>c.request);
 // Valid existing kind + empty payload is a documented no-op; no real image/CDN/provider effects.
 const saved=await command(creator,{op:'job',kind:'imports.run'});jobId=saved.id;let row=await db.backgroundJob.findUniqueOrThrow({where:{id:jobId}});assert.equal(JSON.parse(row.payload).__mobocomManualAuthority.actorId,users[0].id);
 const restriction=await db.accessRestriction.create({data:{userId:users[0].id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp}});restrictions.push(restriction.id);
 await command(creator,{op:'retry',id:jobId},403);await drain(operator);row=await db.backgroundJob.findUniqueOrThrow({where:{id:jobId}});assert.equal(row.status,'FAILED');assert.match(row.lastError,/اختیار/);
 await command(operator,{op:'retry',id:jobId});row=await db.backgroundJob.findUniqueOrThrow({where:{id:jobId}});assert.equal(JSON.parse(row.payload).__mobocomManualAuthority.actorId,users[1].id);await drain(operator);row=await db.backgroundJob.findUniqueOrThrow({where:{id:jobId}});assert.equal(row.status,'DONE');assert.deepEqual(JSON.parse(row.result),{skipped:true});
 const audit=await db.auditLog.findFirstOrThrow({where:{action:'operations.retry',targetId:String(jobId),actorUserId:users[1].id}});assert.equal(JSON.parse(audit.metadata).previousActorId,users[0].id);
 await command(operator,{op:'job',kind:'constructor'},400);
 const page=await contexts[1].newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});const response=await page.goto('/admin/monitoring');assert.equal(response.status(),200);await page.waitForLoadState('networkidle');assert.equal(errors.length,0);
 console.log('Compiled manual queue: real HTTPS command grant, GLOBAL denial, actual worker dispatch, settings-only explicit audited takeover/no-op completion, inherited-kind refusal and existing monitoring page passed');
 }finally{for(const c of contexts)await c.close();await browser?.close();if(jobId)await db.backgroundJob.deleteMany({where:{id:jobId}});await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}});await db.accessRestriction.deleteMany({where:{id:{in:restrictions},reason:stamp}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});if(role)await db.role.deleteMany({where:{id:role.id,name:stamp}});await db.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
