// PostgreSQL ownership races with barriers before the existing transaction boundary.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `guest-owner-${Date.now()}`, users = [], carts = [], products = []
function load(client) {
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/modules/store/server/cart.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (name === '@/platform/database/prisma') return {db: client}
  if (name === '@/modules/store/domain/store' || name === '@/modules/catalog/domain/product-publication') {
   const child = {exports: {}}
   new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/' + name.slice(2) + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(child, child.exports)
   return child.exports
  }
  if (name.startsWith('@/')) return {}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const createCart = async userId => {const row = await db.cart.create({data: {userId, token: `${seed}-${carts.length}-cart`}}); carts.push(row.id); return row}
async function main() {
 for (let i = 0; i < 4; i++) users.push(await db.user.create({data: {email: `${seed}-${i}@example.invalid`, passwordHash: 'test-only'}}))
 for (let i = 0; i < 4; i++) products.push(await db.product.create({data: {slug: `${seed}-${i}`, name: seed, price: 1, priceMinor: 100n, currency: 'USD', stock: 30, approval: 'APPROVED'}}))
 const guest = await createCart(null)
 await db.cartLine.create({data: {cartId: guest.id, productId: products[0].id, quantity: 2}})
 let arrived = 0, release; const barrier = new Promise(resolve => {release = resolve})
 const cart = new Proxy(db.cart, {get(target, key) {if (key === 'findFirst') return async args => {const row = await target.findFirst(args); if (args.where.token === guest.token && arrived < 2) {if (++arrived === 2) release(); await barrier} return row}; return target[key]}})
 const client = new Proxy(db, {get(target, key) {return key === 'cart' ? cart : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
 const claim = await Promise.all(users.slice(0, 2).map(user => load(client).findCart({userId: user.id, token: guest.token})))
 if (process.env.GUEST_OWNER_BASELINE === '1') {assert.equal(claim.filter(Boolean).length, 2); console.log('Reproduced: two different signed-in users both claimed the same guest cart; later claim overwrote canonical owner'); return}
 assert.equal(claim.filter(Boolean).length, 1, 'only one different user can claim the guest')
 const claimed = await db.cart.findUniqueOrThrow({where: {id: guest.id}})
 assert.equal(claim.find(Boolean).userId, claimed.userId)
 assert.equal(await load(db).findCart({userId: null, token: guest.token}), null)
 const sameGuest = await createCart(null)
 const same = await Promise.all(Array.from({length: 8}, () => load(db).findCart({userId: users[2].id, token: sameGuest.token})))
 assert.ok(same.every(row => row && row.id === sameGuest.id && row.userId === users[2].id))
 // The previous duplicate policy is kept; only source-only lines are copied.
 const source = await createCart(null)
 await db.cartLine.createMany({data: [{cartId: source.id, productId: products[0].id, quantity: 4}, {cartId: source.id, productId: products[1].id, quantity: 3}, {cartId: sameGuest.id, productId: products[0].id, quantity: 1}]})
 const merged = await Promise.all(Array.from({length: 6}, () => load(db).findCart({userId: users[2].id, token: source.token})))
 assert.ok(merged.every(row => row && row.id === sameGuest.id))
 assert.equal(await db.cart.count({where: {id: source.id}}), 0)
 assert.deepEqual((await db.cartLine.findMany({where: {cartId: sameGuest.id}, orderBy: {productId: 'asc'}})).map(row => row.quantity), [1, 3])
 const rollbackSource = await createCart(null)
 await db.cartLine.createMany({data: [{cartId: rollbackSource.id, productId: products[2].id, quantity: 2}, {cartId: rollbackSource.id, productId: products[3].id, quantity: 4}]})
 // Two source-only lines: owned duplicates are settled without a write, so the second copy is the one that fails.
 const beforeTarget = await db.cartLine.findMany({where: {cartId: sameGuest.id}, orderBy: {id: 'asc'}})
 const beforeSource = await db.cartLine.findMany({where: {cartId: rollbackSource.id}, orderBy: {id: 'asc'}})
 const failure = new Error('owned fixture copy failure')
 const broken = new Proxy(db, {get(target, key) {if (key === '$transaction') return fn => db.$transaction(tx => {
  let writes = 0
  const line = new Proxy(tx.cartLine, {get(model, property) {if (property === 'upsert') return async args => {if (++writes === 2) throw failure; return model.upsert(args)}; return model[property]}})
  return fn(new Proxy(tx, {get(model, property) {return property === 'cartLine' ? line : model[property]}}))
 }); return typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
 await assert.rejects(load(broken).findCart({userId: users[2].id, token: rollbackSource.token}), error => error === failure)
 assert.deepEqual(await db.cartLine.findMany({where: {cartId: sameGuest.id}, orderBy: {id: 'asc'}}), beforeTarget)
 assert.deepEqual(await db.cartLine.findMany({where: {cartId: rollbackSource.id}, orderBy: {id: 'asc'}}), beforeSource)
 assert.equal((await db.cart.findUniqueOrThrow({where: {id: rollbackSource.id}})).userId, null)
 const twins = [await createCart(null), await createCart(null)]
 await db.cartLine.createMany({data: twins.map((row, index) => ({cartId: row.id, productId: products[index].id, quantity: index + 1}))})
 const twinClaims = await Promise.all(twins.map(row => load(db).findCart({userId: users[3].id, token: row.token})))
 assert.equal(new Set(twinClaims.map(row => row.id)).size, 1, 'two browsers resolve one canonical owned cart')
 assert.deepEqual((await db.cartLine.findMany({where: {cartId: twinClaims[0].id}, orderBy: {productId: 'asc'}})).map(row => row.quantity), [1, 2])
 // Claim between guest resolution and the write transaction; no stale guest writes.
 const mutationGuest = await createCart(null)
 const line = await db.cartLine.create({data: {cartId: mutationGuest.id, productId: products[0].id, quantity: 1}})
 const service = load(new Proxy(db, {get(target, key) {if (key === '$transaction') return async fn => {await db.cart.update({where: {id: mutationGuest.id}, data: {userId: users.find(user => user.id !== claimed.userId && user.id !== users[2].id).id}}); return db.$transaction(fn)}; return typeof target[key] === 'function' ? target[key].bind(target) : target[key]}}))
 const owner = {userId: null, token: mutationGuest.token}
 for (const mutate of [() => service.addToCart(owner, {productId: products[0].id}), () => service.updateCartLine(owner, line.id, 2), () => service.clearCart(owner), () => service.removePurchasedLines(owner, [line.id])]) {
  await db.cart.update({where: {id: mutationGuest.id}, data: {userId: null}})
  await assert.rejects(mutate(), error => error.code === 'CART_CHANGED')
  assert.equal((await db.cartLine.findUniqueOrThrow({where: {id: line.id}})).quantity, 1)
 }
 const rotated = await load(db).ensureCart({userId: null, token: claimed.token}); carts.push(rotated.id)
 assert.equal(rotated.userId, null); assert.notEqual(rotated.id, claimed.id); assert.notEqual(rotated.token, claimed.token)
 if (process.env.GUEST_OWNER_API === '1') {
  const {encode} = require('next-auth/jwt'), base = 'http://localhost:3000', user = users.find(row => row.id === claimed.userId)
  const jwt = await encode({secret: process.env.NEXTAUTH_SECRET, token: {uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now()}})
  const call = (method, body, authenticated = false) => fetch(base + '/api/cart', {method, headers: {origin: base, 'content-type': 'application/json', cookie: `mc_cart=${claimed.token}${authenticated ? `; next-auth.session-token=${jwt}` : ''}`}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000)})
  const before = await db.cartLine.findMany({where: {cartId: claimed.id}})
  let response = await call('GET'); assert.equal(response.status, 200); assert.equal((await response.json()).cart.count, 0)
  response = await call('GET', null, true); assert.equal(response.status, 200); assert.equal((await response.json()).cart.count, 2)
  assert.equal((await call('PATCH', {lineId: before[0].id, quantity: 7})).status, 404)
  assert.equal((await call('DELETE')).status, 200)
  response = await call('POST', {productId: products[0].id, quantity: 1}); assert.equal(response.status, 200, await response.clone().text())
  const body = await response.json(), created = await db.cart.findUniqueOrThrow({where: {token: body.cart.token}}); carts.push(created.id)
  assert.equal(created.userId, null); assert.notEqual(created.id, claimed.id)
  assert.deepEqual(await db.cartLine.findMany({where: {cartId: claimed.id}}), before)
  console.log('Actual auth/guest HTTP claimed-token privacy, guest update/clear exclusion, fresh guest cart/token and unchanged owned lines passed')
 }
 console.log('PostgreSQL same-token different/same-user claims, atomic merge/duplicate policy/copy-failure rollback, stale guest mutations and claimed-token rotation passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {await db.cart.deleteMany({where: {id: {in: carts}}}); await db.product.deleteMany({where: {id: {in: products.map(row => row.id)}}}); await db.user.deleteMany({where: {id: {in: users.map(row => row.id)}}})} finally {await db.$disconnect()}
})
