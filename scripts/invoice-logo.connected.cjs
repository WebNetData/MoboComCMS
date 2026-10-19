// Real PostgreSQL invoice projection + canonical site-config reader. No money rows or stored logo overrides are rewritten.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),cache=new Map(),memo=new Map(),stamp=`owned-invoice-logo-${Date.now()}`,snapshots=new Map(),users=[],orders=[]
const mocks={
 '@/platform/database/prisma':{db},react:{cache:fn=>fn},
 '@/platform/cache/kv':{cached:async(k,t,work)=>{if(!memo.has(k))memo.set(k,await work());return memo.get(k)},invalidate:async prefix=>{for(const k of memo.keys())if(k.startsWith(prefix))memo.delete(k)}},
 '@/modules/identity/server/profile-fields':{memberNationalId:async()=>''},
 '@/modules/catalog/server/storefront':{},'@/modules/public-api/server/availability':{},'@/extensions/server/state':{},
}
function load(relative){const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
 if(Object.hasOwn(mocks,name))return mocks[name]
 if(name.startsWith('@/')&&/\.(json|cjs)$/.test(name))return require(path.resolve('src',name.slice(2)))
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts'))}
 return require(name)
},mod,mod.exports);return mod.exports}
const set=(key,value)=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
async function main(){try{
 for(const key of ['site.config.v1','billing.invoice-profile.v1'])snapshots.set(key,await db.setting.findUnique({where:{key}}))
 const site={...load('src/modules/site/config/defaults.ts').defaultSite,wordmark:'/api/media/covers/site-logo.webp',logo:'/api/media/covers/mark.png',wordmarkDark:'/api/media/covers/dark-only.webp'}
 await set('site.config.v1',site);await set('billing.invoice-profile.v1',{sellerName:'Owned invoice seller',logo:'',vatBps:0})
 const billing=load('src/modules/billing/server/official-invoice.ts')
 for(const suffix of ['owner','other'])users.push(await db.user.create({data:{email:`${stamp}-${suffix}@example.invalid`,passwordHash:'fixture'}}))
 const viewer={id:users[0].id,admin:false}
 for(const [index,kind]of ['product','content','membership','form','plan','manual','wallet'].entries()){
  const order=kind==='manual'||kind==='wallet'?null:await db.order.create({data:{userId:viewer.id,totalAmount:120000,totalMinor:120000n,currency:'IRT',meta:JSON.stringify({kind,formTitle:'Owned form',contentTitle:'Owned magazine purchase'})}})
  if(order)orders.push(order.id)
  const invoice=await db.invoice.create({data:{number:`${stamp}-${index}`,userId:viewer.id,orderId:order?.id,kind:kind==='wallet'?'WALLET_TOPUP':'BILLING',title:`Owned ${kind}`,currency:'IRT',subtotal:120000,subtotalMinor:120000n,total:120000,totalMinor:120000n}})
  const before=await db.invoice.findUnique({where:{id:invoice.id}}),doc=await billing.officialInvoice(invoice.number,viewer)
  assert.equal(doc.seller.logo,site.wordmark,kind);assert.equal(await billing.officialInvoice(invoice.number,{id:users[1].id,admin:false}),null)
  assert.equal((await billing.officialInvoice(invoice.number,{id:users[1].id,admin:true})).seller.logo,site.wordmark)
  assert.deepEqual(await db.invoice.findUnique({where:{id:invoice.id}}),before,'presentation must not change money/history')
 }
 assert.equal((await billing.getInvoiceProfile()).logo,'','Admin retains an empty override')
 await billing.saveInvoiceProfile({...await billing.getInvoiceProfile(),phone:'02100000000'})
 assert.equal(JSON.parse((await db.setting.findUnique({where:{key:'billing.invoice-profile.v1'}})).value).logo,'','saving unrelated details must not pin inherited logo')
 site.wordmark='/api/media/covers/rebranded.webp';await set('site.config.v1',site);assert.equal((await billing.getBrandedInvoiceProfile()).logo,site.wordmark)
 await billing.saveInvoiceProfile({...await billing.getInvoiceProfile(),logo:'/api/media/covers/custom.webp'});assert.equal((await billing.getBrandedInvoiceProfile()).logo,'/api/media/covers/custom.webp')
 await set('billing.invoice-profile.v1',{...await billing.getInvoiceProfile(),logo:'/api/media/covers/other-instance.webp'});assert.equal((await billing.getBrandedInvoiceProfile()).logo,'/api/media/covers/other-instance.webp','fresh invoice reads see changes from another process despite a warm Settings cache')
 await billing.saveInvoiceProfile({...await billing.getInvoiceProfile(),logo:''});site.wordmark='';await set('site.config.v1',site);assert.equal((await billing.getBrandedInvoiceProfile()).logo,site.logo)
 site.logo='';await set('site.config.v1',site);assert.equal((await billing.getBrandedInvoiceProfile()).logo,'')
 console.log('PASS invoice logo: seven invoice sources, canonical branding inheritance/override/live changes/empty fallback, raw Admin save, owner/other/staff and unchanged financial rows')
 }finally{
  await db.invoice.deleteMany({where:{number:{startsWith:stamp}}});await db.order.deleteMany({where:{id:{in:orders}}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}})
  for(const[key,row]of snapshots)if(row)await db.setting.upsert({where:{key},create:row,update:{value:row.value}});else await db.setting.deleteMany({where:{key}})
  await db.$disconnect()
 }}
main().catch(e=>{console.error(e);process.exitCode=1})
