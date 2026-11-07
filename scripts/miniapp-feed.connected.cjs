// Real PostgreSQL/publication/account guards. Presentation configuration, module runtime,
// cache and external provider lookups are declared doubles; no outgoing bot/payment calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const db=new PrismaClient(),stamp='miniapp-'+Date.now(),secret='owned-miniapp-connected-fixture',cache=new Map()
let disabled=new Set(),runtime={},site
const modules=Object.fromEntries(['store','membership','community','games','forum','reviews','music','cinema','software','vpn','prompt-master'].map(id=>[id,false]))
const doubles={
 '@/platform/database/prisma':{db},
 '@/platform/config/env':{authSecret:()=>secret},
 '@/platform/cache/kv':{cached:async(_key,_ttl,read)=>read(),invalidate:async()=>{}},
 '@/modules/site/config/store':{getPublicSiteConfig:async()=>site},
 '@/modules/settings/server':{getSettings:async()=>({storeEnabled:(await db.setting.findUnique({where:{key:stamp+'.storeEnabled'}}))?.value||'false'}),readJsonSetting:async()=>undefined},
 '@/i18n/server':{getServerLocale:async()=> 'fa'},
 '@/extensions/server/state':{getPublicExtensionRuntime:async()=>runtime},
 '@/extensions/server/modules':{getModuleStates:async()=>modules,isModuleEnabled:async id=>modules[id]!==false},
 '@/modules/site/server/maintenance':{closedSectionPlugins:async()=>disabled,maintenanceBases:()=>({magazine:['/blog'],music:['/music'],store:['/products']})},
 '@/modules/catalog/server/public-plans':{getPublicPlans:async()=>[]},
 '@/modules/notifications/server/telegram':{telegramConfig:async()=>null},
 '@/modules/media/server/queries':{getBuilderMedia:async()=>null,browseSoftware:async()=>null},
 '@/modules/forum/server/forum':{recentThreads:async()=>[]},
 '@/modules/membership/server/membership':{getActiveMembership:async()=>null},
 '@/modules/content/server/registry':{itemCards:async()=>new Map()},
 '@/modules/prompts/server/prompts':{memberPromptWorkspace:async()=>null},
 '@/modules/notifications/server/inbox':{createInboxEvent:async()=>{}},
 '@/platform/observability/logger':{logEvent:()=>{}},
}
function load(relative){
 const base=path.resolve(relative),file=fs.existsSync(base)&&fs.statSync(base).isFile()?base:['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)
 if(!file)throw Error('Missing '+relative);if(cache.has(file))return cache.get(file).exports
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
 const mod={exports:{}};cache.set(file,mod)
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{
  if(Object.hasOwn(doubles,name))return doubles[name]
  if(name.startsWith('@/'))return load('src/'+name.slice(2))
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name))
  return require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){
 const users=[]
 try{
  site=structuredClone(load('src/modules/site/config/defaults.ts').defaultSite)
  site.sections=site.sections.filter(section=>section.kind==='posts'||section.kind==='hero')
  for(const section of site.sections)section.miniapp=true
  await db.setting.create({data:{key:stamp+'.storeEnabled',value:'true'}})
  await db.post.createMany({data:[
   {slug:stamp+'-live',title:'Public article',content:'private body must not be projected',excerpt:'Public excerpt'},
   {slug:stamp+'-draft',title:'Unpublished draft',content:'private',status:'DRAFT'},
   {slug:stamp+'-future',title:'Scheduled article',content:'private',publishedAt:new Date(Date.now()+86400000)},
   {slug:stamp+'-group',title:'Group article',content:'private',audienceGroups:'["vip"]'},
  ]})
  await db.product.createMany({data:[
   {slug:stamp+'-live',name:'Public file',kind:'VIRTUAL',price:250000,priceMinor:250000n,currency:'IRT',active:true,approval:'APPROVED'},
   {slug:stamp+'-draft',name:'Private file',active:false},
   {slug:stamp+'-group',name:'Group file',active:true,approval:'APPROVED',audienceGroups:'["vip"]'},
  ]})
  const route=load('src/modules/site/server/http/public/miniapp-feed/route.ts')
  const first=await route.GET(),feed=await first.json()
  assert.equal(first.headers.get('cache-control'),'no-store')
  // First-deploy CI also contains valid seeded content; assert every own fixture,
  // including draft/future/group exclusions, without treating other public rows as leaks.
  assert.deepEqual(feed.discover.posts.filter(p=>p.slug.startsWith(stamp)).map(p=>p.slug),[stamp+'-live'])
  assert.deepEqual(feed.discover.products.filter(p=>p.slug.startsWith(stamp)).map(p=>p.slug),[stamp+'-live'])
  assert.ok(!JSON.stringify(feed).includes('private body'))
  assert.ok(!JSON.stringify(feed).includes('priceMinor'))
  disabled=new Set(['journal','music','store'])
  const closed=await (await route.GET()).json()
  assert.equal(closed.discover.posts.length,0);assert.equal(closed.discover.products.length,0)
  assert.ok(!closed.discover.sections.some(s=>['music','blog','store'].includes(s.key)))
  assert.ok(!closed.sections.some(s=>s.kind==='posts'))
  disabled=new Set();runtime={music:{enabled:false,paths:['/music']}}
  assert.ok(!(await (await route.GET()).json()).discover.sections.some(s=>s.key==='music'))
  await db.setting.update({where:{key:stamp+'.storeEnabled'},data:{value:'false'}})
  const storeOff=await (await route.GET()).json();assert.equal(storeOff.discover.products.length,0);assert.ok(!storeOff.discover.sections.some(s=>s.key==='store'))
  site.sections.forEach(section=>{section.miniapp=false})
  assert.equal((await (await route.GET()).json()).sections.length,0)

  const account=load('src/modules/account/server/http/routes.ts')
  for(const name of ['one','two'])users.push(await db.user.create({data:{email:stamp+'-'+name+'@example.invalid',name:'MiniApp '+name,passwordHash:'not-a-login-password'}}))
  await db.walletAccount.create({data:{userId:users[0].id,currency:'IRT',balanceMinor:85000n}})
  const fileProduct=await db.product.findUnique({where:{slug:stamp+'-live'}})
  const serviceOrder=await db.order.create({data:{userId:users[0].id,totalAmount:0,totalMinor:0n,currency:'IRT'}})
  const storeOrder=await db.order.create({data:{userId:users[0].id,productId:fileProduct.id,totalAmount:0,totalMinor:0n,currency:'IRT'}})
  const request=async user=>new NextRequest('http://localhost/api/my/overview',{headers:user?{cookie:'next-auth.session-token='+await encode({secret,token:{uid:String(user.id),authAt:Date.now()},maxAge:600})}:{}})
  assert.equal((await account.GET_overview(await request(null))).status,401)
  for(const user of users){const response=await account.GET_overview(await request(user));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const value=await response.json();assert.equal(value.user.name,user.name);assert.equal(value.user.email,user.email);assert.ok(!JSON.stringify(value).includes('passwordHash'));assert.equal(value.money.length,user.id===users[0].id?1:0)}
  const own=(await (await account.GET_overview(await request(users[0]))).json()).orders.recent
  assert.equal(own.find(o=>o.id===serviceOrder.id).url,'/dashboard/orders')
  assert.equal(own.find(o=>o.id===storeOrder.id).url,'/dashboard/orders/'+storeOrder.id)
  await db.user.update({where:{id:users[0].id},data:{status:'BANNED'}})
  assert.equal((await account.GET_overview(await request(users[0]))).status,401)
  console.log('Mini App PostgreSQL: public publication/group projection, module/maintenance/store-off hiding, Studio flags, no-store, two isolated canonical accounts, real wallet and banned/guest refusal passed.')
 }finally{
  await db.order.deleteMany({where:{userId:{in:users.map(u=>u.id)}}})
  await db.walletAccount.deleteMany({where:{userId:{in:users.map(u=>u.id)}}})
  await db.userProfile.deleteMany({where:{userId:{in:users.map(u=>u.id)}}})
  await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}})
  await db.post.deleteMany({where:{slug:{startsWith:stamp}}});await db.product.deleteMany({where:{slug:{startsWith:stamp}}})
  await db.setting.deleteMany({where:{key:stamp+'.storeEnabled'}})
  await db.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
