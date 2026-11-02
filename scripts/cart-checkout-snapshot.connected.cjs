// Real PostgreSQL snapshot cleanup; membership/shipping providers are isolated.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `cart-snapshot-${Date.now()}`, products = []
let user, cart
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
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
async function main() {
 user = await db.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 for (let i = 0; i < 3; i++) products.push(await db.product.create({data: {slug: `${seed}-${i}`, name: seed, price: 1, priceMinor: 100n, currency: 'USD', stock: 30, approval: 'APPROVED'}}))
 cart = await db.cart.create({data: {userId: user.id, token: `${seed}-cart`}})
 const owner = {userId: user.id, token: null}, service = load('src/modules/store/server/cart.ts')
 await db.cartLine.createMany({data: products.slice(0, 2).map((row, index) => ({cartId: cart.id, productId: row.id, quantity: index + 1}))})
 let snapshot = await service.cartCheckoutLines(owner)
 const first = snapshot.lines.find(row => row.productId === products[0].id)
 await service.updateCartLine(owner, first.lineId, 3)
 await service.addToCart(owner, {productId: products[2].id})
 await service.removePurchasedLines(owner, snapshot.lines.map(row => row.lineId), snapshot.snapshot)
 let rows = await db.cartLine.findMany({where: {cartId: cart.id}, orderBy: {productId: 'asc'}})
 if (process.env.CART_SNAPSHOT_BASELINE === '1') {assert.deepEqual(rows.map(row => row.productId), [products[2].id]); console.log('Reproduced: after checkout snapshot, changing quantity1 to3 still deleted the changed line'); return}
 assert.deepEqual(rows.map(row => [row.productId, row.quantity]), [[products[0].id, 3], [products[2].id, 1]])
 assert.equal(JSON.stringify(await service.cartView(owner)).includes('updatedAt'), false, 'public view does not expose revision metadata')
 snapshot = await service.cartCheckoutLines(owner)
 const kept = rows[0]
 await db.cartLine.update({where: {id: kept.id}, data: {updatedAt: new Date(kept.updatedAt.getTime() + 1000)}})
 await service.removePurchasedLines(owner, snapshot.lines.map(row => row.lineId), snapshot.snapshot)
 assert.equal(await db.cartLine.count({where: {cartId: cart.id}}), 1, 'same quantity with a different revision stays intact')
 snapshot = await service.cartCheckoutLines(owner)
 await db.cartLine.delete({where: {id: kept.id}})
 const replacement = await db.cartLine.create({data: {cartId: cart.id, productId: kept.productId, quantity: kept.quantity}})
 await service.removePurchasedLines(owner, snapshot.lines.map(row => row.lineId), snapshot.snapshot)
 assert.equal(await db.cartLine.count({where: {id: replacement.id}}), 1, 'replacement identity cannot be consumed')
 snapshot = await service.cartCheckoutLines(owner)
 await service.removePurchasedLines({userId: null, token: cart.token}, snapshot.lines.map(row => row.lineId), snapshot.snapshot)
 assert.equal(await db.cartLine.count({where: {id: replacement.id}}), 1, 'guest cannot consume an owned snapshot')
 await service.removePurchasedLines(owner, snapshot.lines.map(row => row.lineId), snapshot.snapshot)
 assert.equal(await db.cartLine.count({where: {cartId: cart.id}}), 0, 'unchanged exact snapshot is consumed')
 const legacy = await db.cartLine.create({data: {cartId: cart.id, productId: products[0].id}})
 await service.removePurchasedLines(owner, [legacy.id]); assert.equal(await db.cartLine.count({where: {cartId: cart.id}}), 0)
 console.log('PostgreSQL exact unchanged snapshot cleanup, concurrent quantity/revision/new/replaced-row preservation, private DTO, owner binding and legacy ID cleanup passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {if (cart) await db.cart.deleteMany({where: {id: cart.id}}); await db.product.deleteMany({where: {id: {in: products.map(row => row.id)}}}); if (user) await db.user.deleteMany({where: {id: user.id}})} finally {await db.$disconnect()}
})
