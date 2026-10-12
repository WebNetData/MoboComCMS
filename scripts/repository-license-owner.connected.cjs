// Real vendor/client owners and PostgreSQL; signing/settings/network are explicit boundary doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient();
const stamp=`license-owner-${Date.now()}`,users=[],products=[],files=[],cache=new Map(),signed=[],disabled=[];
let unavailable=false,responseStatus=200,responseCertificate,settings={};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const db=new Proxy(prisma,{get(target,key){
 if(key==='accessRestriction')return new Proxy(target[key],{get(model,method){if(method==='findMany')return args=>{if(unavailable)throw Error('fixture storage unavailable');return model.findMany(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
function load(relative){
 const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(name==='@/platform/database/prisma')return {db};
  if(name==='@/platform/config/env')return {authSecret:()=> 'owned-license-fixture'};
  if(name==='@/modules/settings/server')return {JsonSettingMutationError:class extends Error{},readJsonSetting:async key=>structuredClone(settings[key]),writeJsonSetting:async(key,value)=>{settings[key]=structuredClone(value)},updateJsonSetting:async(key,work)=>{const value=structuredClone(settings[key]||{}),result=await work(value,{setting:{findUnique:async args=>settings[args.where.key]?{value:JSON.stringify(settings[args.where.key])}:null}});settings[key]=value;return result}};
  if(name==='@/extensions/server/modules')return {moduleGuard:async()=>null};
  if(name==='@/modules/providers/server/panel-credentials')return {encryptPanelCredential:v=>v,decryptPanelCredential:v=>v};
  if(name==='@/modules/wallet/server/wallet')return {moveWallet:()=>{throw Error('Unexpected money mutation')},walletBalance:()=>{throw Error('Unexpected wallet read')}};
  if(name==='@/modules/site/server/site-url')return {siteBaseUrl:async()=> 'https://license-fixture.example.invalid'};
  if(name==='@/modules/updater/server/service')return {currentVersion:()=> '1.0.0'};
  if(name==='@/modules/packages/server/store')return {setPackageEnabled:async(id,enabled)=>disabled.push([id,enabled]),installPackage:()=>{throw Error('Unexpected installation')},loadPackage:async()=>({enabled:true})};
  if(name==='./crypto')return {sha256:hash,signPayload:async certificate=>{signed.push(certificate);return 'fixture-signature'},verifyPayload:()=>true,fingerprintOf:()=> 'fixture',vendorKeys:()=>{throw Error('Unexpected vendor key generation')}};
  if(name.startsWith('@/')&&name.endsWith('.cjs'))return require(path.resolve('src/'+name.slice(2)));if(name.startsWith('@/')){const candidate='src/'+name.slice(2);if(candidate.endsWith('.json'))return JSON.parse(fs.readFileSync(candidate,'utf8'));return load(fs.existsSync(candidate+'.ts')?candidate+'.ts':candidate+'/index.ts')}
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');
  return require(name);
 },mod,mod.exports);return mod.exports;
}
const vendor=load('src/modules/repository/server/vendor.ts'),domain=load('src/modules/repository/domain/repository.ts');
const site='license-fixture.example.invalid',rawKey='MBC-22222-22222-22222-22222',key=domain.normalizeLicenseKey(rawKey);
async function restriction(user,extra={}){return prisma.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp,...extra}})}
async function clear(user){await prisma.accessRestriction.deleteMany({where:{userId:user.id,reason:stamp}})}
async function snapshot(license,product){return {license:await prisma.repoLicense.findUniqueOrThrow({where:{id:license.id}}),activations:await prisma.repoActivation.findMany({where:{licenseId:license.id},orderBy:{id:'asc'}}),product:await prisma.repoProduct.findUniqueOrThrow({where:{id:product.id}})}}
async function main(){
 assert(key,'valid fixture key');
 for(const role of ['CUSTOMER','ADMIN'])users.push(await prisma.user.create({data:{email:`${stamp}-${role}@example.invalid`,passwordHash:'fixture-only',role}}));
 const owner=users[0];
 for(const free of [false,true])products.push(await prisma.repoProduct.create({data:{slug:`${stamp}-${free}`,name:stamp,active:true,priceMinor:free?0n:123n}}));
 const [paid,free]=products,buffer=Buffer.from('owned repository release bytes');
 for(const product of products){const fileId=`${crypto.randomUUID()}.zip`,file=path.resolve('storage/repository',fileId);await fs.promises.mkdir(path.dirname(file),{recursive:true});await fs.promises.writeFile(file,buffer,{flag:'wx'});files.push(file);await prisma.repoRelease.create({data:{productId:product.id,version:'1.0.0',fileId,sha256:hash(buffer),size:buffer.length}})}
 const license=await prisma.repoLicense.create({data:{productId:paid.id,userId:owner.id,email:owner.email,keyHash:hash(`license:${key}`),keyEnc:key,keyLast4:key.slice(-4),paidMinor:123n}});
 const input={key,slug:paid.slug,site},activate=()=>vendor.activateLicense({...input,ipHash:'owned'}),check=()=>vendor.checkLicense(input),deactivate=()=>vendor.deactivateLicense(input),download=()=>vendor.downloadRelease({...input,version:'1.0.0'});
 const initial=await activate();assert.equal(initial.certificate.status,'ACTIVE');assert.equal((await download()).buffer.toString(),buffer.toString());
 const allowed=async()=>{assert.equal((await activate()).certificate.status,'ACTIVE');assert.equal((await check()).certificate.status,'ACTIVE');assert.equal((await download()).buffer.toString(),buffer.toString())};
 const denied=async label=>{for(const [name,call]of [['activation',activate],['certificate',check],['deactivation',deactivate],['paid download',download]]){const before=await snapshot(license,paid),count=signed.length;await assert.rejects(call(),e=>e.status===423&&e.meta?.reason==='account-restricted',label+' '+name);assert.deepEqual(await snapshot(license,paid),before,label+' '+name+' no stored effects');assert.equal(signed.length,count,'no signed access grant')}};
 await restriction(owner,{scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]'});await allowed();await clear(owner);
 await restriction(owner,{startsAt:new Date(Date.now()+60000)});await allowed();await clear(owner);
 await restriction(owner,{startsAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)});await allowed();await clear(owner);
 const global=await restriction(owner),overlap=await restriction(owner);await denied('GLOBAL owner');
 await prisma.accessRestriction.update({where:{id:global.id},data:{revokedAt:new Date()}});await denied('overlapping GLOBAL remains');
 await prisma.accessRestriction.update({where:{id:overlap.id},data:{revokedAt:new Date()}});await allowed();await clear(owner);
 for(const user of users){await prisma.repoLicense.update({where:{id:license.id},data:{userId:user.id}});await restriction(user);await denied(user.role+' is not exempt');await clear(user)}
 await prisma.repoLicense.update({where:{id:license.id},data:{userId:owner.id}});
 await prisma.user.update({where:{id:owner.id},data:{status:'BANNED'}});await denied('standing');
 await prisma.repoLicense.update({where:{id:license.id},data:{userId:null}});await allowed();
 assert.equal((await prisma.repoLicense.findUniqueOrThrow({where:{id:license.id}})).email,owner.email,'unbound email remains non-identity');
 await prisma.repoLicense.update({where:{id:license.id},data:{userId:owner.id,status:'REVOKED'}});
 assert.equal((await check()).certificate.status,'REVOKED','existing bounded invalidation signal survives owner denial');
 await assert.rejects(download(),e=>e.status===403,'revoked release denied');
 await prisma.repoLicense.update({where:{id:license.id},data:{status:'ACTIVE'}});
 await prisma.user.update({where:{id:owner.id},data:{status:'ACTIVE',passwordChangedAt:new Date()}});await allowed();
 unavailable=true;for(const call of [activate,check,deactivate,download]){const before=await snapshot(license,paid),count=signed.length;await assert.rejects(call(),/storage unavailable/);assert.deepEqual(await snapshot(license,paid),before);assert.equal(signed.length,count)}
 assert.equal((await vendor.downloadRelease({slug:free.slug,version:'1.0.0'})).buffer.toString(),buffer.toString(),'free public download needs no identity');unavailable=false;
 await deactivate();assert.equal((await prisma.repoActivation.findFirstOrThrow({where:{licenseId:license.id}})).active,false);await activate();
 // Load the existing client unchanged: 423 must never permanently switch installed packages off.
 process.env.REPOSITORY_ALLOW_PRIVATE='1';
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({certificate:responseCertificate,signature:'fixture-signature'}),{status:responseStatus});
 try{
  settings={'repository.client.v1':{url:'https://vendor.example.invalid',publicKey:'fixture'},'repository.licenses.v1':{[paid.slug]:{keyEnc:key,certificate:initial.certificate,signature:'fixture-signature',state:'active'}}};
  const client=load('src/modules/repository/server/client.ts');
  responseStatus=423;assert.deepEqual(await client.refreshRepositoryLicenses(),{checked:1,revoked:[]});assert.equal(settings['repository.licenses.v1'][paid.slug].state,'unreachable');assert.equal(disabled.length,0);
  responseStatus=200;responseCertificate=initial.certificate;await client.refreshRepositoryLicenses();assert.equal(settings['repository.licenses.v1'][paid.slug].state,'active');assert.equal(disabled.length,0,'restoration never auto-enables packages');
  responseCertificate={...initial.certificate,status:'REVOKED'};assert.deepEqual(await client.refreshRepositoryLicenses(),{checked:1,revoked:[paid.slug]});assert.deepEqual(disabled,[[paid.slug,false]],'genuine revocation still disables');
 }finally{globalThis.fetch=originalFetch}
 console.log('Repository license owner: actual vendor/client/Identity + PostgreSQL; four denied actions/no effects, GLOBAL overlap/revoke/scheduled/expired/module isolation, full ADMIN, standing, unbound grants, password-independent keys, free download, storage failure, REVOKED signal and legacy 423/restoration passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{await prisma.repoProduct.deleteMany({where:{id:{in:products.map(p=>p.id)},slug:{startsWith:stamp}}});await prisma.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)},reason:stamp}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});for(const file of files)await fs.promises.unlink(file)}finally{await prisma.$disconnect()}});
