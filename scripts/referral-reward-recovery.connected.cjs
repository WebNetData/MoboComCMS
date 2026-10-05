// Real PostgreSQL referral rewards with the real wallet. The recovery step only sees this script's invoices.
// REFERRAL_BASELINE=<git ref> runs the referral service of that revision to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `referral-recovery-${Date.now()}`, baseline = process.env.REFERRAL_BASELINE
const state = {failWalletFor: 0}
const own = args => ({...args, where: {...args.where, number: {startsWith: seed}}})
const invoice = new Proxy(prisma.invoice, {get: (target, key) => key === 'findMany' ? args => target.findMany(own(args)) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'invoice' ? invoice : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/referrals/server/referrals.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {'@/platform/database/prisma': {db}, '@/platform/observability/logger': {logEvent: () => {}}}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (name === '@/modules/wallet/server/wallet') {const real = load('src/modules/wallet/server/wallet.ts'); return {...real, moveWallet: async input => input.userId === state.failWalletFor ? {ok: false, message: 'wallet unavailable'} : real.moveWallet(input)}}
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
let count = 0, product
const user = name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
async function purchase(buyer, totalMinor, minutesAgo, withOrder = true) {
 const order = withOrder ? await prisma.order.create({data: {userId: buyer.id, idempotencyKey: `${seed}-${count}`, totalAmount: Number(totalMinor), totalMinor, currency: 'IRT', productId: product.id, status: 'PAID'}}) : null
 return prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: buyer.id, orderId: order?.id ?? null, status: 'PAID', kind: 'BILLING', totalMinor, currency: 'IRT', paidAt: new Date(Date.now() - minutesAgo * 60_000)}})
}
async function main() {
 const service = load('src/modules/referrals/server/referrals.ts')
 product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 const referrer = await user('referrer')
 const balance = async () => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: referrer.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const refer = async name => { const referred = await user(name); return {referred, attribution: await prisma.referralAttribution.create({data: {referredUserId: referred.id, referrerUserId: referrer.id, code: 'TEST', rewardBps: 1000}})} }
 const state_ = async row => prisma.referralAttribution.findUniqueOrThrow({where: {id: row.attribution.id}})

 // --- the ordinary case: the first paid purchase pays 10% once
 const a = await refer('a')
 const a1 = await purchase(a.referred, 200_000n, 30)
 await service.awardReferralForInvoice(a1.id)
 assert.equal(await balance(), 20_000); assert.equal((await state_(a)).rewardMinor, 20_000n)
 await service.awardReferralForInvoice(a1.id)
 const a2 = await purchase(a.referred, 900_000n, 5)
 await service.awardReferralForInvoice(a2.id)
 assert.equal(await balance(), 20_000, 'a second purchase and a repeated event pay nothing more')

 // --- the reward attempt at the first purchase never ran (the process stopped after the payment settled)
 const b = await refer('b')
 await purchase(b.referred, 300_000n, 60)
 const b2 = await purchase(b.referred, 50_000n, 10)
 await service.awardReferralForInvoice(b2.id)
 assert.equal(await balance(), 50_000, 'the next purchase makes good the reward of the first one, at the first purchase\'s amount')
 const paidB = await state_(b)
 assert.ok(paidB.rewardedAt); assert.equal(paidB.rewardMinor, 30_000n)

 // --- the attempt failed (wallet unavailable) and the member never buys again: the worker step pays it
 if (!baseline) {
  const c = await refer('c')
  const c1 = await purchase(c.referred, 100_000n, 20)
  state.failWalletFor = referrer.id
  await assert.rejects(service.awardReferralForInvoice(c1.id))
  assert.equal((await state_(c)).rewardedAt, null)
  assert.deepEqual(await service.recoverReferralRewards(), {checked: 1, paid: 0, failed: 1}, 'still failing: counted, nothing paid')
  state.failWalletFor = 0
  // A referred account whose first purchase has no order earns nothing, and one that never bought is not even looked at.
  const d = await refer('d'); await purchase(d.referred, 400_000n, 15, false); await purchase(d.referred, 400_000n, 14)
  await refer('never-bought')
  assert.deepEqual(await service.recoverReferralRewards(), {checked: 2, paid: 1, failed: 0})
  assert.equal(await balance(), 60_000); assert.equal((await state_(c)).rewardMinor, 10_000n); assert.equal((await state_(d)).rewardedAt, null)
  // Credited but not marked (stopped between the two writes): the mark is repaired without paying again.
  await prisma.referralAttribution.update({where: {id: c.attribution.id}, data: {rewardedAt: null, rewardMinor: 0n, rewardOrderId: null}})
  assert.deepEqual(await service.recoverReferralRewards(), {checked: 2, paid: 0, failed: 0})
  assert.equal(await balance(), 60_000); assert.ok((await state_(c)).rewardedAt)
  // A purchase older than the window is not scanned.
  assert.deepEqual(await service.recoverReferralRewards(0.001), {checked: 0, paid: 0, failed: 0})
 }
 console.log(baseline ? `No fault shown at ${baseline}` : 'PostgreSQL referral rewards: paid once for the first purchase, made good by a later purchase or by the worker step, failures isolated, mark repaired without a second payment passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.referralAttribution.deleteMany({where: {referrerUserId: {in: ids}}}); await prisma.invoice.deleteMany({where: {number: {startsWith: seed}}}); await prisma.order.deleteMany({where: {userId: {in: ids}}})
  await prisma.walletTx.deleteMany({where: {userId: {in: ids}}}); await prisma.product.deleteMany({where: {slug: seed}}); await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
