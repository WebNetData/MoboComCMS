const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable DB required')
const db=new PrismaClient(),stamp='launch-'+Date.now(),users=[],gateways=[],products=[]
let viewer=null,failCreate=false,failUpdate=false
db.$use(async(params,next)=>{if(params.model==='Gateway'&&((failCreate&&params.action==='create')||(failUpdate&&params.action==='update')))throw Error('injected gateway write failure');return next(params)})
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:Date.now()}:null},
})
const api=load('src/modules/billing/server/http/admin/gateways/route.ts')
const admin=load('src/modules/store/server/admin.ts'),catalog=load('src/modules/store/server/catalog.ts'),{sellableStock}=load('src/modules/store/domain/store.ts')
const req=(method,body)=>new NextRequest('http://localhost/api/admin/gateways',{method,headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body)})
async function main(){
 const staff=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'!',role:'ADMIN'}});users.push(staff.id);viewer=staff
 const original=await db.gateway.create({data:{name:stamp+'-default',provider:'MANUAL',isDefault:true}});gateways.push(original.id)
 assert.equal((await api.POST(req('POST',{name:stamp+'-invalid',provider:'MANUAL',isDefault:true,minAmount:'invalid'}))).status,400)
 assert.equal((await db.gateway.findUniqueOrThrow({where:{id:original.id}})).isDefault,true,'invalid create keeps the existing default')
 failCreate=true;await assert.rejects(api.POST(req('POST',{name:stamp+'-failed',provider:'MANUAL',isDefault:true,minAmount:'0'})),/injected/);failCreate=false
 assert.equal((await db.gateway.findUniqueOrThrow({where:{id:original.id}})).isDefault,true,'failed insert rolls back default change')
 const created=await api.POST(req('POST',{name:stamp+'-next',provider:'MANUAL',isDefault:true,minAmount:'0',instructions:'Synthetic only'}));assert.equal(created.status,200)
 const next=await created.json();gateways.push(next.id);assert.equal((await db.gateway.findUniqueOrThrow({where:{id:original.id}})).isDefault,false)
 failUpdate=true;await assert.rejects(api.PATCH(req('PATCH',{id:original.id,isDefault:true})),/injected/);failUpdate=false
 assert.equal((await db.gateway.findUniqueOrThrow({where:{id:next.id}})).isDefault,true,'failed update preserves current default')
 const p=await db.product.create({data:{slug:stamp,name:stamp,kind:'PHYSICAL',currency:'IRT',price:200,priceMinor:200n,stock:3,approval:'APPROVED',active:true,variants:{create:[{name:'A',sku:stamp+'a',price:100,priceMinor:100n,stock:5},{name:'B',sku:stamp+'b',price:300,priceMinor:300n,stock:5}]}}});products.push(p.id)
 const list=await admin.adminProducts({q:stamp});assert.equal(list.products.length,1)
 assert.equal(sellableStock(list.products[0].stock,list.products[0].variantStock),3)
 assert.equal(Math.min(...list.products[0].variants.map(v=>v.price)),100)
 const cards=await catalog.productCards({id:p.id});assert.equal(cards[0].price,100);assert.equal(cards[0].lowStock,3,'same product cap in storefront')
 viewer=null;assert.equal((await api.POST(req('POST',{name:'denied'}))).status,403)
 console.log('Launch basics native passed: atomic gateway default preservation, real variant price/stock projections and authorization')
}
main().finally(async()=>{failCreate=failUpdate=false;await db.product.deleteMany({where:{id:{in:products}}});await db.gateway.deleteMany({where:{id:{in:gateways}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect()}).catch(e=>{console.error(e);process.exitCode=1})
