// Real restriction rows, signed cookies and API keys; isolated fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript-api');
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server');
const {encode}=require('next-auth/jwt'),prisma=new PrismaClient();
const secret='owned-global-authentication-fixture',stamp=`global-auth-${Date.now()}`,users=[];
let unavailable=false,sessionId=0;
const db=new Proxy(prisma,{get(target,key){
 if(key==='accessRestriction')return new Proxy(target[key],{get(model,method){
  if(method==='findMany')return args=>{if(unavailable)throw Error('fixture storage unavailable');return model.findMany(args)};
  return typeof model[method]==='function'?model[method].bind(model):model[method];
 }});
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(name==='@/platform/database/prisma')return {db};
  if(name==='@/platform/config/env')return {authSecret:()=>secret};
  if(name==='@/extensions/generated/catalog')return load('src/extensions/generated/catalog.ts');
  if(name.startsWith('@/plugins/')&&name.endsWith('/manifest.json'))return JSON.parse(fs.readFileSync('src/'+name.slice(2),'utf8'));
  if(name.startsWith('@/platform/extensions/'))return load('src/'+name.slice(2)+'.ts');
  if(name==='next-auth')return {getServerSession:async()=>({user:{id:String(sessionId)}})};
  if(name.startsWith('@/modules/identity/')&&!name.includes('telegram-account')&&!name.includes('staff-guard')&&!name.includes('turnstile')&&!name.includes('human-check'))return load('src/'+name.slice(2)+'.ts');
  if(name.startsWith('@/'))return new Proxy({},{get:(_,key)=>()=>{throw Error('Unexpected external service: '+name+' '+String(key))}});
  return require(name);
 },mod,mod.exports);
 return mod.exports;
}
async function main(){
 const restrictions=load('src/modules/identity/server/authentication-restrictions.ts');
 const access=load('src/modules/identity/server/access.ts');
 const {authOptions}=load('src/modules/identity/auth.ts');
 const api=load('src/modules/public-api/server/api-keys.ts');
 for(const role of ['USER','ADMIN'])users.push(await prisma.user.create({data:{email:`${stamp}-${role}@example.invalid`,passwordHash:'fixture-only',role}}));
 const user=users[0],other=users[1],now=new Date(),past=new Date(now.getTime()-60000),future=new Date(now.getTime()+60000);
 const token={uid:String(user.id),authAt:Date.now()};
 const jwt=await encode({token,secret,maxAge:3600});
 const req=new NextRequest('http://localhost/api/fixture',{headers:{cookie:`next-auth.session-token=${jwt}`}});
 const key=api.generateApiKey();await prisma.apiKey.create({data:{userId:user.id,token:key.hash}});
 const keyReq=new NextRequest('http://localhost/api/v1/fixture',{headers:{authorization:`Bearer ${key.token}`}});
 sessionId=user.id;
 const record=async(extra={})=>prisma.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:'owned fixture',startsAt:past,expiresAt:future,...extra}});
 const allowed=async()=>{
  assert.equal(await authOptions.callbacks.signIn({user:{id:String(user.id)}}),true);
  assert.equal((await access.requireUser(req))?.id,user.id);
  assert.equal((await api.resolveApiCaller(keyReq))?.userId,user.id);
  assert.equal((await api.resolveApiCaller(new NextRequest('http://localhost/api/v1/fixture')))?.userId,user.id);
  assert.equal((await authOptions.callbacks.jwt({token:{...token}})).uid,token.uid);
  assert.equal((await authOptions.callbacks.jwt({token:{},user:{id:String(user.id),role:'USER'}})).uid,String(user.id));
 };
 const denied=async()=>{
  assert.equal(await authOptions.callbacks.signIn({user:{id:String(user.id)}}),false);
  assert.equal(await access.requireUser(req),null);
  const before=await prisma.apiKey.findUniqueOrThrow({where:{token:key.hash}});
  assert.equal(await api.resolveApiCaller(keyReq),null);
  assert.equal((await prisma.apiKey.findUniqueOrThrow({where:{id:before.id}})).requests,before.requests,'denied keys do not count as successful use');
  assert.equal(await api.resolveApiCaller(new NextRequest('http://localhost/api/v1/fixture')),null);
  await assert.rejects(authOptions.callbacks.jwt({token:{...token}}),/SESSION_REVOKED/);
  await assert.rejects(authOptions.callbacks.jwt({token:{},user:{id:String(user.id),role:'USER'}}),/SESSION_REVOKED/);
 };
 await allowed();
 await record({scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]'});
 await record({startsAt:future,expiresAt:new Date(future.getTime()+60000)});
 await record({expiresAt:past,startsAt:new Date(past.getTime()-60000)});
 await record({userId:other.id});
 await record({capabilities:'["identity.recover"]'});
 await allowed();
 const first=await record(),second=await record({expiresAt:null});await denied();
 await prisma.accessRestriction.update({where:{id:first.id},data:{revokedAt:now,revokedByUserId:other.id,revocationReason:'fixture'}});await denied();
 await prisma.accessRestriction.update({where:{id:second.id},data:{revokedAt:now,revokedByUserId:other.id,revocationReason:'fixture'}});await allowed();
 assert.equal(await restrictions.globalAuthenticationDenied(other.id),true,'full-access staff is not an implicit bypass');
 assert.equal(await restrictions.globalAuthenticationDenied(user.id, future),true,'scheduled denial starts at the exact boundary');
 assert.equal(await restrictions.globalAuthenticationDenied(user.id, new Date(future.getTime()+60000)),false,'expiry is exclusive at the exact boundary');
 unavailable=true;
 await assert.rejects(access.requireUser(req),/storage unavailable/);
 await assert.rejects(api.resolveApiCaller(keyReq),/storage unavailable/);
 await assert.rejects(authOptions.callbacks.jwt({token:{...token}}),/storage unavailable/);unavailable=false;
 await prisma.user.update({where:{id:user.id},data:{status:'BANNED'}});
 assert.equal(await authOptions.callbacks.signIn({user:{id:String(user.id)}}),false);
 assert.equal(await access.requireUser(req),null);assert.equal(await api.resolveApiCaller(keyReq),null);
 assert.equal(await api.resolveApiCaller(new NextRequest('http://localhost/api/v1/fixture')),null);
 console.log('Global authentication: real signed cookie, existing/new JWT callbacks, hashed keys/session fallback, module isolation, overlap/revoke/expiry/start, full-access denial, standing and fail-closed storage passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{await prisma.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await prisma.apiKey.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});}finally{await prisma.$disconnect();}
});
