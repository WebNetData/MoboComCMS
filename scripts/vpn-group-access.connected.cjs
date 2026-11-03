// Actual PostgreSQL, current Identity guards, membership commands and section policy.
// External providers, session presentation and module switches are declared test boundaries.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),ts=require('typescript-api')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const db=new PrismaClient(),prefix='vpn-groups-'+Date.now(),users=[],groups=[],roles=[],cache=new Map(),secret=crypto.randomBytes(32).toString('hex')
process.env.NEXTAUTH_SECRET=secret;process.env.NEXTAUTH_URL='http://localhost:3000'
let failAudit=false,membershipOn=true,callerId=0,previousPolicy
const wrapped=new Proxy(db,{get(target,key){if(key==='$transaction')return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(inner,field){if(field==='auditLog'&&failAudit)return{create:async()=>{throw Error('OWNED_AUDIT_FAILURE')}};return typeof inner[field]==='function'?inner[field].bind(inner):inner[field]}})));return typeof target[key]==='function'?target[key].bind(target):target[key]}})
function load(file){if(cache.has(file))return cache.get(file).exports;let source=fs.readFileSync(file,'utf8');if(process.env.VPN_GROUP_FAULT==='revision'&&file.endsWith('/member-groups.ts'))source=source.replace("if (typeof revision !== 'string' || revisionOf(userId, before) !== revision)",'if (false)');if(process.env.VPN_GROUP_FAULT==='audience'&&file.endsWith('/section-access.ts'))source=source.replace("return (await siteGroupsOf(account.id, keys)).length ? 'open' : 'refused'","return 'open'");const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{
 if(name==='@/platform/database/prisma')return{db:wrapped}
 if(name==='@/platform/config/env')return{authSecret:()=>secret}
 if(name==='@/modules/identity/auth')return{authOptions:{}}
 if(name==='@/extensions/server/modules')return{isModuleEnabled:async id=>id==='membership'?membershipOn:true,moduleGuard:async()=>null}
 if(name==='@/modules/public-api/server/api-keys')return{resolveApiCaller:async()=>callerId?{userId:callerId,keyId:0}:null,rateLimit:async()=>({ok:true})}
 if(name==='@/modules/public-api/server/availability')return{isPublicApiEnabled:async()=>true}
 if(name==='@/platform/cache/kv')return{kv:async()=>({kind:'memory'}),cached:async(k,t,work)=>work(),invalidate:async()=>{}}
 if(name==='@/modules/notifications/server/inbox')return{createInboxEvent:async()=>null,invoicePaidEvent:async()=>{}}
 if(name==='@/modules/sms/server/sms')return{notifyAdmins:async()=>{}}
 if(name==='@/modules/automation/server/engine')return{emitAutomation:async()=>{}}
 if(name==='@/modules/referrals/server/referrals')return{awardReferralForInvoice:async()=>{}}
 if(name==='@/extensions/server/runtime')return{emitExtensionEvent:async()=>{}}
 if(name==='@/modules/shipping/server/carriers')return{getCarrierSettings:async()=>({enabled:false})}
 if(name==='@/platform/observability/logger')return{logEvent:()=>{},requestIdFrom:()=>prefix}
 if(name==='@/i18n/server')return{getServerLocale:async()=> 'fa'}
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?'src/'+name.slice(2):path.posix.join(path.posix.dirname(file),name);for(const p of[base,base+'.ts',base+'/index.ts'])if(fs.existsSync(p)&&fs.statSync(p).isFile())return p.endsWith('.json')?JSON.parse(fs.readFileSync(p,'utf8')):load(p)}return require(name)
 },mod,mod.exports);return mod.exports}
const req=async user=>new NextRequest('http://localhost:3000/api/admin/user-groups',{headers:{Origin:'http://localhost:3000',cookie:`next-auth.session-token=${await encode({secret,token:{uid:String(user.id),authAt:Date.now()}})}`}})
const makeUser=async(name,extra={})=>{const u=await db.user.create({data:{name,email:prefix+'-'+name+'@example.invalid',passwordHash:'unchanged fixture',...extra}});users.push(u.id);return u}
const policy=async keys=>{await db.setting.upsert({where:{key:'site.section-access.v1'},create:{key:'site.section-access.v1',value:JSON.stringify({vpn:keys})},update:{value:JSON.stringify({vpn:keys})}});await load('src/modules/account/server/section-access.ts').loadSectionAccess(true)}
async function main(){let plan
try{
 previousPolicy=await db.setting.findUnique({where:{key:'site.section-access.v1'}})
 const admin=await makeUser('admin',{role:'ADMIN'}),member=await makeUser('member'),outsider=await makeUser('outsider'),vip=await makeUser('vip'),expired=await makeUser('expired')
 const role=await db.role.create({data:{name:prefix,permissions:'dashboard.view'}});roles.push(role.id);const scoped=await makeUser('scoped',{role:'ADMIN',roleId:role.id})
 for(let i=0;i<3;i++){const g=await db.userGroup.create({data:{name:prefix+'-group-'+i}});groups.push(g.id)}
 const owner=load('src/modules/account/server/user-groups.ts'),snap=load('src/modules/account/server/member-groups.ts'),command=load('src/modules/account/server/group-command.ts'),access=load('src/modules/account/server/section-access.ts'),http=load('src/modules/account/server/http.ts')
 const send=async(body,actor=admin)=>command.writeUserGroup(await req(actor),body),save=async(ids,revision)=>send({op:'members.set',userId:member.id,groupIds:ids,revision})
 assert.notEqual((await snap.memberGroupsSnapshot(member.id)).revision,(await snap.memberGroupsSnapshot(outsider.id)).revision,'empty membership revisions are bound to their user')
 await owner.addGroupMember({groupId:groups[0],user:member.id,expiresAt:'2099-01-01T00:00:00.000Z',note:'keep expiry and note',actorId:admin.id})
 let snapshot=await snap.memberGroupsSnapshot(member.id),old=await db.userGroupMember.findFirstOrThrow({where:{groupId:groups[0],userId:member.id}})
 await save(groups.slice(0,2),snapshot.revision);assert.equal(await db.userGroupMember.count({where:{userId:member.id}}),2);assert.deepEqual(await db.userGroupMember.findUnique({where:{id:old.id}}),old,'retained metadata unchanged')
 await assert.rejects(()=>save([groups[2]],snapshot.revision),e=>e.status===409,'stale form cannot replace another membership')
 const identity=await db.user.findUniqueOrThrow({where:{id:member.id}});assert.equal(identity.role,'CUSTOMER');assert.equal(identity.passwordHash,'unchanged fixture')
 await assert.rejects(async()=>send({op:'members.set',userId:member.id,groupIds:[],revision:(await snap.memberGroupsSnapshot(member.id)).revision},scoped),e=>e.status===403)
 snapshot=await snap.memberGroupsSnapshot(member.id);failAudit=true;await assert.rejects(()=>save([],snapshot.revision),/OWNED_AUDIT_FAILURE/);failAudit=false;assert.equal((await snap.memberGroupsSnapshot(member.id)).revision,snapshot.revision,'audit failure rolls back all memberships')
 const race=await Promise.allSettled([save([groups[0]],snapshot.revision),save([groups[1]],snapshot.revision)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'one set wins the same snapshot')
 snapshot=await snap.memberGroupsSnapshot(member.id)
 await Promise.allSettled([save([groups[0]],snapshot.revision),send({op:'member.add',id:groups[2],user:member.id})]);assert.ok(await db.userGroupMember.findFirst({where:{userId:member.id,groupId:groups[2]}}),'legacy per-group add is never lost to a stale bulk set')
 const read=await http.GET_groups(new NextRequest(`http://localhost:3000/api/admin/user-groups?userId=${member.id}`,{headers:(await req(admin)).headers}));assert.equal(read.status,200);assert.ok((await read.json()).memberships.length)
 assert.equal((await http.GET_groups(new NextRequest(`http://localhost:3000/api/admin/user-groups?userId=${member.id}`))).status,403)
 await db.userMembership.create({data:{userId:vip.id,startsAt:new Date(0),endsAt:new Date(Date.now()+86400000),source:'owned fixture',dedupeKey:prefix+'-vip'}})
 await db.userMembership.create({data:{userId:expired.id,startsAt:new Date(0),endsAt:new Date(1),source:'owned fixture',dedupeKey:prefix+'-expired'}})
 await policy(['vip',`group:${groups[2]}`]);assert.equal(await access.userOpensSection('vpn',outsider.id),false);assert.equal(await access.userOpensSection('vpn',member.id),true);assert.equal(await access.userOpensSection('vpn',vip.id),true);assert.equal(await access.userOpensSection('vpn',expired.id),false);assert.equal(await access.userOpensSection('vpn',admin.id),true);assert.equal(await access.userOpensSection('vpn',scoped.id),false)
 const adminRequest=await req(admin),actor=await load('src/modules/identity/server/access.ts').requirePerm(adminRequest,'users.manage')
 await access.saveSectionAccess({music:[]},{req:adminRequest,actor});assert.deepEqual((await access.loadSectionAccess(true)).vpn,['vip',`group:${groups[2]}`],'omitted new sections survive legacy partial settings writes')
 membershipOn=false;assert.equal(await access.userOpensSection('vpn',vip.id),false,'disabled VIP is never public fallback');assert.equal(await access.userOpensSection('vpn',member.id),true);membershipOn=true
 await db.userMembership.updateMany({where:{userId:vip.id},data:{revokedAt:new Date()}});assert.equal(await access.userOpensSection('vpn',vip.id),false);await db.userMembership.updateMany({where:{userId:vip.id},data:{revokedAt:null}})
 await db.user.update({where:{id:member.id},data:{status:'BANNED'}});assert.equal(await access.userOpensSection('vpn',member.id),false);await db.user.update({where:{id:member.id},data:{status:'ACTIVE'}})
 await db.userGroup.update({where:{id:groups[2]},data:{active:false}});assert.equal(await access.userOpensSection('vpn',member.id),false);await db.userGroup.update({where:{id:groups[2]},data:{active:true}})
 await db.userGroupMember.updateMany({where:{userId:member.id,groupId:groups[2]},data:{expiresAt:new Date(0)}});assert.equal(await access.userOpensSection('vpn',member.id),false);await db.userGroupMember.updateMany({where:{userId:member.id,groupId:groups[2]},data:{expiresAt:null}})
 await db.accessRestriction.create({data:{userId:member.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:prefix,startsAt:new Date(0)}});assert.equal(await access.userOpensSection('vpn',member.id),false);await db.accessRestriction.deleteMany({where:{reason:prefix}})
 assert.equal((await load('src/modules/checkout/server/checkout.ts').executeCheckout({userId:outsider.id,planId:999,idempotencyKey:prefix+'-checkout',siteUrl:'http://localhost:3000'})).code,'VPN_FORBIDDEN')
 assert.equal((await load('src/modules/trials/server/trials.ts').claimTrial(outsider.id)).code,'VPN_FORBIDDEN');assert.equal(await db.order.count({where:{userId:outsider.id}}),0,'denied commands create no money rows')
 callerId=outsider.id;assert.equal((await load('src/modules/public-api/server/v1.ts').authorize(new NextRequest('http://localhost:3000/api/v1/subscriptions'))).response.status,403);callerId=vip.id;assert.equal((await load('src/modules/public-api/server/v1.ts').authorize(new NextRequest('http://localhost:3000/api/v1/subscriptions'))).ok,true)
 plan=await db.plan.create({data:{name:prefix,price:1000,priceMinor:1000n,trafficGB:10,days:30}})
 const sub=await db.subscription.create({data:{userId:outsider.id,planId:plan.id,username:prefix,subToken:crypto.randomBytes(24).toString('hex'),expiresAt:new Date(Date.now()+86400000),trafficLimit:1,status:'ACTIVE'}})
 assert.equal((await load('src/app/s/[token]/route.ts').GET(new Request('http://localhost:3000/s/'+sub.subToken),{params:Promise.resolve({token:sub.subToken})})).status,403)
 process.env.ALLOW_LEGACY_HAPP_PROXY='true'
 const deniedFeed=await load('src/app/api/happ/sub/[token]/route.ts').GET(new NextRequest('http://localhost:3000/api/happ/sub/'+sub.subToken,{headers:{'user-agent':'Happ/2.0'}}),{params:Promise.resolve({token:sub.subToken})})
 assert.equal(deniedFeed.status,403);assert.equal((await deniedFeed.json()).error,'دسترسی به این بخش محدود است')
 await policy([]);assert.equal(await access.userOpensSection('vpn',outsider.id),true,'default public contract preserved')
 console.log('PASS VPN audience and multi-group: real membership writes/metadata/revision/concurrency/legacy lock/audit/permissions, live VIP/group/expiry/module-off/standing decisions, command/API/token denial, unchanged identity and defaults; no external provider call')
}finally{
 failAudit=false;await db.accessRestriction.deleteMany({where:{reason:prefix}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.subscription.deleteMany({where:{userId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.userGroup.deleteMany({where:{id:{in:groups}}});await db.role.deleteMany({where:{id:{in:roles}}});if(plan)await db.plan.deleteMany({where:{id:plan.id}});if(previousPolicy)await db.setting.upsert({where:{key:previousPolicy.key},create:previousPolicy,update:{value:previousPolicy.value}});else await db.setting.deleteMany({where:{key:'site.section-access.v1'}});delete globalThis.__mobocomSectionAccess;await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
