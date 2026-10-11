// Actual Identity/controller/storage/audit SQL; JWT decoding/catalog/unused code-apply doubled.
const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server');
if(!process.argv.some(x=>x.startsWith('--case='))){
 const cp=require('node:child_process');
 for(const op of['activate','deactivate','refresh'])for(const mode of['unrelated','replacement','removed','authority','module','site','config','corrupt','audit']){
  const run=cp.spawnSync(process.execPath,[__filename,...process.argv.slice(2),'--case='+op,'--mode='+mode],{stdio:'inherit',env:process.env});
  if(run.status!==0)process.exit(run.status||1);
 }
 for(const mode of['first','existing']){const run=cp.spawnSync(process.execPath,[__filename,...process.argv.slice(2),'--case=concurrent','--mode='+mode],{stdio:'inherit',env:process.env});if(run.status!==0)process.exit(run.status||1);}
 for(const mode of['revoked','revoked-audit']){const run=cp.spawnSync(process.execPath,[__filename,...process.argv.slice(2),'--case=refresh','--mode='+mode],{stdio:'inherit',env:process.env});if(run.status!==0)process.exit(run.status||1);}
 const empty=cp.spawnSync(process.execPath,[__filename,...process.argv.slice(2),'--case=deactivate','--mode=empty'],{stdio:'inherit',env:process.env});if(empty.status!==0)process.exit(empty.status||1);
 for(const mode of['subject-product','subject-site','revoked-subject-product','revoked-subject-site','signed-revoked','expired-certificate']){const run=cp.spawnSync(process.execPath,[__filename,...process.argv.slice(2),'--case=refresh','--mode='+mode],{stdio:'inherit',env:process.env});if(run.status!==0)process.exit(run.status||1);}
 console.log('All38 current Repository license map scenarios passed');process.exit(0);
}
if(process.argv.includes('--single-connection')){const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');process.env.DATABASE_URL=url.toString()}
const prisma=new PrismaClient(),id='owned-entitlement-'+Date.now(),key='package.'+id+'.v1',themeId=id+'-theme',themeKey='package.'+themeId+'.v1',indexKey='packages.index.v1',policyKey='security.policy.v1',siteKey='site.config.v1',cache=new Map(),authAt=Date.now()-5000;let actor,indexBefore,policyBefore,siteBefore,auditFault=false,receiptFault=false,race=false,raceReads=0,raceRelease,raceBarrier;
function wrap(target,inTx=false){return new Proxy(target,{get(target,name){if(name==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx,true)),options);if(name==='setting')return new Proxy(target[name],{get(model,method){if(method==='findUnique'&&inTx)return async args=>{const result=await model.findUnique(args);if(race&&args.where.key===indexKey&&raceReads<2){raceReads++;if(raceReads===2)raceRelease();await raceBarrier}return result};if(method==='upsert')return args=>{if(receiptFault&&args.where.key==='repository.installed.v1')throw Error('owned receipt write failure');return model.upsert(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});if(name==='auditLog')return new Proxy(target[name],{get(model,method){if(method==='create')return args=>{if(auditFault)throw Error('owned CRUD audit failure');return model.create(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[name]==='function'?target[name].bind(target):target[name]}})}const db=wrap(prisma);
function load(relative){const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
 if(name==='@/platform/database/prisma')return{db};if(name==='next-auth/jwt')return{getToken:async()=>({uid:actor.id,authAt})};if(name==='@/platform/config/env')return{authSecret:()=> 'owned-jwt-decoder-fixture'};if(name==='@/extensions/generated/catalog')return{extensionCatalog:[require('../src/plugins/repository/manifest.json')],extensionById:new Map([['repository',require('../src/plugins/repository/manifest.json')]]),extensionPermissionIds:[]};if(name==='@/themes/generated/catalog')return{codeThemeCatalog:[]};if(name==='@/themes/registry')return{bundledThemes:[]};if(name==='react')return{cache:fn=>file.endsWith('/extensions/server/modules.ts')?(()=>{let captured;return(...args)=>captured??=(fn(...args))})():fn};if(name==='@/modules/catalog/server/storefront')return{isStoreEnabled:async()=>false};if(name==='@/modules/public-api/server/availability')return{isPublicApiEnabled:async()=>false};if(name==='@/modules/packages/server/code-apply')return{};if(name==='@/platform/observability/logger')return{logEvent:()=>{},requestIdFrom:()=>id};
 if(name==='@/platform/cache/kv')return{cached:async(key,ttl,work)=>work(),invalidate:async()=>{}};if(name==='@/modules/updater/server/service')return{currentVersion:()=>require('../package.json').version};if(name==='@/modules/repository/server/vendor')return{};if(name==='@/modules/providers/server/panel-credentials')return{encryptPanelCredential:x=>x,decryptPanelCredential:x=>x};if(name.startsWith('@/')){const p='src/'+name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'/index.ts')}if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name)
 },mod,mod.exports);return mod.exports}
async function main(){const licenseKey='repository.licenses.v1',configKey='repository.client.v1',moduleKey='extension.repository.state.v1',siteKey='siteUrl',snapshots=new Map(),oldFetch=global.fetch,oldPrivate=process.env.REPOSITORY_ALLOW_PRIVATE;const selected=process.argv.find(x=>x.startsWith('--case='))?.slice(7)||'deactivate',mode=process.argv.find(x=>x.startsWith('--mode='))?.slice(7)||'unrelated';try{
for(const k of[licenseKey,configKey,moduleKey,siteKey,policyKey,indexKey])snapshots.set(k,await prisma.setting.findUnique({where:{key:k}}));const {generateKeyPairSync,sign}=require('node:crypto'),pair=generateKeyPairSync('ed25519'),pem=pair.publicKey.export({type:'spki',format:'pem'}).toString(),domain=load('src/modules/repository/domain/repository.ts'),http=load('src/modules/repository/server/http/admin.ts');const cert=domain.buildCertificate({licenseId:12345,product:id,site:'owned.invalid',status:'ACTIVE',updatesUntil:new Date(Date.now()+86400000),now:new Date()}),stored={keyEnc:'MBC-AAAAA-AAAAA-AAAAA-AAAAA',certificate:cert,signature:sign(null,Buffer.from(domain.canonicalJson(cert)),pair.privateKey).toString('base64url'),checkedAt:new Date().toISOString(),state:'active'},other={...stored,certificate:{...cert,product:id+'-other'}};async function setting(key,value){await prisma.setting.upsert({where:{key},create:{key,value},update:{value}})}
await setting(configKey,JSON.stringify({url:'https://repo.example.invalid',publicKey:pem,name:id,connectedAt:new Date().toISOString()}));await setting(moduleKey,'{"enabled":true,"settings":{}}');await setting(siteKey,'https://owned.invalid');await setting(policyKey,'{"requireAdmin2fa":false}');await setting(licenseKey,JSON.stringify({[id]:stored}));actor=await prisma.user.create({data:{email:id+'@example.invalid',passwordHash:'owned fixture',role:'ADMIN'}});process.env.REPOSITORY_ALLOW_PRIVATE='1';let reached=false;
if(mode==='empty'){
 await setting(licenseKey,'{}');let providerCalled=false;global.fetch=async()=>{providerCalled=true;throw Error('unexpected provider call');};
 const response=await http.POST_client(new NextRequest('http://owned.invalid/api/admin/repository/client',{method:'POST',headers:{origin:'http://owned.invalid','content-type':'application/json'},body:JSON.stringify({op:'deactivate',slug:id})}));
 assert.equal(response.status,200);assert.equal(providerCalled,false);assert.equal(await prisma.auditLog.count({where:{actorUserId:actor.id,action:'repository.client.deactivate'}}),1,'existing no-op audit contract retained');assert.equal((await prisma.setting.findUniqueOrThrow({where:{key:licenseKey}})).value,'{}');console.log('Actual no-op deactivation audit retained');return;
}
if(selected==='concurrent'){
 const ownedKey='owned.repository-map.'+id,{updateJsonSetting}=load('src/modules/settings/server.ts');
 try {
  if(mode==='existing')await setting(ownedKey,'{"base":"retained"}');
  let reads=0,release;const barrier=new Promise(resolve=>{release=resolve;});
  const update=label=>updateJsonSetting(ownedKey,async value=>{reads++;if(!process.argv.includes('--single-connection')&&reads<=2){if(reads===2)release();await barrier;}value[label]=label;return label;});
  const values=process.argv.includes('--single-connection')?[await update('a'),await update('b')]:await Promise.all([update('a'),update('b')]);
  assert.deepEqual(values,['a','b']);const row=JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key:ownedKey}})).value);
  assert.deepEqual(row,mode==='existing'?{base:'retained',a:'a',b:'b'}:{a:'a',b:'b'});
  if(!process.argv.includes('--single-connection'))assert.ok(reads>2,'actual conflict re-executes current callback');
  console.log('Actual shared Settings '+mode+' '+(process.argv.includes('--single-connection')?'serial one-connection':'overlapping conflict retry')+' passed');
 } finally {await prisma.setting.deleteMany({where:{key:ownedKey}});}
 return;
}
let beforeCommit,packageBefore;
if(mode.startsWith('revoked')||mode.startsWith('subject-')||mode==='signed-revoked'||mode==='expired-certificate'){
 const packages=load('src/modules/packages/server/store.ts');
 await packages.installEntries(new Map([['manifest.json',Buffer.from(JSON.stringify({id,name:id,kind:'plugin',runtime:'declarative',version:'1.0.0'}))]]),actor.email);
 await packages.setPackageEnabled(id,true);packageBefore=await prisma.setting.findUniqueOrThrow({where:{key}});
}
global.fetch=async(url)=>{
 assert.equal(new URL(url).origin,'https://repo.example.invalid');reached=true;
 const current={[id]:stored,[id+'-other']:other};
 if(mode==='replacement')current[id]={...stored,keyEnc:'MBC-BBBBB-BBBBB-BBBBB-BBBBB'};
 if(mode==='removed')delete current[id];
 await setting(licenseKey,mode==='corrupt'?'{owned-corrupt':JSON.stringify(current));
 if(mode==='authority')await prisma.user.update({where:{id:actor.id},data:{status:'SUSPENDED'}});
 if(mode==='module')await setting(moduleKey,'{"enabled":false,"settings":{}}');
 if(mode==='site')await setting(siteKey,'https://other.invalid');
 if(mode==='config'){const config=JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key:configKey}})).value);config.connectedAt+='-replaced';await setting(configKey,JSON.stringify(config));}
 if(mode==='audit'||mode==='revoked-audit')auditFault=true;
 beforeCommit=(await prisma.setting.findUniqueOrThrow({where:{key:licenseKey}})).value;
 if(mode.includes('subject-')||mode==='signed-revoked'||mode==='expired-certificate'){
  const certificate={...cert};
  if(mode.endsWith('product'))certificate.product=id+'-other';
  if(mode.endsWith('site'))certificate.site='other.invalid';
  if(mode.startsWith('revoked')||mode==='signed-revoked')certificate.status='REVOKED';
  if(mode==='expired-certificate')certificate.expiresAt=new Date(Date.now()-86400000).toISOString();
  return Response.json({certificate,signature:sign(null,Buffer.from(domain.canonicalJson(certificate)),pair.privateKey).toString('base64url')});
 }
 return mode.startsWith('revoked')?Response.json({error:'owned revocation'},{status:403}):Response.json({certificate:cert,signature:stored.signature});
};
const invoke=()=>http.POST_client(new NextRequest('http://owned.invalid/api/admin/repository/client',{method:'POST',headers:{origin:'http://owned.invalid','content-type':'application/json'},body:JSON.stringify({op:selected,slug:id,key:stored.keyEnc})}));
const denied=['authority','module','site','config','corrupt','audit','revoked-audit'].includes(mode)||(['replacement','removed'].includes(mode)&&selected!=='refresh');
if(mode==='audit'||mode==='revoked-audit')await assert.rejects(invoke(),/owned CRUD audit failure/);
else {const response=await invoke();assert.equal(response.status,denied?(mode==='authority'?403:mode==='module'?404:409):200,selected+' '+mode+' current commit result');}
assert.equal(reached,true);
const after=(await prisma.setting.findUniqueOrThrow({where:{key:licenseKey}})).value;
if(denied)assert.equal(after,beforeCommit,'rejected command preserves current map');
else {
 const map=JSON.parse(after);assert.deepEqual(map[id+'-other'],other,'concurrent unrelated license entry retained');
 if(['replacement','removed'].includes(mode))assert.equal(JSON.stringify(map[id]),JSON.stringify(JSON.parse(beforeCommit)[id]),'refresh skips changed key/removal');
 else if(selected==='deactivate')assert.equal(map[id],undefined);
}
assert.equal(await prisma.auditLog.count({where:{actorUserId:actor.id,action:'repository.client.'+selected}}),denied?0:1,'one atomic success audit');
if(mode==='revoked-audit')assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),packageBefore,'package revocation rolls back with failed strict audit');
if(mode==='revoked'){assert.equal(JSON.parse(after)[id].state,'revoked');assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key}})).value).enabled,false,'actual package disabled atomically');}
if(mode.includes('subject-')){
 assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key}})).value).enabled,true,'wrong signed subject must not revoke this package');
 assert.deepEqual(JSON.parse(after)[id].certificate,cert,'wrong signed subject never replaces current certificate');
 assert.equal(JSON.parse(after)[id].signature,stored.signature);assert.equal(JSON.parse(after)[id].state,'unreachable');
 assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),packageBefore,'wrong signed subject never disables current package');
}
if(mode==='signed-revoked'){assert.equal(JSON.parse(after)[id].state,'revoked');assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key}})).value).enabled,false);}
if(mode==='expired-certificate'){assert.equal(JSON.parse(after)[id].state,'active');assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),packageBefore,'offline expiry alone does not disable package');}
console.log('Actual repository license map '+selected+' '+mode+' passed');
} finally {
 global.fetch=oldFetch;
 try { if(actor)await prisma.auditLog.deleteMany({where:{actorUserId:actor.id}}); }
 finally {
  try {
   await prisma.setting.deleteMany({where:{key}});
   for(const[k,row]of snapshots){if(row)await prisma.setting.upsert({where:{key:k},create:{key:k,value:row.value},update:{value:row.value}});else await prisma.setting.deleteMany({where:{key:k}});}
  } finally {
   if(actor)await prisma.user.deleteMany({where:{id:actor.id,email:actor.email}});
   if(oldPrivate===undefined)delete process.env.REPOSITORY_ALLOW_PRIVATE;else process.env.REPOSITORY_ALLOW_PRIVATE=oldPrivate;
   await prisma.$disconnect();
  }
 }
}}
main().catch(error=>{console.error(error);process.exitCode=1});
