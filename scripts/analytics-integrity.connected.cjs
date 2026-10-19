// Actual analytics owner + PostgreSQL/SQLite; unique fixture days, no .env or existing rows.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api');
const clientModule=process.env.ANALYTICS_TEST_CLIENT||'@prisma/client';
const {PrismaClient,Prisma}=require(clientModule);
const nativeErrors=[],logs=[],prisma=new PrismaClient({log:[{emit:'event',level:'error'}]});
prisma.$on('error',event=>nativeErrors.push(event));
const seed=`analytics-${Date.now()}-${require('node:crypto').randomUUID()}`,days=[];
let day=seed,enabled=true,faultAt=0,transactions=0,batchCalls=0;
const db=new Proxy(prisma,{get(target,key){
 if(key==='$executeRaw')return (...args)=>{
  if(faultAt&&++batchCalls===faultAt)return target.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsDaily" ("day","path","views","visitors") VALUES (${day},'/fault',NULL,0)`);
  return target.$executeRaw(...args);
 };
 if(key==='$transaction')return (work,...options)=>{transactions++;batchCalls=0;
  if(Array.isArray(work))return target.$transaction(work,...options);
  return target.$transaction(async tx=>{
  let calls=0;return work(new Proxy(tx,{get(client,name){
   if(name==='$executeRaw')return async(...args)=>{
    if(faultAt&&++calls===faultAt)return client.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsDaily" ("day","path","views","visitors") VALUES (${day},'/fault',NULL,0)`);
    return client.$executeRaw(...args);
   };
   return typeof client[name]==='function'?client[name].bind(client):client[name];
  }}));
 },...options)};
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
const mocks={
 '@/platform/database/prisma':{db},'@/extensions/server/modules':{isModuleEnabled:async()=>enabled},
 '@/shared/time/day':{tehranDay:()=>day},'@/platform/config/env':{authSecret:()=>`fixture-only-${seed}`},
 '@/platform/http/rate-limit':{clientIp:headers=>headers.get('x-forwarded-for')||'127.0.0.1',rateLimitHit:()=>({ok:true})},
 '@/platform/observability/logger':{logEvent:(...args)=>logs.push(args)},
 '@/modules/identity/server/admin-guard':{},'@/modules/analytics/server/dashboard':{},
};
const cache=new Map();function load(file){
 const full=path.resolve(file.endsWith('.ts')?file:file+'.ts');if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',compiled)(name=>Object.hasOwn(mocks,name)?mocks[name]:name==='@prisma/client'?require(clientModule):name.startsWith('@/')?load('src/'+name.slice(2)):require(name),mod,mod.exports);
 return mod.exports;
}
function nextDay(label){day=seed+'-'+label;days.push(day);return day;}
const headers=new Headers({'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0','x-forwarded-for':'192.0.2.10'});
const input={path:'/music/'+seed,referrer:'',headers,host:'e2e.invalid'};
async function empty(){
 assert.equal(await prisma.analyticsVisitor.count({where:{day}}),0);
 assert.equal(await prisma.analyticsDaily.count({where:{day}}),0);
 assert.equal(await prisma.analyticsDimension.count({where:{day}}),0);
}
async function main(){
 // Match the canonical local SQLite client; PostgreSQL needs no PRAGMA setup.
 if(process.env.DATABASE_URL?.startsWith('file:')){
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
 }
 const collect=load('src/modules/analytics/server/collect.ts');
 nextDay('ignored');enabled=false;assert.equal(await collect.recordPageview(input),false);await collect.recordSearch('ignored',0);enabled=true;
 assert.equal(await collect.recordPageview({...input,path:'/admin/private'}),false);
 assert.equal(await collect.recordPageview({...input,headers:new Headers({'user-agent':'Googlebot'})}),false);
 assert.equal(transactions,0);await empty();
 nextDay('concurrent');
 await prisma.analyticsDaily.create({data:{day,path:'*',views:90,visitors:12}});
 await prisma.analyticsDimension.create({data:{day,dim:'device',value:'desktop',count:9}});
 assert.ok((await Promise.all(Array.from({length:24},()=>collect.recordPageview(input)))).every(Boolean));
 const total=await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}});
 assert.equal(total.views,114);assert.equal(total.visitors,13,'one new daily visitor, historical aggregates preserved');
 assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:input.path}}})).views,24);
 assert.equal(await prisma.analyticsVisitor.count({where:{day}}),1);
 assert.equal((await prisma.analyticsDimension.findUniqueOrThrow({where:{day_dim_value:{day,dim:'device',value:'desktop'}}})).count,10);
 assert.equal((await prisma.analyticsDimension.findUniqueOrThrow({where:{day_dim_value:{day,dim:'landing',value:input.path.slice(0,120)}}})).count,1);
 const first=await prisma.analyticsVisitor.findFirstOrThrow({where:{day}});assert.match(first.hash,/^[a-f0-9]{20}$/);
 assert.equal(nativeErrors.length,0,'ordinary duplicate visits never emit database constraint errors');
 const secondHeaders=new Headers(headers);secondHeaders.set('x-forwarded-for','192.0.2.11');
 await collect.recordPageview({...input,headers:secondHeaders});assert.equal(await prisma.analyticsVisitor.count({where:{day}}),2);
 assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}})).visitors,14);
 nextDay('rotation');await collect.recordPageview(input);
 assert.notEqual((await prisma.analyticsVisitor.findFirstOrThrow({where:{day}})).hash,first.hash,'daily rotating hash retained');
 nextDay('distinct-concurrent');
 await Promise.all(Array.from({length:24},(_,i)=>{
  const visitorHeaders=new Headers(headers);visitorHeaders.set('x-forwarded-for',`192.0.2.${30+i}`);
  return collect.recordPageview({...input,path:`/games/${seed}/${i%6}`,headers:visitorHeaders});
 }));
 const distinctTotal=await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}});
 assert.equal(distinctTotal.views,24);assert.equal(distinctTotal.visitors,24);
 assert.equal(await prisma.analyticsVisitor.count({where:{day}}),24);
 for(let i=0;i<6;i++){
  assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:`/games/${seed}/${i}`}}})).views,4);
  assert.equal((await prisma.analyticsDimension.findUniqueOrThrow({where:{day_dim_value:{day,dim:'landing',value:`/games/${seed}/${i}`}}})).count,4);
 }
 assert.equal(nativeErrors.length,0);
 nextDay('rollback');faultAt=4;await assert.rejects(collect.recordPageview(input));faultAt=0;await empty();
 await collect.recordPageview(input);assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}})).visitors,1,'retry after rollback retains unique count');
 nextDay('search');await Promise.all(Array.from({length:12},()=>collect.recordSearch('unique query',0)));
 for(const dim of ['search','search-empty'])assert.equal((await prisma.analyticsDimension.findUniqueOrThrow({where:{day_dim_value:{day,dim,value:'unique query'}}})).count,12);
 await collect.recordSearch('matching query',2);
 assert.equal((await prisma.analyticsDimension.findUniqueOrThrow({where:{day_dim_value:{day,dim:'search',value:'matching query'}}})).count,1);
 assert.equal(await prisma.analyticsDimension.count({where:{day,dim:'search-empty',value:'matching query'}}),0);
 nextDay('search-failure');faultAt=2;await assert.doesNotReject(collect.recordSearch('private search canary',0));faultAt=0;await empty();
 assert.equal(logs.length,1,'best-effort search observes transaction failure without an unhandled rejection');
 assert.equal(JSON.stringify(logs).includes('private search canary'),false);
 nextDay('http');const {NextRequest}=require('next/server'),route=load('src/modules/analytics/server/http/routes.ts');
 const request=()=>new NextRequest('http://e2e.invalid/api/analytics/collect',{method:'POST',headers:{...Object.fromEntries(headers),host:'e2e.invalid',origin:'http://e2e.invalid','content-type':'application/json'},body:JSON.stringify({p:input.path,r:''})});
 faultAt=4;const refused=await route.POST_collect(request());faultAt=0;assert.equal(refused.status,204);await empty();
 assert.equal(logs.length,2,'best-effort HTTP still acknowledges while failure is observable');
 assert.equal((await route.POST_collect(request())).status,204);
 assert.equal((await route.POST_collect(request())).status,204);
 assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}})).views,2);
 assert.equal((await prisma.analyticsDaily.findUniqueOrThrow({where:{day_path:{day,path:'*'}}})).visitors,1);
 console.log('Analytics integrity: concurrent views/one visitor, historical counts, daily hash rotation, zero duplicate DB errors, all-or-nothing failure/retry, search counters and actual HTTP handler passed');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 try{const where={day:{in:days}};await prisma.analyticsDimension.deleteMany({where});await prisma.analyticsDaily.deleteMany({where});await prisma.analyticsVisitor.deleteMany({where});}
 finally{await prisma.$disconnect();}
});
