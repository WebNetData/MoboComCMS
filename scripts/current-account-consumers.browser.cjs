const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt'),{chromium}=require('@playwright/test');
const {fixtureTLS}=require('./e2e-fixture-tls.cjs');
const baseURL=process.env.E2E_BASE_URL;
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||baseURL!=='https://e2e.mobocom.test:3443'||!process.env.DATABASE_URL||!process.env.NEXTAUTH_SECRET)throw Error('DISPOSABLE_COMPILED_FIXTURE_REQUIRED');
const db=new PrismaClient(),stamp=`cc-${Date.now().toString(36)}`,users=[],forms=[],settings=[],settingsPrepared=[];
let browser,admin,productId;
function zip(){
 const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/modules/packages/domain/zip.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,mod,mod.exports);
 return mod.exports.writeZip(new Map([
  ['manifest.json',Buffer.from(JSON.stringify({id:stamp,name:'Owned fixture',version:'1.0.0',kind:'plugin',runtime:'declarative',requiresCore:'^1.0.0',slots:{'home.before-main':'slots/fixture.html'}}))],
  ['slots/fixture.html',Buffer.from('<p>owned fixture</p>')],
 ]));
}
async function snapshot(){return {
 advertiser:await db.advertiser.findMany({where:{userId:users[0].id}}),
 licenses:await db.repoLicense.findMany({where:{userId:users[0].id}}),
 product:await db.repoProduct.findUnique({where:{id:productId}}),
 wallet:await db.walletTx.findMany({where:{userId:users[0].id}}),
 accounts:await db.walletAccount.findMany({where:{userId:users[0].id}}),
};}
async function main(){
 for(const key of ['extension.ads.state.v1','extension.repository.state.v1','repository.vendor.v1'])settings.push({key,before:await db.setting.findUnique({where:{key}})});
 for(const item of settings.filter(s=>s.key.startsWith('extension.'))){
  const value=JSON.stringify({...JSON.parse(item.before?.value||'{}'),enabled:true});
  await db.setting.upsert({where:{key:item.key},create:{key:item.key,value},update:{value}});settingsPrepared.push({...item,value});
 }
 for(const role of ['CUSTOMER','ADMIN'])users.push(await db.user.create({data:{email:`${stamp}-${role}@example.invalid`,name:stamp,passwordHash:'fixture-only',role,totpEnabledAt:role==='ADMIN'?new Date():null}}));
 browser=await chromium.launch({headless:true,args:fixtureTLS(baseURL).args});
 const opts={baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{Origin:baseURL,'x-forwarded-for':'10.125.4.5'}};
 const token=user=>encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),sub:String(user.id),email:user.email,role:user.role,authAt:Date.now()}});
 const member=await browser.newContext(opts),guest=await browser.newContext(opts),owner=await browser.newContext(opts);
 const cookie={name:'__Secure-next-auth.session-token',value:await token(users[0]),url:baseURL};
 await member.addCookies([cookie]);await owner.addCookies([{...cookie,value:await token(users[1])}]);admin=owner.request;
 assert.equal((await admin.post('/api/admin/repository',{data:{op:'settings',enabled:true,name:'owned fixture'}})).status(),200);
 const vendor=settings.find(s=>s.key==='repository.vendor.v1');settingsPrepared.push({...vendor,value:(await db.setting.findUniqueOrThrow({where:{key:vendor.key}})).value});
 const created=await admin.post('/api/admin/repository',{data:{op:'product.save',slug:stamp,name:'Owned fixture',price:'0',active:true,kind:'PLUGIN',siteLimit:1,supportDays:365}});assert.equal(created.status(),200);productId=(await created.json()).id;
 assert.equal((await admin.post('/api/admin/repository/upload',{multipart:{productId:String(productId),file:{name:'fixture.zip',mimeType:'application/zip',buffer:zip()}}})).status(),200);
 const granted=await admin.post('/api/admin/repository',{data:{op:'license.grant',productId,userId:users[0].id,email:users[0].email,note:'owned fixture'}});assert.equal(granted.status(),200);const licenseId=(await granted.json()).id;
 for(const requireLogin of [false,true]){
  const saved=await admin.post('/api/admin/forms',{data:{slug:stamp+'-'+requireLogin,title:'Owned fixture',published:true,successText:'ثبت شد',settings:{requireLogin,notifyInbox:false},fields:[{id:'name',label:'نام',type:'text',required:true,options:[]}]}});assert.equal(saved.status(),200);forms.push({id:(await saved.json()).id,slug:stamp+'-'+requireLogin});
 }
 const submit=(context,form,name)=>context.request.post('/api/forms/'+form.slug,{data:{values:{name}},headers:{'x-forwarded-for':'10.125.4.5'}});
 const download=()=>member.request.get('/api/repo/mine/download?license='+licenseId);
 assert.equal((await member.request.get('/api/promo/mine')).status(),200);
 const mine=await member.request.get('/api/repo/mine');assert.equal(mine.status(),200);assert((await mine.json()).licenses.some(l=>l.id===licenseId));
 const file=await download();assert.equal(file.status(),200);assert.equal((await file.body()).subarray(0,2).toString(),'PK');
 assert.equal((await submit(member,forms[1],'حساب فعال')).status(),201);assert.equal((await db.formSubmission.findFirstOrThrow({where:{formId:forms[1].id},orderBy:{id:'desc'}})).userId,users[0].id);
 await db.accessRestriction.create({data:{userId:users[0].id,scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]',reason:'owned fixture'}});
 assert.equal((await download()).status(),200,'independent forum restriction does not block owner download');
 const restriction=await db.accessRestriction.create({data:{userId:users[0].id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:'owned fixture'}});
 const before=await snapshot(),beforeRequired=await db.formSubmission.count({where:{formId:forms[1].id}});
 for(const [method,url,data] of [
  ['get','/api/promo/mine'],['post','/api/promo/buy',{packageId:1}],['patch','/api/promo/mine',{campaignId:1,action:'pause'}],
  ['post','/api/promo/media',{}],['get','/api/repo/mine'],['post','/api/repo/mine',{op:'buy',productId}],
  ['post','/api/repo/mine',{op:'release-site',licenseId,site:'fixture.example.invalid'}],['get','/api/repo/mine/download?license='+licenseId],
 ])assert.equal((await member.request[method](url,data?{data}:{})).status(),401,url);
 assert.deepEqual(await snapshot(),before,'denied reads/writes/downloads preserve licenses, downloads and account money');
 assert.equal((await submit(member,forms[1],'حساب محدود')).status(),401);assert.equal(await db.formSubmission.count({where:{formId:forms[1].id}}),beforeRequired);
 assert.equal((await submit(member,forms[0],'مهمان با توکن محدود')).status(),201);assert.equal((await db.formSubmission.findFirstOrThrow({where:{formId:forms[0].id},orderBy:{id:'desc'}})).userId,null);
 assert.equal((await submit(guest,forms[0],'مهمان بدون توکن')).status(),201);assert.equal((await submit(guest,forms[1],'مهمان')).status(),401);
 const publicPage=await member.newPage(),errors=[];publicPage.on('pageerror',e=>errors.push(e.message));assert.equal((await publicPage.goto('/',{waitUntil:'domcontentloaded'})).status(),200);assert.equal(errors.length,0);
 await db.accessRestriction.updateMany({where:{id:restriction.id,revokedAt:null},data:{revokedAt:new Date(),revokedByUserId:users[1].id,revocationReason:'owned fixture release'}});await member.addCookies([cookie]);
 assert.equal((await download()).status(),200);assert.equal((await member.request.get('/api/promo/mine')).status(),200);
 await db.user.update({where:{id:users[0].id},data:{status:'BANNED'}});assert.equal((await download()).status(),401);
 await db.user.update({where:{id:users[0].id},data:{status:'ACTIVE',passwordChangedAt:new Date(Date.now()+1000)}});assert.equal((await member.request.get('/api/promo/mine')).status(),401);
 console.log('actual compiled current-account consumers: eight blocked actions, ZIP owner download before/after revoke, immutable license/download/money rows, independent forum, required/public form persistence, standing/password reset and public homepage passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{
  const vendor=settingsPrepared.find(s=>s.key==='repository.vendor.v1');
  if(vendor&&admin){const old=JSON.parse(vendor.before?.value||'{}');assert.equal((await admin.post('/api/admin/repository',{data:{op:'settings',...old,enabled:old.enabled===true}})).status(),200);vendor.value=(await db.setting.findUniqueOrThrow({where:{key:vendor.key}})).value;}
  if(productId){
   const releases=await db.repoRelease.findMany({where:{productId},select:{fileId:true}}),directory=path.resolve('storage/repository');
   for(const release of releases){assert.match(release.fileId,/^[0-9a-f-]{36}\.zip$/);const file=path.resolve(directory,release.fileId);assert.equal(path.dirname(file),directory);fs.unlinkSync(file);}
   await db.repoProduct.deleteMany({where:{id:productId,slug:stamp}});
  }
  await db.siteForm.deleteMany({where:{id:{in:forms.map(f=>f.id)},slug:{startsWith:stamp}}});
  await db.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}});
  await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});
 }finally{
  try{for(const item of settingsPrepared.reverse()){
   if(item.before)assert.equal((await db.setting.updateMany({where:{key:item.key,value:item.value},data:{value:item.before.value}})).count,1);
   else assert.equal((await db.setting.deleteMany({where:{key:item.key,value:item.value}})).count,1);
   assert.deepEqual(await db.setting.findUnique({where:{key:item.key}}),item.before);
  }}finally{await browser?.close();await db.$disconnect()}
 }
});
