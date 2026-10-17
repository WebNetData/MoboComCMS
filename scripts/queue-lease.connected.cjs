const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient(),stamp='queue-lease-'+Date.now(),ids=[];let calls=0,release,started,dedupeRace=false;let hold=Promise.resolve(),entered=Promise.resolve(),failOld=false;
const jobs=new Proxy(prisma.backgroundJob,{get(target,key){if(key==='findUnique')return async args=>{const row=await target.findUnique(args);if(dedupeRace&&args.where.dedupeKey===stamp+'-dedupe'){dedupeRace=false;assert.equal(await mod.exports.retryJob(row.id),true)}return row};if(['findFirst','updateMany','deleteMany'].includes(key))return args=>target[key]({...args,where:{...args.where,id:args.where?.id??{in:ids}}});return typeof target[key]==='function'?target[key].bind(target):target[key]}});
const db=new Proxy(prisma,{get(target,key){return key==='backgroundJob'?jobs:typeof target[key]==='function'?target[key].bind(target):target[key]}});
const modules=new Map(),path=require('node:path');
function load(file){const full=path.resolve(file);if(modules.has(full))return modules.get(full);const mod={exports:{}};modules.set(full,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{
 if(name==='@/platform/database/prisma')return{db};if(name==='@/platform/observability/logger')return{logEvent:()=>{}};
 if(name==='@/modules/site/server/images')return{clearImageCache:async()=>{calls++;if(calls===1){started();await hold;if(failOld)throw Error('owned old failure');return{owner:'old'}}return{owner:'new'}}};if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts').exports;if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name)+'.ts').exports;return require(name);
},mod,mod.exports);return mod}
const mod=load('src/modules/operations/server/queue.ts');
async function main(){try{for(const failure of [false,true]){
 calls=0;failOld=failure;hold=new Promise(r=>{release=r});entered=new Promise(r=>{started=r});
 const row=await prisma.backgroundJob.create({data:{kind:'images.clear-cache',dedupeKey:stamp+'-'+failure}});ids.push(row.id);
 const old=mod.exports.runQueue(2000);await entered;
 await prisma.backgroundJob.update({where:{id:row.id},data:{lockedAt:new Date(Date.now()-11*60000)}});
 await mod.exports.runQueue(2000);const winner=await prisma.backgroundJob.findUniqueOrThrow({where:{id:row.id}});assert.equal(winner.status,'DONE');assert.equal(winner.attempts,2);assert.equal(winner.result,'{"owner":"new"}');
 release();await old;assert.deepEqual(await prisma.backgroundJob.findUniqueOrThrow({where:{id:row.id}}),winner,'late '+(failure?'failure':'success')+' cannot overwrite the current lease');
 }
 const terminal=await prisma.backgroundJob.create({data:{kind:'images.clear-cache',dedupeKey:stamp+'-dedupe',status:'FAILED',attempts:5}});ids.push(terminal.id);dedupeRace=true;
 const queued=await mod.exports.enqueue('images.clear-cache',{}, {dedupeKey:stamp+'-dedupe'});if(!ids.includes(queued.id))ids.push(queued.id);assert.equal(queued.id,terminal.id,'concurrent retry keeps its active dedupe key');assert.equal((await prisma.backgroundJob.findUniqueOrThrow({where:{id:terminal.id}})).dedupeKey,stamp+'-dedupe');
 console.log('Actual PostgreSQL two workers: recovered lease result retained after late success/failure; concurrent retry retains active dedupe key');
 }finally{release?.();await prisma.backgroundJob.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
