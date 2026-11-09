// Execute the exact one-time upgrade SQL only in a disposable database.
const assert=require('node:assert/strict'),fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),load=require('./connected-source-loader.cjs')()
if(!/^\/mobocom_cloud_navigation_/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Use a disposable mobocom_cloud_navigation_* database')
const db=new PrismaClient(),key='site.config.v1',sql=fs.readFileSync('prisma/migrations/20270227120000_cloud_public_navigation/migration.sql','utf8')
const defaults=load('src/modules/site/config/defaults.ts').defaultSite,{validateSite}=load('src/modules/site/config/validation.ts'),cloud=defaults.navigation.find(n=>n.href==='/cloud')
const link=(i,extra={})=>({href:'/p/owned-'+i,label:{fa:'گزینه '+i,en:'Item '+i},...extra})
const without=()=>({...structuredClone(defaults),navigation:defaults.navigation.filter(n=>n.href!=='/cloud'),customOwned:{preserve:'unchanged'}})
async function put(value){await db.setting.upsert({where:{key},create:{key,value:typeof value==='string'?value:JSON.stringify(value)},update:{value:typeof value==='string'?value:JSON.stringify(value)}})}
async function raw(){return (await db.setting.findUniqueOrThrow({where:{key}})).value}
async function unchanged(value){await put(value);const before=await raw();await db.$executeRawUnsafe(sql);assert.equal(await raw(),before)}
(async()=>{const prior=await db.setting.findUnique({where:{key}});try{
 const before=without();await put(before);await db.$executeRawUnsafe(sql);const after=JSON.parse(await raw());assert.equal(validateSite(after),true)
 assert.deepEqual(after.navigation.find(n=>n.href==='/cloud'),cloud);assert.deepEqual(after.navigation.filter(n=>n.href!=='/cloud'),before.navigation)
 assert.deepEqual({...after,navigation:before.navigation},before);assert.equal(after.navigation.findIndex(n=>n.href==='/cloud'),after.navigation.findIndex(n=>n.href==='/products')+1)
 const once=await raw();await db.$executeRawUnsafe(sql);assert.equal(await raw(),once,'idempotent upgrade')
 await unchanged({...without(),navigation:[link(0,{children:[{...cloud,href:'/cloud/?owner=1',enabled:false,label:{fa:'نام سفارشی',en:'Custom'},children:[]}]})]})
 await unchanged({...without(),navigation:[{...cloud,enabled:false,children:[]}]})
 await unchanged({...without(),navigation:Array.from({length:114},(_,i)=>link(i))})
 await unchanged('{broken-json');await unchanged({...without(),navigation:[false]})
 await put({...without(),navigation:Array.from({length:113},(_,i)=>link(i))});await db.$executeRawUnsafe(sql);assert.equal(validateSite(JSON.parse(await raw())),true)
 await db.setting.delete({where:{key}});await db.$executeRawUnsafe(sql);assert.equal(await db.setting.count({where:{key}}),0,'fresh install uses defaults rather than partial config')
 console.log('Cloud navigation migration: preservation/order/parity/idempotency/nested-hidden/capacity/corrupt/fresh-install passed')
}finally{if(prior)await db.setting.upsert({where:{key},create:prior,update:{value:prior.value}});else await db.setting.deleteMany({where:{key}});await db.$disconnect()}})().catch(e=>{console.error(e.stack);process.exitCode=1})
