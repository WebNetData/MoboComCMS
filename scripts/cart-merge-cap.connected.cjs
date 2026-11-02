// Real PostgreSQL sign-in merge at the cart size limit; membership/shipping providers are isolated.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `cart-merge-cap-${Date.now()}`, products = [], carts = []
const baseline = process.env.CART_MERGE_BASELINE
let user, legacyUser
// CART_MERGE_BASELINE=<git ref> runs the cart service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/store/server/cart.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (name === '@/platform/database/prisma') return {db}
  // Public fixture scope; current group decisions have their own registered PostgreSQL suite.
  if (name === '@/modules/account/server/item-audience') return {userOpensAudience: async raw => !raw}
  if (name === '@/modules/account/server/user-groups') return {groupDeal: async () => ({percent:0,prices:new Map()})}
  if (name === '@/modules/membership/server/membership') return {isMember: async () => false, opensMembersOnly: async (_userId, member) => !!member}
  if (name === '@/modules/membership/server/tiers') return {tierStanding: async () => null}
  if (name === '@/modules/shipping/server/shipping') return {getDeliverySettings: async () => ({})}
  if (name === '@/modules/shipping/server/carriers') return {getCarrierSettings: async () => ({enabled: false})}
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const createCart = async userId => {const row = await db.cart.create({data: {userId, token: `${seed}-${carts.length}-cart`}}); carts.push(row.id); return row}
const lines = cartId => db.cartLine.findMany({where: {cartId}, orderBy: {productId: 'asc'}})
async function main() {
 const service = load('src/modules/store/server/cart.ts'), {MAX_CART_LINES} = load('src/modules/store/domain/store.ts')
 user = await db.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 await db.product.createMany({data: Array.from({length: MAX_CART_LINES + 4}, (_, i) => ({slug: `${seed}-${String(i).padStart(2, '0')}`, name: seed, price: 1, priceMinor: 100n, currency: 'USD', stock: 30, approval: 'APPROVED'}))})
 products.push(...await db.product.findMany({where: {slug: {startsWith: seed}}, orderBy: {slug: 'asc'}}))
 const id = index => products[index].id
 const owned = await createCart(user.id), guest = await createCart(null)
 // The owned cart has room for two more lines; the guest brings one duplicate and four new products.
 await db.cartLine.createMany({data: products.slice(0, MAX_CART_LINES - 2).map(row => ({cartId: owned.id, productId: row.id, quantity: 1}))})
 const start = Date.now() - 60_000
 await db.cartLine.createMany({data: [0, MAX_CART_LINES - 2, MAX_CART_LINES - 1, MAX_CART_LINES, MAX_CART_LINES + 1].map((index, order) => ({cartId: guest.id, productId: id(index), quantity: 5, createdAt: new Date(start + order * 1000)}))})
 await db.cart.update({where: {id: owned.id}, data: {reminderCount: 2}})
 const owner = {userId: user.id, token: guest.token}
 let view = await service.cartView(owner)
 if (baseline) {
  assert.equal((await lines(owned.id)).length, MAX_CART_LINES + 2)
  console.log(`Reproduced at ${baseline}: sign-in merge grew the owned cart to ${MAX_CART_LINES + 2} lines, above the ${MAX_CART_LINES}-line limit that checkout rejects`)
  return
 }
 let rows = await lines(owned.id)
 assert.equal(rows.length, MAX_CART_LINES, 'the merge stops at the cart size limit')
 assert.equal(rows[0].quantity, 1, 'an owned line keeps its quantity over the guest copy')
 assert.deepEqual(rows.slice(-2).map(row => [row.productId, row.quantity]), [[id(MAX_CART_LINES - 2), 5], [id(MAX_CART_LINES - 1), 5]], 'the oldest guest lines move first')
 assert.deepEqual((await lines(guest.id)).map(row => [row.productId, row.quantity]), [[id(MAX_CART_LINES), 5], [id(MAX_CART_LINES + 1), 5]], 'lines without room stay in the guest cart')
 assert.equal((await db.cart.findUniqueOrThrow({where: {id: guest.id}})).userId, null)
 assert.equal(view.waiting, 2); assert.equal(view.token, guest.token, 'the browser keeps the guest token while lines wait')
 assert.equal(view.lines.length, MAX_CART_LINES)
 // A full cart is only read: no reminder restart, no line change.
 await db.cart.update({where: {id: owned.id}, data: {reminderCount: 2}})
 const before = await db.cart.findUniqueOrThrow({where: {id: owned.id}})
 view = await service.cartView(owner)
 await service.cartCheckoutLines(owner)
 const after = await db.cart.findUniqueOrThrow({where: {id: owned.id}})
 assert.equal(after.reminderCount, 2); assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), 'waiting lines do not touch a full owned cart')
 assert.equal(view.waiting, 2)
 await assert.rejects(service.addToCart(owner, {productId: id(MAX_CART_LINES + 2)}), error => error.code === 'CART_FULL')
 // Signed out, the same browser still sees its waiting lines.
 const guestView = await service.cartView({userId: null, token: guest.token})
 assert.deepEqual(guestView.lines.map(line => line.productId).sort((a, b) => a - b), [id(MAX_CART_LINES), id(MAX_CART_LINES + 1)]); assert.equal(guestView.waiting, undefined)
 // Room made by the customer is filled oldest first on the next read.
 await service.updateCartLine(owner, rows[1].id, 0)
 view = await service.cartView(owner)
 assert.equal(view.lines.length, MAX_CART_LINES); assert.equal(view.waiting, 1)
 assert.ok(view.lines.some(line => line.productId === id(MAX_CART_LINES) && line.quantity === 5))
 assert.deepEqual((await lines(guest.id)).map(row => row.productId), [id(MAX_CART_LINES + 1)])
 // Concurrent readers move the last line exactly once and remove the emptied guest cart.
 await service.updateCartLine(owner, rows[2].id, 0)
 const views = await Promise.all(Array.from({length: 6}, () => service.cartView(owner)))
 rows = await lines(owned.id)
 assert.equal(rows.length, MAX_CART_LINES); assert.equal(rows.filter(row => row.productId === id(MAX_CART_LINES + 1)).length, 1)
 assert.equal(await db.cart.count({where: {id: guest.id}}), 0, 'a fully merged guest cart is removed')
 assert.ok(views.every(row => row.lines.length <= MAX_CART_LINES))
 view = await service.cartView(owner)
 assert.equal(view.waiting, undefined); assert.equal(view.token, owned.token)
 // A guest cart of duplicates only, or with no lines, is settled although the owned cart is full.
 const duplicates = await createCart(null), empty = await createCart(null)
 await db.cartLine.create({data: {cartId: duplicates.id, productId: rows[0].productId, quantity: 9}})
 view = await service.cartView({userId: user.id, token: duplicates.token})
 assert.equal(view.waiting, undefined); assert.equal(await db.cart.count({where: {id: duplicates.id}}), 0)
 await service.cartView({userId: user.id, token: empty.token})
 assert.equal(await db.cart.count({where: {id: empty.id}}), 0)
 assert.deepEqual((await lines(owned.id)).map(row => [row.productId, row.quantity]), rows.map(row => [row.productId, row.quantity]))
 // A cart that passed the limit before it applied is explained, takes no guest lines and recovers once trimmed.
 legacyUser = await db.user.create({data: {email: `${seed}-legacy@example.invalid`, passwordHash: 'test-only'}})
 const legacy = await createCart(legacyUser.id), extra = await createCart(null), legacyOwner = {userId: legacyUser.id, token: extra.token}
 await db.cartLine.createMany({data: products.slice(0, MAX_CART_LINES + 2).map(row => ({cartId: legacy.id, productId: row.id, quantity: 1}))})
 await db.cartLine.create({data: {cartId: extra.id, productId: id(MAX_CART_LINES + 3), quantity: 1}})
 view = await service.cartView(legacyOwner)
 assert.equal(view.overLimit, 2); assert.equal(view.blocked, true); assert.equal(view.waiting, 1); assert.equal(view.lines.length, MAX_CART_LINES + 2)
 assert.ok(view.lines.every(line => !line.issue), 'the lines themselves stay buyable')
 await assert.rejects(service.cartCheckoutLines(legacyOwner), error => error.code === 'CART_FULL' && error.status === 409)
 for (const line of view.lines.slice(0, 3)) await service.updateCartLine(legacyOwner, line.id, 0)
 view = await service.cartView(legacyOwner)
 assert.equal(view.overLimit, undefined); assert.equal(view.blocked, false); assert.equal(view.waiting, undefined); assert.equal(view.lines.length, MAX_CART_LINES)
 assert.equal((await service.cartCheckoutLines(legacyOwner)).lines.length, MAX_CART_LINES)
 if (process.env.CART_MERGE_API) {
  // Actual HTTP against a running site (CART_MERGE_API=http://localhost:3100): DTO, cookie and refill.
  const {encode} = require('next-auth/jwt'), base = process.env.CART_MERGE_API, late = await createCart(null)
  await db.cartLine.create({data: {cartId: late.id, productId: id(MAX_CART_LINES + 3), quantity: 2}})
  const jwt = await encode({secret: process.env.NEXTAUTH_SECRET, token: {uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now()}})
  const call = (method, body, authenticated = true) => fetch(base + '/api/cart', {method, headers: {origin: base, 'content-type': 'application/json', cookie: `mc_cart=${late.token}${authenticated ? `; next-auth.session-token=${jwt}` : ''}`}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(120000)})
  let response = await call('GET'), body = await response.json()
  assert.equal(response.status, 200); assert.equal(body.cart.lines.length, MAX_CART_LINES); assert.equal(body.cart.waiting, 1)
  assert.ok(response.headers.get('set-cookie').includes(`mc_cart=${late.token}`), 'the cookie keeps the guest token while a line waits')
  if (process.env.CART_MERGE_HOLD) {console.log(JSON.stringify({session: jwt, cart: late.token})); await new Promise(resolve => setTimeout(resolve, Number(process.env.CART_MERGE_HOLD)))}
  response = await call('GET', null, false); body = await response.json()
  assert.deepEqual(body.cart.lines.map(line => line.productId), [id(MAX_CART_LINES + 3)]); assert.equal(body.cart.waiting, undefined)
  response = await call('PATCH', {lineId: rows[0].id, quantity: 0}); body = await response.json()
  assert.equal(response.status, 200); assert.equal(body.cart.lines.length, MAX_CART_LINES); assert.equal(body.cart.waiting, undefined)
  assert.ok(body.cart.lines.some(line => line.productId === id(MAX_CART_LINES + 3) && line.quantity === 2))
  assert.ok(response.headers.get('set-cookie').includes(`mc_cart=${owned.token}`), 'the cookie returns to the owned cart')
  assert.equal(await db.cart.count({where: {id: late.id}}), 0)
  console.log('Actual HTTP waiting count, guest-token cookie, signed-out view of the waiting line, refill after removal and owned-token cookie passed')
 }
 console.log('PostgreSQL capped sign-in merge, oldest-first order, waiting guest lines, untouched full cart, refill after removal, concurrent single move, duplicate/empty guest settlement and over-limit cart recovery passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {await db.cart.deleteMany({where: {id: {in: carts}}}); await db.product.deleteMany({where: {slug: {startsWith: seed}}}); await db.user.deleteMany({where: {id: {in: [user, legacyUser].filter(Boolean).map(row => row.id)}}})} finally {await db.$disconnect()}
})
