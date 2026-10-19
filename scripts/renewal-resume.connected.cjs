// Real PostgreSQL orders, invoices and wallet for wallet-paid subscription renewals. The panel adapter, the fulfillment queue,
// the inbox, extension events and follow-ups are test doubles. The sweep only sees this script's orders.
// RENEWAL_BASELINE=<git ref> runs the subscription actions of that revision to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `renewal-resume-${Date.now()}`, baseline = process.env.RENEWAL_BASELINE
const state = {stopAfter: '', jobs: [], users: []}
class Stop extends Error {}
// The sweep's order scan is limited to this script's customers.
const orders = model => new Proxy(model, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: {...args.where, userId: {in: state.users}}}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'order' ? orders(target.order) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/subscriptions/server/submanage.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/providers/server/panels': {getPanelAdapter: () => ({})},
 '@/modules/subscriptions/server/provision': {syncSubscription: async () => ({ok: true})},
 '@/modules/subscriptions/server/renewal-preview': {renewalTerms: () => 'terms'},
 '@/shared/security/random': {randomToken: () => 'token'},
 // The queue: records what was queued, like the real one keyed by dedupeKey.
 '@/modules/fulfillment/server/jobs': {enqueueFulfillment: async job => { if (!state.jobs.some(row => row.dedupeKey === job.dedupeKey)) state.jobs.push(job); return {id: 1} }, processFulfillmentJob: async () => ({ok: true})},
 '@/modules/billing/server/gateways': {maskSecret: value => value},
 '@/extensions/server/runtime': {emitExtensionEvent: async () => {}},
 '@/modules/notifications/server/inbox': {invoicePaidEvent: async () => {}},
 '@/modules/sms/server/sms': {notifyAdmins: async () => {}},
 '@/modules/referrals/server/referrals': {awardReferralForInvoice: async () => {}},
}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  // The process "stops" right after the named step of the renewal: the step has happened, nothing after it has.
  if (name === '@/modules/wallet/server/wallet') {const real = load('src/modules/wallet/server/wallet.ts'); return {...real, moveWallet: async input => { const result = await real.moveWallet(input); if (state.stopAfter === 'charge' && input.type === 'RENEWAL') throw new Stop('stopped after the charge'); return result }}}
  if (name === '@/modules/billing/server/billing') {const real = load('src/modules/billing/server/billing.ts'); return {...real, createInvoiceForOrder: async input => { const row = await real.createInvoiceForOrder(input); if (state.stopAfter === 'invoice') throw new Stop('stopped after the invoice'); return row }}}
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
async function main() {
 const actions = load('src/modules/subscriptions/server/submanage.ts'), wallet = load('src/modules/wallet/server/wallet.ts')
 const panel = await prisma.panel.create({data: {name: seed, url: 'https://panel.invalid', type: 'REMNAWAVE', token: 'test-only'}})
 const plan = await prisma.plan.create({data: {name: seed, trafficGB: 50, days: 30, price: 100_000, priceMinor: 100_000n, currency: 'IRT', panelId: panel.id}})
 const customer = async name => {
  const user = await prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}}); state.users.push(user.id)
  assert.ok((await wallet.moveWallet({userId: user.id, amount: 250_000, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-fund-${name}`})).ok)
  return {user, sub: await prisma.subscription.create({data: {userId: user.id, planId: plan.id, username: `${seed}-${name}`, expiresAt: new Date(Date.now() + 86_400_000), subToken: `${seed}-${name}`}})}
 }
 const balance = async user => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: user.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const orderOf = (sub, key) => prisma.order.findUnique({where: {idempotencyKey: `renew:${sub.id}:${key}`}, include: {invoice: true}})
 const queued = order => state.jobs.filter(job => job.orderId === order.id).length
 const renew = (sub, key) => actions.subscriptionAction(sub.id, 'renew', {idempotencyKey: key, expectedTerms: 'terms'})
 const stopping = async (step, run) => { state.stopAfter = step; await assert.rejects(run(), Stop); state.stopAfter = '' }

 // --- the process stops after the wallet was charged; the customer retries
 const a = await customer('a')
 await stopping('charge', () => renew(a.sub, 'key-aaaa-1'))
 assert.equal(await balance(a.user), 150_000, 'the wallet was charged')
 let retry = await renew(a.sub, 'key-aaaa-1')
 let order = await orderOf(a.sub, 'key-aaaa-1')
 assert.equal(order.invoice.status, 'PAID', 'the retry finishes the renewal the customer already paid for')
 assert.equal(order.status, 'PAID'); assert.equal(queued(order), 1, 'the renewal is queued'); assert.equal(await balance(a.user), 150_000, 'charged once')
 assert.deepEqual([retry.ok, retry.data.replayed, retry.data.charged], [true, true, 100_000])
 if (baseline) return console.log(`No fault shown at ${baseline}`)
 // The plan changes afterwards: a later retry still answers from the finished order and charges nothing.
 await prisma.plan.update({where: {id: plan.id}, data: {price: 999_000, priceMinor: 999_000n}})
 retry = await renew(a.sub, 'key-aaaa-1')
 assert.deepEqual([retry.ok, retry.data.replayed, retry.data.charged], [true, true, 100_000]); assert.equal(await balance(a.user), 150_000); assert.equal(queued(order), 1)
 await prisma.plan.update({where: {id: plan.id}, data: {price: 100_000, priceMinor: 100_000n}})

 // --- the process stops before the charge; the retry charges once, at the price frozen by the first attempt
 const b = await customer('b')
 await stopping('invoice', () => renew(b.sub, 'key-bbbb-1'))
 assert.equal(await balance(b.user), 250_000)
 await prisma.plan.update({where: {id: plan.id}, data: {price: 180_000, priceMinor: 180_000n, days: 90}})
 retry = await renew(b.sub, 'key-bbbb-1')
 order = await orderOf(b.sub, 'key-bbbb-1')
 assert.equal(await balance(b.user), 150_000, 'the frozen price, not the new one'); assert.equal(order.invoice.status, 'PAID')
 assert.equal(state.jobs.find(job => job.orderId === order.id).payload.days, 30, 'and the frozen allowance')
 await prisma.plan.update({where: {id: plan.id}, data: {price: 100_000, priceMinor: 100_000n, days: 30}})

 // --- a resumed attempt whose charge fails is closed, and the same key is then refused
 const c = await customer('c')
 await stopping('invoice', () => renew(c.sub, 'key-cccc-1'))
 await prisma.walletAccount.update({where: {userId_currency: {userId: c.user.id, currency: 'IRT'}}, data: {balanceMinor: 10n}})
 retry = await renew(c.sub, 'key-cccc-1')
 assert.deepEqual([retry.ok, retry.code], [false, 'WALLET_FAILED'])
 order = await orderOf(c.sub, 'key-cccc-1')
 assert.deepEqual([order.status, order.invoice.status], ['FAILED', 'VOID'])
 assert.deepEqual([(await renew(c.sub, 'key-cccc-1')).ok, (await renew(c.sub, 'key-cccc-1')).code], [false, 'WALLET_FAILED'], 'a failed attempt is not run again under its key')
 assert.equal(queued(order), 0)

 // --- nobody retries: the sweep settles what was charged and closes what was not
 const {recoverPendingRenewals} = load('src/modules/subscriptions/server/renewal-recovery.ts')
 const [d, e, f] = [await customer('d'), await customer('e'), await customer('f')]
 await stopping('charge', () => renew(d.sub, 'key-dddd-1'))
 await stopping('invoice', () => renew(e.sub, 'key-eeee-1'))
 await stopping('charge', () => renew(f.sub, 'key-ffff-1'))
 const age = (sub, key, minutes) => prisma.order.update({where: {idempotencyKey: `renew:${sub.id}:${key}`}, data: {createdAt: new Date(Date.now() - minutes * 60_000)}})
 await age(d.sub, 'key-dddd-1', 30); await age(e.sub, 'key-eeee-1', 30); await age(f.sub, 'key-ffff-1', 2)
 assert.deepEqual(await recoverPendingRenewals(), {checked: 2, settled: 1, closed: 1, failed: 0}, 'an attempt younger than ten minutes may still be running and is left')
 order = await orderOf(d.sub, 'key-dddd-1')
 assert.deepEqual([order.status, order.invoice.status, await balance(d.user)], ['PAID', 'PAID', 150_000], 'the charged renewal is settled; the fulfillment recovery queues it')
 order = await orderOf(e.sub, 'key-eeee-1')
 assert.deepEqual([order.status, order.invoice.status, await balance(e.user)], ['FAILED', 'VOID', 250_000], 'the uncharged attempt is closed and nothing was taken')
 assert.equal((await orderOf(f.sub, 'key-ffff-1')).status, 'PENDING')
 assert.deepEqual(await recoverPendingRenewals(), {checked: 0, settled: 0, closed: 0, failed: 0})
 console.log('PostgreSQL wallet renewals: a retry finishes a charged or uncharged attempt once at the frozen terms, a failed attempt is refused, a finished one replayed, and the sweep settles charged and closes uncharged attempts passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await prisma.payment.deleteMany({where: {userId: {in: state.users}}}); await prisma.invoice.deleteMany({where: {userId: {in: state.users}}}); await prisma.walletTx.deleteMany({where: {userId: {in: state.users}}})
  await prisma.order.deleteMany({where: {userId: {in: state.users}}}); await prisma.subscription.deleteMany({where: {userId: {in: state.users}}})
  await prisma.plan.deleteMany({where: {name: seed}}); await prisma.panel.deleteMany({where: {name: seed}}).catch(() => {}); await prisma.user.deleteMany({where: {id: {in: state.users}}})
 } finally {await prisma.$disconnect()}
})
