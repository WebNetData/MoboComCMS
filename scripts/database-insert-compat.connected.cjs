// Actual owner services on PostgreSQL or SQLite; isolated rows, no .env or pre-existing data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient(),seed=`insert-compat-${Date.now()}`;
process.env.STORE_DELIVERY_KEY ||= 'ab'.repeat(32);
let product; const users=[],cursor=new Map();
const db=new Proxy(prisma,{get(target,key){
  if(key==='setting')return {findUnique:async({where})=>cursor.has(where.key)?{value:cursor.get(where.key)}:null,upsert:async({where,update})=>cursor.set(where.key,update.value)};
  if(key==='userNotification')return new Proxy(target.userNotification,{get(model,method){return method==='groupBy'?args=>model.groupBy({...args,where:{AND:[args.where,{userId:{in:users}}]}}):typeof model[method]==='function'?model[method].bind(model):model[method]}});
  return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
const mocks={
 '@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},
 '@/modules/settings/server':{readJsonSetting:async()=>({digest:{enabled:true,hour:9}})},
 '@/modules/notifications/server/inbox':{createInboxEvent:async()=>{}},
 '@/modules/store/server/orders':{transitionOrder:async()=>{}},
};
const cache=new Map();
function load(file){
 const full=path.resolve(file.endsWith('.ts')?file:fs.existsSync(file+'.ts')?file+'.ts':path.join(file,'index.ts'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name.startsWith('@/'))return load('src/'+name.slice(2));
  if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name));
  return require(name);
 },mod,mod.exports);return mod.exports;
}
async function main(){
 product=await prisma.product.create({data:{slug:seed,name:seed,kind:'VIRTUAL',digitalMode:'CODES',stock:0,price:1000,priceMinor:1000n,currency:'IRT',approval:'APPROVED'}});
 const codes=load('src/modules/store/server/digital-codes.ts');
 const text=Array.from({length:151},(_,i)=>`${seed}-code-${i}`).join('\n');
 assert.equal((await codes.addCodes({productId:product.id,text})).added,151,'chunk boundary inserts every code');
 const before=await prisma.productDigitalCode.findMany({where:{productId:product.id},orderBy:{id:'asc'}});
 const duplicate=await codes.addCodes({productId:product.id,text});
 assert.equal(duplicate.added,0);assert.equal(duplicate.existing,151);
 assert.deepEqual(await prisma.productDigitalCode.findMany({where:{productId:product.id},orderBy:{id:'asc'}}),before,'conflicts never replace encrypted codes or historical rows');
 assert.equal((await prisma.product.findUniqueOrThrow({where:{id:product.id}})).stock,151);
 const now=new Date('2026-10-07T06:30:00Z');
 for(let i=0;i<151;i++){
  const user=await prisma.user.create({data:{email:`${seed}-${i}@example.invalid`,passwordHash:'test-only'}});users.push(user.id);
  await prisma.userNotification.create({data:{userId:user.id,kind:'ANNOUNCEMENT',dedupeKey:`${seed}-${i}`,titleEn:'fixture',titleFa:'آزمون',href:'/dashboard',createdAt:new Date(now.getTime()-2*3600000)}});
 }
 const policy=load('src/modules/notifications/server/policy.ts');
 assert.equal((await policy.queueInboxDigests(now,200)).queued,151,'digest chunk boundary queues each member');
 const mine={dedupeKey:{in:users.map(id=>`notification-digest:${id}:2026-10-07`)}};
 const jobs=await prisma.backgroundJob.findMany({where:mine,orderBy:{id:'asc'}});assert.equal(jobs.length,151);
 cursor.clear();assert.equal((await policy.queueInboxDigests(now,200)).queued,0,'replayed cursor does not duplicate jobs');
 assert.deepEqual(await prisma.backgroundJob.findMany({where:mine,orderBy:{id:'asc'}}),jobs,'deduplication preserves queued payloads and state');
 console.log('Portable owner inserts: chunk boundaries, exact added counts, immutable duplicate codes and digest replay passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{
  await prisma.backgroundJob.deleteMany({where:{dedupeKey:{in:users.map(id=>`notification-digest:${id}:2026-10-07`)}}});
  await prisma.userNotification.deleteMany({where:{userId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users},email:{startsWith:seed}}});
  if(product){await prisma.productDigitalCode.deleteMany({where:{productId:product.id}});await prisma.product.delete({where:{id:product.id}});}
 }finally{await prisma.$disconnect();}
});
