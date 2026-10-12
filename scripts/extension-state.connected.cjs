// Actual PostgreSQL and canonical state owner; owned fixture settings restored in finally.
const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const single=process.argv.includes('--single-connection');if(single){const u=new URL(process.env.DATABASE_URL);u.searchParams.set('connection_limit','1');u.searchParams.set('pool_timeout','2');process.env.DATABASE_URL=u.toString()}
const dependencyManifests=['vpn','reseller','remnawave-control'].map(id=>JSON.parse(fs.readFileSync('src/plugins/'+id+'/manifest.json','utf8')));
const db=new PrismaClient(),cache=new Map(),keys=['extension.store.state.v1','storeEnabled',...dependencyManifests.flatMap(m=>['extension.'+m.id+'.state.v1',...(m.stateSetting?[m.stateSetting]:[])])];let barrier=false,arrivals=0,release,fault=false;
let gate=Promise.resolve();
function wrap(client){return new Proxy(client,{get(object,key){
 if(key==='$transaction')return(work,options)=>object.$transaction(tx=>work(wrap(tx)),options);
 if(key==='setting')return new Proxy(object[key],{get(model,method){if(method==='upsert')return async args=>{if(fault&&args.where.key==='storeEnabled')throw Error('owned mirror failure');if(barrier&&args.where.key===keys[0]&&arrivals<2){arrivals++;if(arrivals===2)release();await gate}return model.upsert(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});
 return typeof object[key]==='function'?object[key].bind(object):object[key];
}})}
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText)(name=>{if(name==='@/platform/database/prisma')return{db:wrap(db)};if(name==='@/extensions/generated/server-registry')return{serverPlugins:{}};if(name.startsWith('@/')){const p='src/'+name.slice(2);return name.endsWith('.json')?require(path.resolve(p)):load(fs.existsSync(p+'.ts')?p+'.ts':p+'/index.ts')}return require(name)},mod,mod.exports);return mod.exports}
async function main(){assert.match(process.env.DATABASE_URL||'',/^postgres/);const before=await db.setting.findMany({where:{key:{in:keys}}}),owner=load('src/extensions/server/state.ts');try{
 for(const missing of process.argv.includes('--mirror-only')?[]:[false,true]){
  await db.setting.deleteMany({where:{key:{in:keys}}});await db.setting.create({data:{key:'storeEnabled',value:'false'}});if(!missing)await db.setting.create({data:{key:keys[0],value:JSON.stringify({enabled:false,settings:{}})}});
  arrivals=0;barrier=!single;gate=new Promise(resolve=>{release=resolve});
  await Promise.all([owner.saveExtensionState('store',{settings:{'seo.title':'owned title'}}),owner.saveExtensionState('store',{settings:{'seo.description':'owned description'}})]);barrier=false;
  const saved=JSON.parse((await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value);assert.equal(saved.settings['seo.title'],'owned title','concurrent title retained');assert.equal(saved.settings['seo.description'],'owned description','concurrent description retained');assert.equal(saved.enabled,false);if(!single)assert.equal(arrivals,2);
 }
 const snapshot=await db.setting.findMany({where:{key:{in:keys}},orderBy:{key:'asc'}});fault=true;try{await assert.rejects(owner.saveExtensionState('store',{settings:{'seo.title':'must roll back'}}),/owned mirror failure/)}finally{fault=false}
 assert.deepEqual(await db.setting.findMany({where:{key:{in:keys}},orderBy:{key:'asc'}}),snapshot,'mirror failure rolls back both rows');
 await assert.rejects(owner.saveExtensionState('store',{settings:{unknown:'x'}}),/unknown|ناشناخته/);
 if(!process.argv.includes('--mirror-only')){
  for(const m of dependencyManifests){const key='extension.'+m.id+'.state.v1',value=JSON.stringify({enabled:m.id==='remnawave-control',settings:{}});await db.setting.upsert({where:{key},create:{key,value},update:{value}});if(m.stateSetting)await db.setting.upsert({where:{key:m.stateSetting},create:{key:m.stateSetting,value:'false'},update:{value:'false'}})}
  await assert.rejects(owner.saveExtensionState('reseller',{enabled:true}),/VPN/);
  await owner.saveExtensionState('remnawave-control',{settings:{'batch-size':7}});assert.equal(JSON.parse((await db.setting.findUniqueOrThrow({where:{key:'extension.remnawave-control.state.v1'}})).value).enabled,true);assert.equal((await owner.getExtensionState('remnawave-control')).enabled,false);
  await owner.saveExtensionState('vpn',{enabled:true});assert.equal((await owner.getExtensionState('remnawave-control')).enabled,true);
  await assert.rejects(owner.saveExtensionState('vpn',{enabled:false}),/RemnaWave/);await owner.saveExtensionState('remnawave-control',{enabled:false});await owner.saveExtensionState('vpn',{enabled:false});
 }
 console.log('Extension state: actual PG, concurrent existing/first row settings retained, atomic mirror failure rollback, invalid field refused'+(single?' (single connection)':''));
 }finally{barrier=false;fault=false;for(const key of keys){const row=before.find(r=>r.key===key);if(row)await db.setting.upsert({where:{key},create:{key,value:row.value},update:{value:row.value}});else await db.setting.deleteMany({where:{key}})}await db.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
