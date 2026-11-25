// Real PostgreSQL/Identity/Settings CAS/audit; host proxy effects are inspected locally.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
assert(/^\/mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL).pathname));process.env.NEXTAUTH_SECRET=crypto.randomBytes(32).toString('hex');process.env.NEXTAUTH_URL='https://mobocom.invalid'
const db=new PrismaClient(),keys=['site.section-hosts.v1','security.policy.v1'],before=new Map(),ids=[],roles=[],stamp='section-host-'+crypto.randomUUID();let failAudit=false
const reader=new Proxy(db,{get(t,k){if(k==='$transaction')return(work,opts)=>t.$transaction(tx=>work(new Proxy(tx,{get(x,n){if(n==='auditLog')return new Proxy(x.auditLog,{get(m,f){if(f==='create')return arg=>{if(failAudit)throw Error('synthetic audit refusal');return m.create(arg)};return typeof m[f]==='function'?m[f].bind(m):m[f]}});return typeof x[n]==='function'?x[n].bind(x):x[n]}})),opts);return typeof t[k]==='function'?t[k].bind(t):t[k]}})
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db:reader},react:{...require('react'),cache:f=>f}}),routing=load('src/modules/site/server/routes.ts'),access=load('src/modules/identity/server/access.ts')
const put=(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{value}})
;(async()=>{try{
 for(const key of keys)before.set(key,await db.setting.findUnique({where:{key}}));await db.setting.deleteMany({where:{key:keys[0]}});await put(keys[1],'{"requireAdmin2fa":false}');access.clearAdminPolicyCache()
 const owner=await db.user.create({data:{email:stamp+'@example.invalid',role:'ADMIN',passwordHash:'!'}});ids.push(owner.id)
 const role=await db.role.create({data:{name:stamp,permissions:'music.manage'}});roles.push(role.id);const scoped=await db.user.create({data:{email:stamp+'-scoped@example.invalid',role:'ADMIN',roleId:role.id,passwordHash:'!'}});ids.push(scoped.id)
 const actor=async u=>({id:u.id,email:u.email,req:new NextRequest('https://mobocom.invalid/api/admin/sections',{headers:{origin:'https://mobocom.invalid',cookie:'__Secure-next-auth.session-token='+await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(u.id),authAt:Date.now()}})}})}),admin=await actor(owner),limited=await actor(scoped)
 let state=await routing.loadSectionHosts();assert.deepEqual(state.hosts,{})
 await assert.rejects(routing.saveSectionHosts({'/cloud':'cloud.mobocom.invalid'},{...limited,actor:limited,expected:state.revision}),e=>e.status===403)
 await assert.rejects(routing.saveSectionHosts({'/cloud':'cloud.mobocom.invalid'},{req:admin.req,actor:admin,expected:''}),e=>e.status===428)
 state=await routing.saveSectionHosts({'/cloud':'cloud.mobocom.invalid'},{req:admin.req,actor:admin,expected:state.revision});assert.equal(state.hosts['/cloud'],'cloud.mobocom.invalid')
 await assert.rejects(routing.saveSectionHosts({'/blog':'cloud.mobocom.invalid'},{req:admin.req,actor:admin,expected:state.revision}),e=>e.status===409)
 failAudit=true;try{await assert.rejects(routing.saveSectionHosts({'/blog':'magazine.mobocom.invalid'},{req:admin.req,actor:admin,expected:state.revision}),/synthetic audit refusal/)}finally{failAudit=false}assert.deepEqual(await routing.loadSectionHosts(),state)
 const race=await Promise.allSettled([routing.saveSectionHosts({'/blog':'magazine.mobocom.invalid'},{req:admin.req,actor:admin,expected:state.revision}),routing.saveSectionHosts({'/servers':'servers.mobocom.invalid'},{req:admin.req,actor:admin,expected:state.revision})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert(race.some(x=>x.status==='rejected'&&x.reason.status===409));state=await routing.loadSectionHosts();assert.equal(state.hosts['/cloud'],'cloud.mobocom.invalid')
 const api=load('src/modules/site/server/http/admin/sections/route.ts'),request=(body,origin='https://mobocom.invalid')=>new NextRequest('https://mobocom.invalid/api/admin/sections',{method:'POST',headers:{...Object.fromEntries(admin.req.headers),origin,'content-type':'application/json'},body:JSON.stringify(body)})
 assert.equal((await api.POST(request({id:'hosting',hostnames:{'/cloud':'changed.mobocom.invalid'},hostsRevision:state.revision},'https://evil.invalid'))).status,403)
 assert.equal((await api.POST(request({id:'hosting',hostnames:{'/blog':'wrong.mobocom.invalid'},hostsRevision:state.revision}))).status,422)
 assert.equal((await api.POST(request({id:'hosting',hostnames:{'/cloud':'changed.mobocom.invalid'},hostsRevision:state.revision,addresses:{'/cloud':'admin'}}))).status,422);assert.deepEqual(await routing.loadSectionHosts(),state)
 const res=await api.POST(request({id:'hosting',hostnames:{'/cloud':'cloud.mobocom.invalid'},hostsRevision:state.revision}));assert.equal(res.status,200,await res.clone().text());assert((await res.json()).section.bases.some(b=>b.base==='/cloud'&&b.hostname==='cloud.mobocom.invalid'))
 let moduleOn=true,maintenance={},cacheCalls=0;const pLoad=require('./connected-source-loader.cjs')({
  '@/modules/site/server/routes':routing,
  '@/extensions/server/modules':{isModuleEnabled:async()=>moduleOn},
  '@/modules/installer/server/gate':{installGate:async()=>null},
  '@/modules/performance/server/pagecache':{pageCacheHandle:async()=>{cacheCalls++;return null},purgeSoon(){}},
  '@/modules/site/server/maintenance':{loadMaintenance:async()=>maintenance,maintenanceBases:()=>({hosting:['/cloud','/hosting','/servers','/domains']})},
  '@/modules/account/server/section-access':{loadSectionAccess:async()=>({}),sectionLock:async()=> 'open'},
  '@/modules/identity/server/access':{requireUser:async()=>null},
 });const proxy=pLoad('src/proxy.ts').proxy,req=(path,host='cloud.mobocom.invalid',headers={})=>new NextRequest('https://'+host+path,{headers:{host,...headers}})
 let r=await proxy(req('/?source=entry'));assert.equal(new URL(r.headers.get('x-middleware-rewrite')).pathname,'/cloud');assert.equal(new URL(r.headers.get('x-middleware-rewrite')).search,'?source=entry');assert.equal(r.headers.get('x-robots-tag'),'noindex, follow');assert(!r.headers.has('set-cookie'));assert.equal(cacheCalls,0)
 r=await proxy(req('/dashboard/cloud?from=section'));assert.equal(r.headers.get('location'),'https://mobocom.invalid/dashboard/cloud?from=section');assert.equal(r.status,307)
 r=await proxy(req('/pay/merchant/terminals'));assert.equal(r.headers.get('location'),'https://mobocom.invalid/pay/merchant/terminals')
 r=await proxy(req('/api/auth/session'));assert.equal(r.headers.get('location'),'https://mobocom.invalid/api/auth/session')
 r=await proxy(new NextRequest('https://cloud.mobocom.invalid/api/auth/callback/credentials',{method:'POST',headers:{host:'cloud.mobocom.invalid',origin:'https://cloud.mobocom.invalid'}}));assert.equal(r.status,403);assert.equal(r.headers.get('location'),null);assert.equal(r.headers.get('set-cookie'),null)
 r=await proxy(req('/cloud?x=1'));assert.equal(r.headers.get('location'),'https://cloud.mobocom.invalid/?x=1')
 r=await proxy(req('/','mobocom.invalid',{'x-forwarded-host':'cloud.mobocom.invalid'}));assert.equal(r.headers.get('x-middleware-rewrite'),null);assert.equal(cacheCalls,1)
 moduleOn=false;r=await proxy(req('/'));assert.equal(r.status,404);moduleOn=true
 maintenance={hosting:{enabled:true,title:'Closed',message:'Synthetic',mode:'update'}};r=await proxy(req('/'));assert.equal(r.status,503);assert.equal(new URL(r.headers.get('x-middleware-rewrite')).pathname,'/maintenance')
 console.log('Section hosts PASS: strict first-party config, current permissions, CAS race/audit rollback, owner-scoped API, root rewrite/private redirect/query, main path+forwarded-host isolation, module-off/maintenance/cache/cookie boundaries')
}finally{for(const[k,row]of before)if(row)await put(k,row.value);else await db.setting.deleteMany({where:{key:k}});await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.role.deleteMany({where:{id:{in:roles}}});access.clearAdminPolicyCache();await db.$disconnect()}})().catch(e=>{console.error(e.stack);process.exitCode=1})
