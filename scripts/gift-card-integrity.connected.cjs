// Real PostgreSQL gift cards and wallet; settings, the inbox and code encryption are test doubles.
// GIFT_CARD_BASELINE=<git ref> runs the marketing service of that revision to show the faults there;
// GIFT_CARD_SKIP=purchase,redeem leaves out the earlier sections so a later fault can be seen on that revision too.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `gift-integrity-${Date.now()}`, baseline = process.env.GIFT_CARD_BASELINE
// `blind`: the "already bought?" lookup finds nothing, as for a second request that passed it before the first one stored its card.
// `stale`: a card read by id returns this older snapshot, as for a moderator's page read just before the card was redeemed.
const state = {blind: false, stale: null}
const giftCard = new Proxy(prisma.giftCard, {get(target, key) {
 if (key === 'findFirst') return args => state.blind ? Promise.resolve(null) : target.findFirst(args)
 if (key === 'findUnique') return args => state.stale && args.where.id === state.stale.id ? Promise.resolve(state.stale) : target.findUnique(args)
 return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
}})
const db = new Proxy(prisma, {get: (target, key) => key === 'giftCard' ? giftCard : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/store/server/marketing.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/config/env': {authSecret: () => 'test-only'},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {readJsonSetting: async key => key === 'store.giftCards.v1' ? {purchaseEnabled: true, minToman: 1000, maxToman: 10_000_000, validityDays: 30} : null, writeJsonSetting: async () => {}},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => event},
 '@/modules/providers/server/panel-credentials': {encryptPanelCredential: value => `enc:${value}`, decryptPanelCredential: value => String(value).replace(/^enc:/, '')},
 '@/modules/store/server/cart': {},
}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const skip = name => (process.env.GIFT_CARD_SKIP || '').split(',').includes(name)
const refuses = (promise, code) => assert.rejects(promise, error => error.code === code || error.status === code)
async function main() {
 const service = load('src/modules/store/server/marketing.ts'), wallet = load('src/modules/wallet/server/wallet.ts')
 const [buyer, friend, stranger] = await Promise.all(['buyer', 'friend', 'stranger'].map(name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 const balance = async user => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: user.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const cardsOf = key => prisma.giftCard.count({where: {note: `buy:${buyer.id}:${key}`}})
 assert.ok((await wallet.moveWallet({userId: buyer.id, amount: 500_000, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-topup`})).ok)

 // --- one purchase, one card: a duplicate request that got past the "already bought?" lookup
 const first = await service.purchaseGiftCard(buyer.id, {toman: 100_000, idempotencyKey: `${seed}-k1`})
 assert.equal(await balance(buyer), 400_000)
 state.blind = true
 const second = await service.purchaseGiftCard(buyer.id, {toman: 100_000, idempotencyKey: `${seed}-k1`})
 state.blind = false
 assert.equal(await balance(buyer), 400_000, 'the wallet is debited once')
 if (!skip('purchase')) {
  assert.equal(await cardsOf(`${seed}-k1`), 1, 'one paid purchase yields one card')
  assert.equal(second.id, first.id); assert.equal(second.code, first.code); assert.equal(second.replayed, true)
 }
 // The ordinary retry still answers with the same card, and another purchase gets its own.
 const third = await service.purchaseGiftCard(buyer.id, {toman: 100_000, idempotencyKey: `${seed}-k1`})
 assert.deepEqual([third.id, third.code, third.replayed], [first.id, first.code, true])
 const other = await service.purchaseGiftCard(buyer.id, {toman: 50_000, idempotencyKey: `${seed}-k2`})
 assert.notEqual(other.id, first.id); assert.equal(await balance(buyer), 350_000)
 // A card bought before the key existed (no purchaseKey) is still found by its note.
 await prisma.giftCard.update({where: {id: other.id}, data: {purchaseKey: null}}).catch(() => undefined)
 assert.equal((await service.purchaseGiftCard(buyer.id, {toman: 50_000, idempotencyKey: `${seed}-k2`})).id, other.id); assert.equal(await balance(buyer), 350_000)

 // --- redeeming: an attempt that stopped between the claim and the credit is finished by the same member, once
 await prisma.giftCard.update({where: {id: first.id}, data: {status: 'REDEEMED', redeemedBy: friend.id, redeemedAt: new Date()}})
 await refuses(service.redeemGiftCard(stranger.id, first.code), 'USED')
 assert.equal(await balance(stranger), 0)
 if (!skip('redeem')) {
  const recovered = await service.redeemGiftCard(friend.id, first.code).catch(error => ({error}))
  assert.equal(recovered.amount, 100_000, 'the member the card was claimed for gets its value'); assert.equal(await balance(friend), 100_000)
  await refuses(service.redeemGiftCard(friend.id, first.code), 'USED')
  assert.equal(await balance(friend), 100_000, 'and only once')
 } else await wallet.moveWallet({userId: friend.id, amount: 100_000, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-skip`})
 // The ordinary path is unchanged.
 assert.equal((await service.redeemGiftCard(friend.id, other.code)).amount, 50_000); assert.equal(await balance(friend), 150_000)
 await refuses(service.redeemGiftCard(stranger.id, other.code), 'USED')

 // --- a status change decided on an older read must not reactivate a redeemed card
 state.stale = {...(await prisma.giftCard.findUniqueOrThrow({where: {id: other.id}})), status: 'ACTIVE', redeemedBy: null, redeemedAt: null}
 await refuses(service.setGiftCardStatus(other.id, false), 409)
 await refuses(service.setGiftCardStatus(other.id, true), 409)
 state.stale = null
 assert.equal((await prisma.giftCard.findUniqueOrThrow({where: {id: other.id}})).status, 'REDEEMED')
 await refuses(service.redeemGiftCard(stranger.id, other.code), 'USED'); assert.equal(await balance(stranger), 0)
 // Disabling and enabling an unused card still works.
 const spare = await service.purchaseGiftCard(buyer.id, {toman: 10_000, idempotencyKey: `${seed}-k3`})
 await service.setGiftCardStatus(spare.id, true); await refuses(service.redeemGiftCard(stranger.id, spare.code), 'DISABLED')
 await service.setGiftCardStatus(spare.id, false); assert.equal((await service.redeemGiftCard(stranger.id, spare.code)).amount, 10_000)
 console.log('PostgreSQL gift cards: one card per paid purchase, interrupted redemption finished once by its member, redeemed card not reactivated by a stale status change passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await prisma.giftCard.deleteMany({where: {OR: [{purchaserId: {in: ids}}, {redeemedBy: {in: ids}}]}}); await prisma.walletTx.deleteMany({where: {userId: {in: ids}}})
  await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
