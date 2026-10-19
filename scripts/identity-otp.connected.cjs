// Native PostgreSQL challenge claims and actual auth providers; only delivery/cache/external integrations are doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),crypto=require('node:crypto')
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient(),cache=new Map(),stamp=`owned-entry-${Date.now()}`,users=[],snapshots=new Map(),sent=[]
const secret='owned-otp-connected-fixture',mailKey='mail.smtp.v1',policyKey='security.policy.v1'
let deliveryOk=true
const mocks={
 '@/platform/database/prisma':{db:prisma},'@/platform/config/env':{authSecret:()=>secret},
 '@/platform/cache/kv':{kv:async()=>({kind:'memory'}),cached:async(k,t,work)=>work(),invalidate:async()=>{}},
 '@/platform/observability/logger':{logEvent:()=>{}},'@/modules/identity/server/access':{clearAdminPolicyCache:()=>{}},
 '@/modules/mail/server/mailer':{getSmtp:async()=>JSON.parse((await prisma.setting.findUnique({where:{key:mailKey}}))?.value||'{}'),sendMail:async mail=>{sent.push(mail);return{ok:deliveryOk}}},
 '@/modules/notifications/server/telegram':{},'@/modules/identity/telegram-account':{},
}
function load(relative){const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
 if(Object.hasOwn(mocks,name))return mocks[name]
 if(name.startsWith('@/')&&/\.(json|cjs)$/.test(name))return require(path.resolve('src',name.slice(2)))
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);const canonical='@/'+path.relative(path.resolve('src'),base).replaceAll('\\','/');if(Object.hasOwn(mocks,canonical))return mocks[canonical];return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts'))}
 return require(name)
},mod,mod.exports);return mod.exports}
const set=(key,value)=>prisma.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
const code=()=>sent.at(-1).text.match(/\b\d{6}\b/)[0]
const email=i=>`${stamp}-${i}@example.com`
async function main(){try{
 // Run the exact additive migration against populated pre-email challenge storage, without touching public tables.
 await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "OtpCode" ("id" INTEGER PRIMARY KEY, "phone" TEXT NOT NULL, "purpose" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL, "codeHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL) ON COMMIT DROP')
  await tx.$executeRawUnsafe('INSERT INTO "OtpCode" VALUES (11,\'+989100000001\',\'LOGIN\',CURRENT_TIMESTAMP,\'old-hmac\',3)')
  const before=await tx.$queryRawUnsafe('SELECT "id","phone","purpose","createdAt","codeHash","attempts" FROM "OtpCode"')
  for(const sql of fs.readFileSync('prisma/migrations/20270104120000_email_otp/migration.sql','utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(sql)
  const after=await tx.$queryRawUnsafe('SELECT * FROM "OtpCode"');assert.deepEqual(after.map(({email,...row})=>row),before);assert.equal(after[0].email,null)
 })
 for(const key of [mailKey,policyKey,'sms.config.v1'])snapshots.set(key,await prisma.setting.findUnique({where:{key}}))
 await set(mailKey,{enabled:true,host:'owned-mail-fixture',fromEmail:'noreply@example.com'});await set(policyKey,{requireAdmin2fa:false,emailOtp:true,unknownFutureFlag:'keep'})
 const otp=load('src/modules/identity/server/email-otp.ts'),security=load('src/modules/identity/server/account-security.ts'),sms=load('src/modules/sms/server/sms.ts'),{authOptions}=load('src/modules/identity/auth.ts')
 const authorize=(id,input)=>authOptions.providers.find(p=>(p.options.id||p.id)===id).options.authorize(input,{headers:{'x-real-ip':stamp}})
 const send=async i=>{await otp.requestEmailCode({email:email(i),ip:stamp});return code()}
 assert.equal(await otp.emailOtpAvailable(),true)
 await assert.rejects(()=>otp.requestEmailCode({email:'989123456789@phone.mobocom.local',ip:stamp}),e=>e.status===400)
 await send('new');const newCode=code(),row=await prisma.otpCode.findFirst({where:{email:email('new')},orderBy:{id:'desc'}})
 assert.notEqual(row.codeHash,newCode);assert.ok(!JSON.stringify(row).includes(newCode));assert.equal(await prisma.user.count({where:{email:email('new')}}),0)
 assert.ok(await otp.verifyEmailCode({email:email('new').toUpperCase(),code:newCode,consume:false}))
 const newUser=await authorize('email-otp',{email:email('new'),code:newCode});assert.ok(newUser);users.push(Number(newUser.id));assert.equal((await prisma.user.findUnique({where:{id:Number(newUser.id)}})).role,'CUSTOMER')
 assert.equal(await authorize('email-otp',{email:email('new'),code:newCode}),null,'single-use provider')
 const existing=await prisma.user.create({data:{email:email('existing'),passwordHash:'unchanged',name:'Owned existing account'}});users.push(existing.id)
 const existingCode=await send('existing');const same=await authorize('email-otp',{email:email('existing'),code:existingCode});assert.equal(Number(same.id),existing.id);assert.equal((await prisma.user.findUnique({where:{id:existing.id}})).passwordHash,'unchanged')
 const raceUser=await prisma.user.create({data:{email:email('race'),passwordHash:'existing race fixture'}});users.push(raceUser.id)
 const race=await send('race');const raceResults=await Promise.all([authorize('email-otp',{email:email('race'),code:race}),authorize('email-otp',{email:email('race'),code:race})]);assert.equal(raceResults.filter(Boolean).length,1,'the challenge, not user uniqueness, arbitrates the race');assert.equal(Number(raceResults.find(Boolean).id),raceUser.id)
 const wrong=await send('wrong');const wrongResults=await Promise.all(Array.from({length:12},()=>otp.verifyEmailCode({email:email('wrong'),code:wrong==='111111'?'222222':'111111'})));assert.ok(wrongResults.every(r=>r===null));assert.equal((await prisma.otpCode.findFirst({where:{email:email('wrong')},orderBy:{id:'desc'}})).attempts,5,'parallel failures exhaust exactly five attempts')
 assert.equal(await otp.verifyEmailCode({email:email('wrong'),code:wrong}),null,'attempt budget also gates correct code')
 const expired=await send('expired');await prisma.otpCode.updateMany({where:{email:email('expired')},data:{expiresAt:new Date(0)}});assert.equal(await otp.verifyEmailCode({email:email('expired'),code:expired}),null)
 const old=await send('latest');await prisma.otpCode.create({data:{phone:'',email:email('latest'),purpose:'EMAIL_LOGIN',codeHash:crypto.createHmac('sha256',secret).update(`email-otp:LOGIN:${email('latest')}:888888`).digest('hex'),expiresAt:new Date(Date.now()+60000),consumedAt:new Date()}});assert.equal(await otp.verifyEmailCode({email:email('latest'),code:old}),null,'no fallback to older unconsumed row')
 await assert.rejects(()=>otp.requestEmailCode({email:email('latest'),ip:stamp}),e=>e.status===429)
 deliveryOk=false;await assert.rejects(()=>send('failed'),e=>e.status===502);deliveryOk=true;assert.ok((await prisma.otpCode.findFirst({where:{email:email('failed')}})).consumedAt)
 const disabled=await send('disabled');await security.saveSecurityPolicy({emailOtp:false});assert.equal(await otp.verifyEmailCode({email:email('disabled'),code:disabled}),null);await assert.rejects(()=>send('off'),e=>e.status===403)
 await security.saveSecurityPolicy({emailReset:false});assert.equal((await security.getSecurityPolicy()).emailOtp,false,'old clients cannot re-enable omitted flag');assert.equal(JSON.parse((await prisma.setting.findUnique({where:{key:policyKey}})).value).unknownFutureFlag,'keep')
 await security.saveSecurityPolicy({emailOtp:true});await set(mailKey,{enabled:false});assert.equal(await otp.emailOtpAvailable(),false);await set(mailKey,{enabled:true,host:'owned',fromEmail:'noreply@example.com'})
 const changed=await send('changed');const injected=await prisma.user.create({data:{email:email('changed'),passwordHash:'injected after issue'}});users.push(injected.id);assert.equal(await authorize('email-otp',{email:email('changed'),code:changed}),null,'recipient identity changed after issuance')
 const banned=await prisma.user.create({data:{email:email('banned'),passwordHash:'fixture',status:'BANNED'}});users.push(banned.id);assert.equal(await authorize('email-otp',{email:email('banned'),code:await send('banned')}),null)
 const restricted=await prisma.user.create({data:{email:email('restricted'),passwordHash:'fixture'}});users.push(restricted.id);await prisma.accessRestriction.create({data:{userId:restricted.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp,startsAt:new Date(0)}});assert.equal(await authorize('email-otp',{email:email('restricted'),code:await send('restricted')}),null)
 // Actual authenticator challenge: first factor must not consume the email code before asking for TOTP.
 const factor=await prisma.user.create({data:{email:email('factor'),passwordHash:'fixture',totpEnabledAt:new Date(),totpSecret:'JBSWY3DPEHPK3PXP'}});users.push(factor.id)
 const factorCode=await send('factor');await assert.rejects(()=>authorize('email-otp',{email:email('factor'),code:factorCode}),/TOTP_REQUIRED/);assert.equal((await prisma.otpCode.findFirst({where:{email:email('factor')},orderBy:{id:'desc'}})).consumedAt,null)
 await assert.rejects(()=>authorize('email-otp',{email:email('factor'),code:factorCode,totp:'123'}),/TOTP_INVALID/)
 const totp=load('src/shared/security/totp-verify.ts').totpCode('JBSWY3DPEHPK3PXP',Date.now());assert.equal(Number((await authorize('email-otp',{email:email('factor'),code:factorCode,totp})).id),factor.id)
 // Legacy SMS hash and purpose remain compatible; concurrent claims permit one winner and never revive old codes.
 const phone='+989100001111',hash=c=>crypto.createHmac('sha256',secret).update(`otp:${phone}:${c}`).digest('hex')
 await prisma.otpCode.create({data:{phone,purpose:'LOGIN',codeHash:hash('654321'),expiresAt:new Date(Date.now()+60000),ip:stamp}})
 const smsResults=await Promise.allSettled([sms.verifyOtp({phone,code:'۶۵۴۳۲۱',purpose:'LOGIN'}),sms.verifyOtp({phone,code:'654321',purpose:'LOGIN'})]);assert.equal(smsResults.filter(r=>r.status==='fulfilled').length,1)
 await prisma.otpCode.create({data:{phone,purpose:'LOGIN',codeHash:hash('123456'),expiresAt:new Date(Date.now()+60000),ip:stamp,attempts:5}});await assert.rejects(()=>sms.verifyOtp({phone,code:'123456',purpose:'LOGIN'}))
 const switched=await prisma.otpCode.create({data:{phone,purpose:'LOGIN',codeHash:hash('112233'),expiresAt:new Date(Date.now()+60000),ip:stamp}})
 await set('sms.config.v1',{otpLogin:false});assert.equal(await authorize('sms-otp',{phone,code:'112233'}),null);assert.equal((await prisma.otpCode.findUnique({where:{id:switched.id}})).consumedAt,null,'disabled SMS login cannot consume its first factor')
 console.log('PASS identity OTP: actual populated additive SQL preservation, canonical existing/new identity, email+SMS claims/replay/race/expiry/parallel attempts/latest-only, current policy and SMTP, send failure, recipient binding, standing/GLOBAL denial, actual TOTP; no external delivery')
 }finally{
  await prisma.accessRestriction.deleteMany({where:{reason:stamp}})
  await prisma.otpCode.deleteMany({where:{OR:[{email:{startsWith:stamp}},{ip:stamp}]}})
  await prisma.user.deleteMany({where:{email:{startsWith:stamp}}})
  for(const[key,row]of snapshots)if(row)await prisma.setting.upsert({where:{key},create:row,update:{value:row.value}});else await prisma.setting.deleteMany({where:{key}})
  await prisma.$disconnect()
 }}
main().catch(e=>{console.error(e);process.exitCode=1})
