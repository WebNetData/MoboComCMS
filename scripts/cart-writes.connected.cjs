// Real PostgreSQL concurrency checks; only namespaced products/cart/user fixtures.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `cart-write-${Date.now()}`; let user, cart, product, other
function load(file) {
 const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
 new Function('require','module','exports',code)(name => {
  if(name === '@/platform/database/prisma') return {db}
  if(name === '@/modules/store/domain/store') return load('src/modules/store/domain/store.ts')
  if(name === '@/modules/catalog/domain/product-publication') return load('src/modules/catalog/domain/product-publication.ts')
  if(name === '@/modules/store/domain/order-inputs') return load('src/modules/store/domain/order-inputs.ts')
  if(name.startsWith('@/')) return {}
  return require(name)
 },mod,mod.exports); return mod.exports
}
(async()=>{
 user=await db.user.create({data:{email:`${seed}@example.invalid`,passwordHash:'test-only'}})
 product=await db.product.create({data:{slug:seed,name:seed,price:1,currency:'IRT',stock:100,approval:'APPROVED'}})
 cart=await db.cart.create({data:{userId:user.id,token:seed}})
 await db.cartLine.create({data:{cartId:cart.id,productId:product.id,quantity:1}})
 const service=load('src/modules/store/server/cart.ts'), owner={userId:user.id,token:null}
 const result=await Promise.allSettled(Array.from({length:12},()=>service.addToCart(owner,{productId:product.id,quantity:1})))
 assert.ok(result.every(r=>r.status==='fulfilled'),JSON.stringify(result.filter(r=>r.status==='rejected').map(r=>String(r.reason))))
 const row=await db.cartLine.findFirstOrThrow({where:{cartId:cart.id,productId:product.id}})
  console.log(`Concurrent quantity: ${row.quantity}; expected 13`);assert.equal(row.quantity,13,'concurrent additions must not lose increments')
 await db.cartLine.deleteMany({where:{cartId:cart.id}})
 await Promise.all(Array.from({length:8},()=>service.addToCart(owner,{productId:product.id,quantity:1})))
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})).quantity,8,'concurrent new-line creation stays unique')
 await db.product.update({where:{id:product.id},data:{maxPerOrder:10}})
 const limited=await Promise.all(Array.from({length:8},()=>service.addToCart(owner,{productId:product.id,quantity:1})))
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})).quantity,10)
 assert.equal(limited.filter(r=>r.limited).length,6,'preserve capped-add limited response')
 other=await db.product.create({data:{slug:`${seed}-other`,name:seed,price:1,currency:'USD',approval:'APPROVED'}})
 const before=await db.cart.findUniqueOrThrow({where:{id:cart.id}})
 await assert.rejects(service.addToCart(owner,{productId:other.id}),e=>e.code==='MIXED_CURRENCY')
 assert.equal((await db.cart.findUniqueOrThrow({where:{id:cart.id}})).updatedAt.getTime(),before.updatedAt.getTime(),'failed validation rolls back cart cycle')
 const line=await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})
 await assert.rejects(service.updateCartLine({userId:null,token:null},line.id,1),e=>e.code==='LINE_NOT_FOUND')
 await service.updateCartLine(owner,line.id,2);assert.equal((await db.cartLine.findUniqueOrThrow({where:{id:line.id}})).quantity,2)
 await service.clearCart(owner);assert.equal(await db.cartLine.count({where:{cartId:cart.id}}),0)
 await db.cart.delete({where:{id:cart.id}});cart=null
 const created=await Promise.all(Array.from({length:8},()=>service.addToCart(owner,{productId:product.id,quantity:1})))
 cart=await db.cart.findUniqueOrThrow({where:{userId:user.id}})
 assert.equal(new Set(created.map(r=>r.token)).size,1,'simultaneous first additions resolve one owned cart')
 assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})).quantity,8)
 if(process.env.CART_API==='1') {
  const {encode}=require('next-auth/jwt'),base='http://localhost:3000'
  const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),sub:String(user.id),email:user.email,role:user.role,authAt:Date.now()}})
  const call=(method,body,authenticated=true)=>fetch(base+'/api/cart',{method,headers:{origin:base,'content-type':'application/json',...(authenticated?{cookie:`next-auth.session-token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)})
  const replies=await Promise.all(Array.from({length:6},()=>call('POST',{productId:product.id,quantity:1})))
  for(const response of replies)assert.equal(response.status,200,await response.clone().text())
  assert.equal((await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})).quantity,10)
  assert.equal((await Promise.all(replies.map(r=>r.json()))).filter(r=>r.limited).length,4)
  const saved=await db.cartLine.findFirstOrThrow({where:{cartId:cart.id}})
  assert.equal((await call('PATCH',{lineId:saved.id,quantity:1},false)).status,404)
  assert.equal((await call('PATCH',{lineId:saved.id,quantity:2})).status,200)
  assert.equal((await call('DELETE')).status,200)
  assert.equal(await db.cartLine.count({where:{cartId:cart.id}}),0)
  console.log('Actual authenticated cart API concurrent capped additions, limited response, guest denial, update and clear passed')
 }
 console.log('Real PostgreSQL concurrent existing/new lines/first cart, caps, mixed-currency rollback, ownership and update/clear passed')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try {if(user)await db.cart.deleteMany({where:{userId:user.id}});if(product)await db.product.deleteMany({where:{id:product.id,slug:seed}});if(other)await db.product.deleteMany({where:{id:other.id,slug:`${seed}-other`}});if(user)await db.user.deleteMany({where:{id:user.id,email:`${seed}@example.invalid`}})}finally{await db.$disconnect()}
})
