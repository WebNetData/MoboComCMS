// Real PostgreSQL package/index persistence; theme/catalog boundaries are fixture doubles.
const fs=require('fs'),path=require('path'),ts=require('typescript-api'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient(),id='owned-package-'+Date.now(),key='package.'+id+'.v1',indexKey='packages.index.v1',siteKey='site.config.v1',cache=new Map();let barrier=false,barrierKey=key,arrivals=0,release,gate=Promise.resolve(),indexFault=false,indexBefore,siteBefore,retryAfter;const owned=[id,id+'-b',id+'-theme',id+'-code'];
function wrap(target){return new Proxy(target,{get(target,name){if(name==='$transaction')return async(work,options)=>{let hook;try{return await target.$transaction(async tx=>{const result=await work(wrap(tx));if(retryAfter){hook=retryAfter;retryAfter=null;throw Object.assign(Error('owned serialization retry'),{code:'P2034'})}return result},options)}catch(error){if(hook)await hook();throw error}};if(name==='setting')return new Proxy(target[name],{get(model,method){if(method==='findUnique')return async args=>{const row=await model.findUnique(args);if(barrier&&args.where.key===barrierKey&&arrivals<2){arrivals++;if(arrivals===2)release();await gate}return row};if(method==='upsert')return args=>{if(indexFault&&args.where.key===indexKey)throw Error('owned index failure');return model.upsert(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[name]==='function'?target[name].bind(target):target[name]}})}
const db=wrap(prisma);
function load(relative){const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
 if(name==='@/platform/database/prisma')return{db};if(name==='@/extensions/generated/catalog')return{extensionCatalog:[]};if(name==='@/themes/generated/catalog')return{codeThemeCatalog:[]};if(name==='@/themes/registry')return{bundledThemes:[]};if(name==='@/modules/identity/server/access')return{requirePerm:async()=>null};if(name==='react')return{cache:fn=>fn};if(name==='@/modules/catalog/server/storefront')return{isStoreEnabled:async()=>false};if(name==='@/modules/public-api/server/availability')return{isPublicApiEnabled:async()=>false};
 if(name.startsWith('@/')){const p='src/'+name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'/index.ts')}if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name)
 },mod,mod.exports);return mod.exports}
async function main(){try{
 indexBefore=await prisma.setting.findUnique({where:{key:indexKey}});siteBefore=await prisma.setting.findUnique({where:{key:siteKey}});const owner=load('src/modules/packages/server/store.ts');
 const manifest={id,name:id,kind:'plugin',runtime:'declarative',version:'1.0.0',settings:[{key:'title',label:'Title',type:'text',default:'original'},{key:'caption',label:'Caption',type:'text',default:'original'}]};
 await owner.installEntries(new Map([['manifest.json',Buffer.from(JSON.stringify(manifest))],['a.txt',Buffer.from('old-a')],['b.txt',Buffer.from('old-b')]]),'owned actor');
 assert.equal((await owner.loadPackage(id)).enabled,false,'installation does not activate');
 if(!process.argv.includes('--index-only')){
  barrier=true;gate=new Promise(r=>{release=r});await Promise.all([owner.writePackageFile(id,'a.txt','new-a','owned-a'),owner.writePackageFile(id,'b.txt','new-b','owned-b')]);barrier=false;
  const stored=await owner.loadPackage(id);assert.equal(stored.files['a.txt'].text,'new-a','concurrent edit A survives');assert.equal(stored.files['b.txt'].text,'new-b','concurrent edit B survives');assert.equal(stored.revisions.filter(r=>r.note==='edited').length,2,'both revision histories survive');
 }
 const before=await prisma.setting.findUniqueOrThrow({where:{key}}),index=await prisma.setting.findUniqueOrThrow({where:{key:indexKey}});indexFault=true;
 await assert.rejects(owner.writePackageFile(id,'a.txt','must-rollback','owned-fault'),/owned index failure/);indexFault=false;
 assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),before,'index failure rolls back package bytes/history');assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key:indexKey}}),index);
 async function simultaneous(target,work){barrierKey=target;arrivals=0;barrier=true;gate=new Promise(r=>release=r);try{await work();assert.equal(arrivals,2,'both actual SQL reads overlap')}finally{barrier=false;release?.()}}
 await simultaneous(key,()=>Promise.all([owner.savePackageSettings(id,{title:'changed'}),owner.setPackageEnabled(id,true)]));
 let stored=await owner.loadPackage(id);assert.equal(stored.settings.title,'changed');assert.equal(stored.enabled,true);
 await simultaneous(key,()=>Promise.all([owner.savePackageSettings(id,{title:'second'}),owner.savePackageSettings(id,{caption:'second'})]));
 stored=await owner.loadPackage(id);assert.equal(stored.settings.title,'second');assert.equal(stored.settings.caption,'second');
 const entries=(m,files={})=>new Map([['manifest.json',Buffer.from(JSON.stringify(m))],...Object.entries(files).map(([p,text])=>[p,Buffer.from(text)])]);
 const upgraded=await owner.installEntries(entries({...manifest,version:'1.1.0'},{'a.txt':'upgraded'}),'owned upgrade');assert.equal(upgraded.upgraded,true);assert.equal(upgraded.pkg.enabled,true);assert.equal(upgraded.pkg.settings.title,'second');
 // Different new packages must both join a newly created index.
 await prisma.setting.deleteMany({where:{key:indexKey}});
 await simultaneous(indexKey,()=>Promise.all([owner.installEntries(entries(manifest),'owned reinstall'),owner.installEntries(entries({...manifest,id:id+'-b'}),'owned new')]));
 assert.ok((await owner.packageIds()).includes(id));assert.ok((await owner.packageIds()).includes(id+'-b'));
 const deletionBefore=await prisma.setting.findUniqueOrThrow({where:{key}});indexFault=true;await assert.rejects(owner.deletePackage(id),/owned index failure/);indexFault=false;assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),deletionBefore);
 await owner.deletePackage(id+'-b');assert.equal(await owner.loadPackage(id+'-b'),null);assert.equal((await owner.packageIds()).includes(id+'-b'),false);
 // A retry must not silently restore a different revision after the history shifts.
 await owner.writePackageFile(id,'a.txt','history-one','owned revision');await owner.writePackageFile(id,'a.txt','history-two','owned revision');
 retryAfter=()=>owner.writePackageFile(id,'b.txt','history-shift','owned concurrent revision');
 await assert.rejects(owner.restoreRevision(id,0,'owned restore'),/history changed/);
 assert.equal((await owner.loadPackage(id)).files['a.txt'].text,'history-two');assert.equal((await owner.loadPackage(id)).files['b.txt'].text,'history-shift');
 await owner.restoreRevision(id,1,'owned stable restore');assert.equal((await owner.loadPackage(id)).files['a.txt'].text,'history-one');
 const preservedPackage=await prisma.setting.findUniqueOrThrow({where:{key}}),preservedIndex=await prisma.setting.findUniqueOrThrow({where:{key:indexKey}});
 await prisma.setting.update({where:{key:indexKey},data:{value:'{owned malformed index'}});await assert.rejects(owner.setPackageEnabled(id,false),/index has invalid stored data/);assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),preservedPackage);assert.equal((await prisma.setting.findUniqueOrThrow({where:{key:indexKey}})).value,'{owned malformed index');await prisma.setting.update({where:{key:indexKey},data:{value:preservedIndex.value}});
 // Invalid index shapes must remain raw, just like malformed JSON.
 for(const invalid of [JSON.stringify({ids:[12],rev:1}),JSON.stringify({ids:[id],rev:-1})]){await prisma.setting.update({where:{key:indexKey},data:{value:invalid}});await assert.rejects(owner.setPackageEnabled(id,false),/index has invalid stored data/);assert.equal((await prisma.setting.findUniqueOrThrow({where:{key:indexKey}})).value,invalid);assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key}}),preservedPackage)}await prisma.setting.update({where:{key:indexKey},data:{value:preservedIndex.value}});
 // Two first installs of the same id must resolve through a fresh retry.
 const same={...manifest,id:id+'-b'};let first;
 await simultaneous('package.'+same.id+'.v1',async()=>{first=await Promise.all([owner.installEntries(entries(same),'owned first'),owner.installEntries(entries({...same,version:'1.1.0'}),'owned second')])});
 assert.equal(first.filter(result=>result.upgraded).length,1);assert.equal((await owner.loadPackage(same.id)).revisions.length,2);
 // A concurrent stale enable must never resurrect a successfully deleted package.
 let removing;await simultaneous('package.'+same.id+'.v1',async()=>{removing=await Promise.allSettled([owner.deletePackage(same.id),owner.setPackageEnabled(same.id,true)])});
 assert.equal(removing[0].status,'fulfilled');if(removing[1].status==='rejected')assert.match(removing[1].reason.message,/not installed/);assert.equal(await owner.loadPackage(same.id),null);assert.equal((await owner.packageIds()).includes(same.id),false);
 const corrupt='{owned malformed';await prisma.setting.update({where:{key},data:{value:corrupt}});await assert.rejects(owner.installEntries(entries(manifest),'owned corrupt'),/invalid stored data/);assert.equal((await prisma.setting.findUniqueOrThrow({where:{key}})).value,corrupt);await prisma.setting.update({where:{key},data:{value:deletionBefore.value}});
 // Actual Site Config validation and persistence, no cached rendering document.
 const defaults=load('src/modules/site/config/defaults.ts').defaultSite;await prisma.setting.upsert({where:{key:siteKey},create:{key:siteKey,value:JSON.stringify(defaults)},update:{value:JSON.stringify(defaults)}});
 const theme={...JSON.parse(fs.readFileSync('docs/packages/examples/ocean-theme/manifest.json','utf8')),id:id+'-theme'};
 const originalSite=await prisma.setting.findUniqueOrThrow({where:{key:siteKey}});indexFault=true;await assert.rejects(owner.installEntries(entries(theme,{'theme.css':'p {color:red}'}),'owned theme'),/owned index failure/);indexFault=false;assert.equal(await owner.loadPackage(theme.id),null);assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key:siteKey}}),originalSite);
 await owner.installEntries(entries(theme,{'theme.css':'p {color:red}'}),'owned theme');await owner.activateTheme(theme.id);assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key:siteKey}})).value).themeId,theme.id);
 const activeSite=await prisma.setting.findUniqueOrThrow({where:{key:siteKey}});indexFault=true;await assert.rejects(owner.deletePackage(theme.id),/owned index failure/);indexFault=false;assert.deepEqual(await prisma.setting.findUniqueOrThrow({where:{key:siteKey}}),activeSite);assert.ok(await owner.loadPackage(theme.id));
 await owner.deletePackage(theme.id);assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({where:{key:siteKey}})).value).themeId,'clean');
 await prisma.setting.update({where:{key:siteKey},data:{value:corrupt}});await assert.rejects(owner.installEntries(entries(theme,{'theme.css':''}),'owned corrupt site'),/invalid stored data/);assert.equal((await prisma.setting.findUniqueOrThrow({where:{key:siteKey}})).value,corrupt);assert.equal(await owner.loadPackage(theme.id),null);
 const code={...manifest,id:id+'-code',runtime:'code',apiVersion:1};const applied=(await owner.installEntries(entries(code,{'src/a.ts':'export const a=1'}),'owned code')).pkg;await owner.writePackageFile(code.id,'src/a.ts','export const a=2','owned edit');await assert.rejects(owner.markCodeApplied(code.id,'owned apply','owned external snapshot',applied),/changed during apply/);assert.equal((await owner.loadPackage(code.id)).codeStatus,'staged');
 await owner.markCodeApplied(code.id,'owned apply','owned same snapshot',await owner.loadPackage(code.id));assert.equal((await owner.loadPackage(code.id)).codeStatus,'applied');
 console.log('Actual PG package integrity: overlapping files/history, settings/enabled, settings fields and first index creation; upgrade preservation; package/theme rollback; corrupt bytes preserved; code snapshot guard.');
 }finally{barrier=false;indexFault=false;release?.();await prisma.setting.deleteMany({where:{key:{in:owned.map(id=>'package.'+id+'.v1')}}});for(const [key,row]of[[indexKey,indexBefore],[siteKey,siteBefore]]){if(row)await prisma.setting.upsert({where:{key},create:{key,value:row.value},update:{value:row.value}});else await prisma.setting.deleteMany({where:{key}})}await prisma.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
