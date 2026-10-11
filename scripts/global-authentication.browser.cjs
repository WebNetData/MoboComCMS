const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt');
const {chromium}=require('@playwright/test'),bcrypt=require('bcryptjs'),crypto=require('node:crypto');
const {fixtureTLS}=require('./e2e-fixture-tls.cjs');
const baseURL=process.env.E2E_BASE_URL;
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||baseURL!=='https://e2e.mobocom.test:3443'||!process.env.DATABASE_URL||!process.env.NEXTAUTH_SECRET)throw Error('DISPOSABLE_COMPILED_FIXTURE_REQUIRED');
const db=new PrismaClient(),stamp=`ga-${Date.now()}`,password=crypto.randomBytes(20).toString('hex');
let browser,user,publicApiBefore,publicApiPrepared=false;
async function main(){
 publicApiBefore=await db.setting.findUnique({where:{key:'publicApiEnabled'}});
 await db.setting.upsert({where:{key:'publicApiEnabled'},create:{key:'publicApiEnabled',value:'true'},update:{value:'true'}});publicApiPrepared=true;
 user=await db.user.create({data:{email:stamp+'@example.invalid',name:'آزمون دسترسی',passwordHash:await bcrypt.hash(password,10)}});
 const bearer='kv_'+crypto.randomBytes(24).toString('hex');
 await db.apiKey.create({data:{userId:user.id,token:crypto.createHash('sha256').update(bearer).digest('hex')}});
 browser=await chromium.launch({headless:true,args:fixtureTLS(baseURL).args});
 const opts={baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{Origin:baseURL}};
 const context=await browser.newContext(opts);
 const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),sub:String(user.id),email:user.email,role:user.role,authAt:Date.now()}});
 const cookie={name:'__Secure-next-auth.session-token',value:token,url:baseURL};
 await context.addCookies([cookie]);
 const keyContext=await browser.newContext({...opts,extraHTTPHeaders:{Origin:baseURL,Authorization:`Bearer ${bearer}`}});
 assert.equal((await context.request.get('/api/me')).status(),200);
 assert.equal((await keyContext.request.get('/api/v1/me')).status(),200);
 assert.equal((await (await context.request.get('/api/auth/session')).json()).user.id,String(user.id));
 const first=await db.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:'owned browser fixture',startsAt:new Date(Date.now()-1000),expiresAt:null}});
 assert.equal((await context.request.get('/api/me')).status(),401);
 assert.equal((await keyContext.request.get('/api/v1/me')).status(),401);
 assert.equal((await (await context.request.get('/api/auth/session')).json()).user,undefined);
 const fresh=await browser.newContext(opts);
 const csrf=await (await fresh.request.get('/api/auth/csrf')).json();
 const refused=await fresh.request.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:user.email,password,callbackUrl:baseURL+'/dashboard',json:'true'},maxRedirects:0});
 assert.ok([302,303,403].includes(refused.status()),'normal restriction rejects login without a server error');
 assert.ok(((refused.headers().location||'')+await refused.text()).includes('AccessDenied'),'uses the authentication provider denial response');
 assert.equal((await (await fresh.request.get('/api/auth/session')).json()).user,undefined,'correct credentials cannot mint a session while restricted');
 await db.accessRestriction.updateMany({where:{id:first.id,revokedAt:null},data:{revokedAt:new Date(),revokedByUserId:user.id,revocationReason:'fixture release'}});
 await context.addCookies([cookie]);
 assert.equal((await context.request.get('/api/me')).status(),200);
 assert.equal((await keyContext.request.get('/api/v1/me')).status(),200);
 const unblocked=await browser.newContext(opts),csrf2=await (await unblocked.request.get('/api/auth/csrf')).json();
 await unblocked.request.post('/api/auth/callback/credentials',{form:{csrfToken:csrf2.csrfToken,email:user.email,password,callbackUrl:baseURL+'/dashboard',json:'true'},maxRedirects:0});
 assert.equal((await (await unblocked.request.get('/api/auth/session')).json()).user.id,String(user.id),'real credential login works after individual revocation');
 const page=await unblocked.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});assert.equal(errors.length,0);
 console.log('actual compiled global authentication: stale cookie, bearer key, correct-password new login denial, individual revoke and recovered login passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 await browser?.close();try{if(user){await db.accessRestriction.deleteMany({where:{userId:user.id}});await db.apiKey.deleteMany({where:{userId:user.id}});await db.user.deleteMany({where:{id:user.id,email:stamp+'@example.invalid'}})}}finally{
  try{if(publicApiPrepared){
   if(publicApiBefore)assert.equal((await db.setting.updateMany({where:{key:'publicApiEnabled',value:'true'},data:{value:publicApiBefore.value}})).count,1);
   else assert.equal((await db.setting.deleteMany({where:{key:'publicApiEnabled',value:'true'}})).count,1);
   assert.deepEqual(await db.setting.findUnique({where:{key:'publicApiEnabled'}}),publicApiBefore);
  }}finally{await db.$disconnect()}
 }
});
