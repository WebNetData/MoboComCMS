// Actual HTTP/auth/form owners on PostgreSQL; money/files/providers are delegation spies.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt');
const prisma=new PrismaClient(),secret='owned-current-account-consumers-fixture',stamp=`account-consumers-${Date.now()}`,users=[],forms=[];
let unavailable=false;const calls=[];
const db=new Proxy(prisma,{get(target,key){
 if(key==='accessRestriction')return new Proxy(target[key],{get(model,method){
  if(method==='findMany')return args=>{if(unavailable)throw Error('fixture storage unavailable');return model.findMany(args)};
  return typeof model[method]==='function'?model[method].bind(model):model[method];
 }});
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
const spy=(name,result)=>async(...args)=>{calls.push({name,args});return typeof result==='function'?result(...args):result};
const vendor={getVendorConfig:async()=>({enabled:true}),licensesOf:spy('licenses',[]),buyProduct:spy('buy',{ok:true}),releaseSite:spy('release',undefined),downloadForOwner:spy('download',{buffer:Buffer.from('owned-fixture'),filename:'fixture.zip'})};
const manage={advertiserPortal:spy('portal',{}),publicPackages:spy('packages',[]),buyPackage:spy('ad-buy',{ok:true}),advertiserAction:spy('ad-action',undefined)};
const serving={getAdsConfig:spy('ad-config',{}),serveAd:spy('serve',async input=>({ad:null,userId:input.userId,vip:await input.vip()}))};
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(name==='@/platform/database/prisma')return {db};
  if(name==='@/platform/config/env')return {authSecret:()=>secret};
  if(name==='@/platform/http/rate-limit')return {clientIp:()=> '10.123.4.5',rateLimitHit:()=>({ok:true})};
  if(name==='@/extensions/server/modules')return {moduleGuard:async()=>null};
  if(name==='@/modules/repository/server/vendor')return vendor;
  if(name==='@/modules/ads/server/manage')return manage;
  if(name==='@/modules/ads/server/serving')return serving;
  if(name==='@/modules/membership/server/membership')return {isMember:spy('membership',true)};
  if(name==='@/modules/wallet/server/wallet')return {walletBalance:spy('wallet',0)};
  if(name==='@/modules/site/server/http/admin/media/route')return {receiveImage:spy('image',new Response('owned upload'))};
  if(name==='@/modules/forms/server/advanced')return {assertHandlersCanWork:async()=>{},bookSlots:async()=>{},sendFormNotifications:async()=>{},sendFormWebhooks:async()=>{},webhookAnswers:answers=>answers};
  if(name==='@/modules/forms/server/paid')return {FORM_CURRENCY:'IRT',billFor:async()=>{throw Error('Unexpected bill')},sealSecrets:answers=>({answers,secrets:''})};
  if(name==='@/platform/observability/logger')return {logEvent:()=>{throw Error('Unexpected form error')}};
  if(name==='@/modules/mail/server/mailer')return {sendMail:()=>{throw Error('Unexpected external mail')}};
  if(name==='@/modules/notifications/server/inbox')return {createInboxEvent:()=>{throw Error('Unexpected notification')}};
  if(name.startsWith('@/')){
   const candidate='src/'+name.slice(2);
   if(candidate.endsWith('.json'))return JSON.parse(fs.readFileSync(candidate,'utf8'));
   if(fs.existsSync(candidate+'.ts'))return load(candidate+'.ts');
   if(fs.existsSync(candidate+'/index.ts'))return load(candidate+'/index.ts');
   throw Error('Unexpected alias '+name);
  }
  return require(name);
 },mod,mod.exports);return mod.exports;
}
async function main(){
 const ads=load('src/modules/ads/server/http/promo.ts'),repo=load('src/modules/repository/server/http/public.ts'),formRoute=load('src/modules/site/server/http/forms/[slug]/route.ts');
 const formOwner=load('src/modules/forms/server/service.ts');
 for(const role of ['CUSTOMER','ADMIN'])users.push(await prisma.user.create({data:{email:`${stamp}-${role}@example.invalid`,passwordHash:'fixture-only',role}}));
 const user=users[0],other=users[1];
 for(const requireLogin of [false,true])forms.push(await formOwner.saveForm({slug:`${stamp}-${requireLogin}`,title:'owned fixture',published:true,successText:'ثبت شد',settings:{requireLogin,notifyInbox:false},fields:[{id:'name',label:'نام',type:'text',required:true,options:[]}]}));
 const cookie=await encode({secret,token:{uid:String(user.id),authAt:Date.now()},maxAge:3600});
 const request=(method='GET',body={},signed=true)=>new NextRequest('http://localhost/api/fixture?license=123&p=fixture-placement',{method,headers:{Origin:'http://localhost',...(signed?{cookie:`next-auth.session-token=${cookie}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 const targets=[
  ['advertiser panel',()=>ads.GET_mine(request())],['advertiser buy',()=>ads.POST_buy(request('POST',{}))],
  ['advertiser update',()=>ads.PATCH_mine(request('PATCH',{}))],['advertiser image',()=>ads.POST_media(request('POST',{}))],
  ['owner licenses',()=>repo.GET_mine(request())],['owner buy',()=>repo.POST_mine(request('POST',{op:'buy',productId:1}))],
  ['owner release',()=>repo.POST_mine(request('POST',{op:'release-site',licenseId:1}))],['owner download',()=>repo.GET_mineDownload(request())],
 ];
 const submitted=async(form,signed=true)=>formRoute.POST(request('POST',{values:{name:'آزمون'}},signed),{params:Promise.resolve({slug:form.slug})});
 const allowed=async()=>{
  for(const [name,invoke] of targets){calls.length=0;assert.equal((await invoke()).status,200,name);assert(calls.length>0,name+' reaches existing owner');for(const call of calls.filter(c=>['portal','ad-buy','ad-action','licenses','buy','download'].includes(c.name)))assert.equal(call.args[0],user.id,name+' current userId');}
  const before=await prisma.formSubmission.count({where:{formId:forms[1].id}});
  assert.equal((await submitted(forms[1])).status,201);
  const rows=await prisma.formSubmission.findMany({where:{formId:forms[1].id},orderBy:{id:'desc'}});assert.equal(rows.length,before+1);assert.equal(rows[0].userId,user.id);
 };
 const denied=async(label)=>{
  for(const [name,invoke] of targets){calls.length=0;assert.equal((await invoke()).status,401,label+': '+name);assert.equal(calls.length,0,name+' must not call money/image/download owner');}
  const before=await prisma.formSubmission.count({where:{formId:forms[1].id}});
  assert.equal((await submitted(forms[1])).status,401);assert.equal(await prisma.formSubmission.count({where:{formId:forms[1].id}}),before);
  assert.equal((await submitted(forms[0])).status,201,'public form remains anonymous');
  const row=await prisma.formSubmission.findFirstOrThrow({where:{formId:forms[0].id},orderBy:{id:'desc'}});assert.equal(row.userId,null,'no stale account attribution');
  const servingResult=await (await ads.GET_serve(request())).json();assert.equal(servingResult.userId,null);assert.equal(servingResult.vip,false,'anonymous serving has no account VIP');
 };
 await allowed();
 await prisma.accessRestriction.create({data:{userId:user.id,scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]',reason:'owned fixture'}});await allowed();
 const restriction=await prisma.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:'owned fixture'}});await denied('global restriction');
 await prisma.accessRestriction.updateMany({where:{id:restriction.id,revokedAt:null},data:{revokedAt:new Date(),revokedByUserId:other.id,revocationReason:'owned release'}});await allowed();
 await prisma.user.update({where:{id:user.id},data:{status:'BANNED'}});await denied('current standing');
 await prisma.user.update({where:{id:user.id},data:{status:'ACTIVE',passwordChangedAt:new Date(Date.now()+1000)}});await denied('password-reset stale cookie');
 await prisma.user.update({where:{id:user.id},data:{passwordChangedAt:null}});
 unavailable=true;
 for(const [,invoke] of targets){calls.length=0;await assert.rejects(invoke(),/storage unavailable/);assert.equal(calls.length,0);}
 const before=await prisma.formSubmission.count({where:{formId:{in:forms.map(f=>f.id)}}});
 await assert.rejects(submitted(forms[0]),/storage unavailable/);assert.equal(await prisma.formSubmission.count({where:{formId:{in:forms.map(f=>f.id)}}}),before,'outage must not downgrade to anonymous write');unavailable=false;
 assert.equal((await submitted(forms[0],false)).status,201);assert.equal((await submitted(forms[1],false)).status,401);
 console.log('Current-account consumers: actual PostgreSQL/signed cookies/HTTP owners; eight protected actions, real forms login/attribution/anonymous behavior, forum isolation, GLOBAL revoke, standing, password reset, storage outage/no delegate or anonymous fail-open passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{await prisma.siteForm.deleteMany({where:{id:{in:forms.map(f=>f.id)},slug:{startsWith:stamp}}});await prisma.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});}finally{await prisma.$disconnect()}
});
