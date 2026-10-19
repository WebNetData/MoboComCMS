// Real PostgreSQL newsletter sending; SMTP and settings are isolated, and the run only sees this script's campaigns and subscribers.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `newsletter-send-${Date.now()}`
const baseline = process.env.NEWSLETTER_SEND_BASELINE
const state = {failRecipientWrites: 0, mailDelayMs: 0, throwFor: '', capFor: ''}, mails = []
const scoped = (model, where) => new Proxy(model, {get(target, key) {return key === 'findMany' ? args => target.findMany({...args, where: {...args.where, ...where}}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
const delivery = new Proxy(prisma.newsletterDelivery, {get(target, key) {return key === 'createMany' ? async args => {if (state.failRecipientWrites-- > 0) throw new Error('database unavailable'); return target.createMany(args)} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
const models = {newsletterCampaign: scoped(prisma.newsletterCampaign, {subject: {startsWith: seed}}), newsletterSubscriber: scoped(prisma.newsletterSubscriber, {email: {startsWith: seed}}), newsletterDelivery: delivery}
const db = new Proxy(prisma, {get(target, key) {return Object.hasOwn(models, key) ? models[key] : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// NEWSLETTER_SEND_BASELINE=<git ref> runs the newsletter service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/mail/server/newsletter.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/config/env': {authSecret: () => 'test-only'},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {getSettings: async () => ({brandName: 'QA', siteUrl: 'http://localhost'}), readJsonSetting: async () => ({perMinute: 300}), writeJsonSetting: async () => {}},
 '@/shared/content/sanitize': {cleanRichText: html => html},
 '@/modules/mail/server/mailer': {getSmtp: async () => ({enabled: true, dailyLimit: 0}), sendMail: async mail => {
  if (mail.to === state.throwFor) throw new Error('smtp connection reset')
  if (mail.to === state.capFor) return {ok: false, error: 'daily limit reached'}
  if (state.mailDelayMs) await new Promise(resolve => setTimeout(resolve, state.mailDelayMs))
  mails.push(mail.to); return {ok: true, messageId: `${mails.length}`}
 }},
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const email = index => `${seed}-${String(index).padStart(3, '0')}@example.com`
const campaign = name => prisma.newsletterCampaign.create({data: {subject: `${seed} ${name}`, html: '<p>hello</p>', audience: 'subscribers', status: 'SCHEDULED', scheduledAt: new Date(Date.now() - 60_000)}})
const read = row => prisma.newsletterCampaign.findUniqueOrThrow({where: {id: row.id}})
const statuses = async row => Object.fromEntries((await prisma.newsletterDelivery.groupBy({by: ['status'], where: {campaignId: row.id}, _count: {_all: true}})).map(item => [item.status, item._count._all]))
const sentTo = address => mails.filter(to => to === address).length
async function main() {
 const service = load('src/modules/mail/server/newsletter.ts')
 await prisma.newsletterSubscriber.createMany({data: Array.from({length: 12}, (_, i) => ({email: email(i), status: 'ACTIVE', token: `${seed}-sub-${i}`}))})
 // The recipient list cannot be stored on the first attempt.
 const first = await campaign('first')
 state.failRecipientWrites = 1
 await service.runNewsletter().catch(() => {})
 state.failRecipientWrites = 0
 if (baseline) {
  await service.runNewsletter()
  const row = await read(first)
  assert.equal(row.status, 'SENT'); assert.equal(row.sent, 0); assert.equal(mails.length, 0)
  console.log(`Reproduced at ${baseline}: a failed recipient write left the campaign marked as sent to nobody although 12 subscribers were due`)
  const second = await campaign('second')
  state.mailDelayMs = 40
  await Promise.all([service.runNewsletter(), service.runNewsletter()])
  assert.ok(sentTo(email(0)) > 1); assert.ok((await read(second)).sent > 12)
  console.log(`Reproduced at ${baseline}: a manual run overlapping the scheduler sent the same campaign to a subscriber ${sentTo(email(0))} times`)
  return
 }
 let row = await read(first)
 assert.equal(row.status, 'SCHEDULED', 'a campaign whose recipients are not stored does not start'); assert.equal(mails.length, 0)
 // One subscriber leaves before the retry; a row of the failed attempt for them must not be mailed.
 await prisma.newsletterDelivery.create({data: {campaignId: first.id, email: email(11), token: `${seed}-leftover`}})
 await prisma.newsletterSubscriber.update({where: {email: email(11)}, data: {status: 'UNSUBSCRIBED'}})
 state.mailDelayMs = 40
 // The scheduler and a manual run overlap.
 const runs = await Promise.all([service.runNewsletter(), service.runNewsletter()])
 row = await read(first)
 assert.equal(row.total, 11); assert.equal(runs[0].sent + runs[1].sent, 11); assert.equal(row.sent, 11); assert.equal(row.failed, 0)
 assert.deepEqual([...mails].sort(), Array.from({length: 11}, (_, i) => email(i)), 'every recipient is mailed exactly once')
 assert.deepEqual(await statuses(first), {SENT: 11})
 await service.runNewsletter()
 row = await read(first)
 assert.equal(row.status, 'SENT'); assert.ok(row.finishedAt); assert.equal(mails.length, 11)
 state.mailDelayMs = 0
 // A delivery that throws fails alone; the daily cap leaves the rest pending for the next tick.
 const second = await campaign('second')
 state.throwFor = email(1); state.capFor = email(4)
 assert.deepEqual(await service.runNewsletter(), {sent: 3})
 assert.deepEqual(await statuses(second), {SENT: 3, FAILED: 1, PENDING: 7})
 const failed = await prisma.newsletterDelivery.findFirstOrThrow({where: {campaignId: second.id, status: 'FAILED'}})
 assert.equal(failed.email, email(1)); assert.ok(failed.error.includes('smtp connection reset')); assert.equal(failed.sentAt, null)
 row = await read(second)
 assert.equal(row.status, 'SENDING'); assert.equal(row.sent, 3); assert.equal(row.failed, 1)
 // A sender that stopped keeps its claim for a while; the campaign is not finished and the mail is not repeated early.
 state.throwFor = ''; state.capFor = ''
 const held = await prisma.newsletterDelivery.findFirstOrThrow({where: {campaignId: second.id, email: email(4)}})
 await prisma.newsletterDelivery.update({where: {id: held.id}, data: {status: 'SENDING', sentAt: new Date()}})
 assert.deepEqual(await service.runNewsletter(), {sent: 6})
 await service.runNewsletter()
 assert.equal((await read(second)).status, 'SENDING', 'a held delivery keeps the campaign open'); assert.equal(sentTo(email(4)), 1)
 // After the claim expires the delivery is sent and the campaign finishes.
 await prisma.newsletterDelivery.update({where: {id: held.id}, data: {sentAt: new Date(Date.now() - 16 * 60_000)}})
 assert.deepEqual(await service.runNewsletter(), {sent: 1}); assert.equal(sentTo(email(4)), 2)
 await service.runNewsletter()
 row = await read(second)
 assert.equal(row.status, 'SENT'); assert.equal(row.sent, 10); assert.equal(row.failed, 1); assert.deepEqual(await statuses(second), {SENT: 10, FAILED: 1})
 // A campaign cancelled while sending sends nothing more.
 const third = await campaign('third')
 state.capFor = email(2)
 await service.runNewsletter(); await service.campaignCancel(third.id)
 state.capFor = ''
 const before = mails.length
 assert.deepEqual(await service.runNewsletter(), {sent: 0}); assert.equal(mails.length, before); assert.equal((await read(third)).status, 'CANCELLED')
 console.log('PostgreSQL recipient-freeze retry without partial sending, removed stale recipient, overlapping runs mailing once, isolated delivery failure, daily cap, held and expired claims, cancellation passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.newsletterCampaign.findMany({where: {subject: {startsWith: seed}}, select: {id: true}})).map(item => item.id)
  await prisma.newsletterDelivery.deleteMany({where: {campaignId: {in: ids}}}); await prisma.newsletterCampaign.deleteMany({where: {id: {in: ids}}})
  await prisma.newsletterSubscriber.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await prisma.$disconnect()}
})
