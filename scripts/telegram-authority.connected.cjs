// Real PostgreSQL, Identity, restrictions, audits and webhook owners; no outgoing Telegram/provider calls.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api');
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server');
const single = process.argv.includes('--single-connection');
if (single) { const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connection_limit', '1'); url.searchParams.set('pool_timeout', '2'); process.env.DATABASE_URL = url.toString(); }
const prisma = new PrismaClient(), stamp = `telegram-authority-${Date.now()}`, users = [], products = [], telegramIds = [], cache = new Map();
let creationRace = '', creationWaiters = 0, releaseCreation; const creationGate = new Promise(resolve => { releaseCreation = resolve; });
let outage = false, privateReads = 0, checkoutCalls = 0, subscriptionCalls = 0, localeWrites = 0, ticketCalls = 0;
const sent = [], locale = new Map();
function reader(target) {
  return new Proxy(target, { get(object, key) {
    if (key === 'user') return new Proxy(object[key], { get(model, method) {
      if (method === 'create') return async args => {
        if (!single && args.data.telegramId === creationRace && creationWaiters < 2) { creationWaiters++; if (creationWaiters < 2) await creationGate; else releaseCreation(); }
        return model.create(args);
      };
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method];
    } });
    if (key === 'accessRestriction') return new Proxy(object[key], { get(model, method) {
      if (method === 'findMany') return args => { if (outage) throw Error('owned restriction storage outage'); return model.findMany(args); };
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method];
    } });
    if (key === '$transaction') return (work, options) => Array.isArray(work) ? object.$transaction(work, options) : object.$transaction(tx => work(reader(tx)), options);
    if (key === 'subscription') return new Proxy(object[key], { get(model, method) {
      if (method === 'findMany' || method === 'findUnique') return args => { privateReads++; return model[method](args); };
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method];
    } });
    return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
  } });
}
const db = reader(prisma);
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db };
    if (name === '@/platform/config/env') return { authSecret: () => 'owned-telegram-authority-secret' };
    if (name === '@/platform/observability/logger') return { logEvent: () => {}, requestIdFrom: () => stamp };
    if (name === '@/modules/notifications/server/telegram') return {
      telegramConfig: async () => ({ ready: true, webhookSecret: stamp }),
      bot: async (method, payload) => { sent.push({ method, payload }); return { ok: true }; },
      miniAppButton: async text => [{ text, url: 'https://example.invalid/miniapp' }],
      telegramWebLinkToken: async () => { ticketCalls++; return stamp; }, verifyLinkToken: async () => { ticketCalls++; return null; },
    };
    if (name === '@/modules/notifications/server/telegram-locale') return {
      getBotLocale: async id => locale.get(id) || 'fa', setBotLocale: async (id, value) => { localeWrites++; locale.set(id, value); },
      botText: (choice, en, fa) => choice === 'fa' ? fa : en, languagePrompt: 'انتخاب زبان', languageKeyboard: [],
    };
    if (name === '@/modules/wallet/server/wallet') return { walletBalances: async () => { privateReads++; return []; } };
    if (name === '@/modules/subscriptions/server/submanage') return { subscriptionAction: async () => { subscriptionCalls++; return { ok: true }; } };
    if (name === '@/modules/subscriptions/server/subs') return { siteBaseUrl: async () => 'https://example.invalid' };
    if (name === '@/modules/subscriptions/server/happ-protocol') return { safeHappLink: async () => null };
    if (name === '@/modules/checkout/server/checkout') return { executeCheckout: async () => { checkoutCalls++; return { ok: false, code: 'FIXTURE', message: 'owned delegate' }; } };
    if (name === '@/modules/billing/server/gateways') return { checkoutGatewayOptions: async () => [] };
    if (name.startsWith('@/')) { const p = 'src/' + name.slice(2); if (p.endsWith('.json')) return JSON.parse(fs.readFileSync(p, 'utf8')); return load(fs.existsSync(p + '.ts') ? p + '.ts' : p + '/index.ts'); }
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const identity = load('src/modules/identity/telegram-account.ts'), service = load('src/modules/identity/server/restrictions.ts');
const access = load('src/modules/identity/server/access.ts'), webhook = load('src/modules/notifications/server/http/telegram/webhook/route.ts');
async function create(name, extra = {}) {
  const user = await prisma.user.create({ data: { email: `${stamp}-${name}@example.invalid`, passwordHash: 'owned-fixture', name: `${stamp}-${name}`, ...extra } }); users.push(user.id); if (extra.telegramId) telegramIds.push(extra.telegramId); return user;
}
const tg = user => ({ id: Number(user.telegramId), first_name: 'changed incoming name', username: 'changed_incoming' });
async function snapshot(ids) {
  return Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
    prisma.walletAccount.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }),
    prisma.invoice.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }),
    prisma.repoLicense.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }),
    prisma.accessRestriction.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }),
  ]);
}
async function main() {
  const nonce = Date.now(), telegramId = String(7000000000000 + nonce % 1000000000000);
  const source = await create('source', { email: `tg${telegramId}.0123456789abcdef@telegram.local`, telegramId, walletBalance: 10, lastLoginAt: new Date('2020-01-01'), telegramUsername: 'original' });
  const target = await create('target', { walletBalance: 5 }), issuer = await create('issuer', { role: 'ADMIN', totpEnabledAt: new Date() });
  const actor = await access.resolveCurrentUser(issuer.id, undefined), context = { actor, req: new NextRequest('http://localhost:3000/api/owned', { headers: { Origin: 'http://localhost:3000' } }) };
  const issue = (user, extra = {}) => service.changeGlobalRestrictions(context, user.id, { action: 'issue', days: 1, reason: stamp, ...extra }, undefined);
  const revoke = (user, id) => service.changeGlobalRestrictions(context, user.id, { action: 'revoke', id, reason: stamp }, undefined);
  const moduleRow = await service.restrictionTransaction(context, source.id, 'forum.moderate', tx => service.insertModuleRestriction(tx, context, { userId: source.id, moduleKey: 'forum', effectKey: 'forum.suspend', capabilities: ['forum.post'], reason: stamp, startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) }));
  const future = await issue(source, { startsAt: new Date(Date.now() + 86400000).toISOString() });
  const expired = await issue(source, { startsAt: new Date(Date.now() - 2 * 86400000).toISOString() });
  assert.equal((await identity.userForTelegram(tg(source))).id, source.id, 'MODULE/future/expired do not block Telegram');
  await prisma.user.update({ where: { id: source.id }, data: { passwordChangedAt: new Date(Date.now() - 1000) } });
  assert.equal((await identity.userForTelegram(tg(source))).id, source.id, 'independent verified Telegram identity is not an old web session');
  const one = await issue(source), two = await issue(source);
  await prisma.walletAccount.createMany({ data: [{ userId: source.id, currency: 'USD', balanceMinor: 1000n }, { userId: target.id, currency: 'USD', balanceMinor: 500n }] });
  const invoice = await prisma.invoice.create({ data: { userId: source.id, number: stamp, subtotalMinor: 1200n, totalMinor: 1200n, subtotal: 12, total: 12 } });
  const product = await prisma.repoProduct.create({ data: { slug: stamp, name: stamp } }); products.push(product.id);
  const license = await prisma.repoLicense.create({ data: { productId: product.id, userId: source.id, keyHash: stamp, keyEnc: 'owned', keyLast4: 'test', paidMinor: 1234n } });
  let before = await snapshot([source.id, target.id]);
  assert.equal(await identity.userForTelegram(tg(source)), null);
  assert.equal((await identity.attachTelegramToUser(target.id, tg(source))).code, 'DISABLED');
  assert.equal((await identity.claimTelegramAccount({ tg: tg(source), email: `${stamp}-claim@example.invalid`, passwordHash: 'new' })).code, 'DISABLED');
  assert.deepEqual(await snapshot([source.id, target.id]), before, 'denial changes no profile, money, license or history');
  const message = text => ({ message: { chat: { id: Number(telegramId), type: 'private' }, from: tg(source), text } });
  const callback = data => ({ callback_query: { id: stamp, from: tg(source), message: { chat: { id: Number(telegramId), type: 'private' }, message_id: 1 }, data } });
  const send = (update, secret = stamp) => webhook.POST(new NextRequest('http://localhost:3000/api/telegram/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }));
  const counts = () => [privateReads, checkoutCalls, subscriptionCalls, localeWrites, ticketCalls];
  const startCounts = counts();
  for (const text of ['/start', '/start link_owned', '/link', '/me', '/sub', '/wallet']) assert.equal((await send(message(text))).status, 200);
  for (const data of ['lang:en', 'plan:view:1', 'buy:wallet:1', 'buy:gateway:1', 'subs:list', 'sub:disable:1']) assert.equal((await send(callback(data))).status, 200);
  assert.deepEqual(counts(), startCounts, 'no denied private/payment/subscription/locale/ticket delegate');
  assert.deepEqual(await snapshot([source.id, target.id]), before);
  const sends = sent.length; assert.equal((await send(message('/me'), 'forged')).status, 403); assert.equal(sent.length, sends);
  assert.equal((await send({ message: { ...message('/me').message, chat: { id: 99, type: 'group' } } })).status, 200); assert.equal(sent.length, sends);
  for (const text of ['/help', '/language', '/plans', '/buy']) await send(message(text)); await send(callback('plans:list'));
  assert.deepEqual(counts(), startCounts, 'public catalog/help are not account privileges');
  await revoke(source, one.id); assert.equal(await identity.userForTelegram(tg(source)), null, 'other overlapping GLOBAL survives');
  await revoke(source, two.id); assert.equal((await identity.userForTelegram(tg(source))).id, source.id);
  await send(message('/wallet')); assert(privateReads > startCounts[0], 'healthy account reaches existing private delegate');
  await send(callback('lang:en')); assert.equal(localeWrites, 1);
  const targetRestriction = await issue(target); before = await snapshot([source.id, target.id]);
  assert.equal((await identity.attachTelegramToUser(target.id, tg(source))).code, 'DISABLED'); assert.deepEqual(await snapshot([source.id, target.id]), before); await revoke(target, targetRestriction.id);
  await prisma.user.update({ where: { id: source.id }, data: { status: 'BANNED' } }); before = await snapshot([source.id, target.id]);
  assert.equal(await identity.userForTelegram(tg(source)), null); assert.equal((await identity.attachTelegramToUser(target.id, tg(source))).code, 'DISABLED'); assert.deepEqual(await snapshot([source.id, target.id]), before); await prisma.user.update({ where: { id: source.id }, data: { status: 'ACTIVE' } });
  before = await snapshot([source.id, target.id]); outage = true;
  try { await assert.rejects(identity.userForTelegram(tg(source)), /storage outage/); await assert.rejects(identity.attachTelegramToUser(target.id, tg(source)), /storage outage/); await assert.rejects(identity.claimTelegramAccount({ tg: tg(source), email: `${stamp}-claim@example.invalid`, passwordHash: 'new' }), /storage outage/); await send(message('/wallet')); } finally { outage = false; }
  assert.deepEqual(await snapshot([source.id, target.id]), before, 'storage failure has no mutation');
  if (!single) {
    let release, ready; const gate = new Promise(r => { release = r; }), locked = new Promise(r => { ready = r; });
    const holder = prisma.$transaction(async tx => { await tx.user.update({ where: { id: source.id }, data: { status: 'BANNED' } }); ready(); await gate; });
    await locked; const pending = identity.userForTelegram(tg(source)); await new Promise(r => setTimeout(r, 100)); release(); await holder;
    assert.equal(await pending, null, 'authority is fresh after User lock wait'); await prisma.user.update({ where: { id: source.id }, data: { status: 'ACTIVE' } });
    const mergeBefore = await snapshot([source.id, target.id]); let unlock, acquired, added;
    const mergeGate = new Promise(r => { unlock = r; }), mergeLocked = new Promise(r => { acquired = r; });
    const restrict = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${source.id} FOR UPDATE`;
      added = await tx.accessRestriction.create({ data: { userId: source.id, scope: 'GLOBAL', effectKey: 'identity.suspend', capabilities: '["identity.authenticate"]', reason: stamp } });
      acquired(); await mergeGate;
    });
    await mergeLocked; const merging = identity.attachTelegramToUser(target.id, tg(source)); await new Promise(r => setTimeout(r, 100)); unlock(); await restrict;
    assert.equal((await merging).code, 'DISABLED', 'merge rechecks a restriction committed during lock wait');
    assert.deepEqual((await snapshot([source.id, target.id])).slice(0, 4), mergeBefore.slice(0, 4), 'concurrent denial transfers no money or ownership');
    await revoke(source, added.id);
  }
  const records = await prisma.accessRestriction.findMany({ where: { userId: source.id }, orderBy: { id: 'asc' } });
  assert(records.some(row => row.id === moduleRow.id)); assert(records.some(row => row.id === future.id)); assert(records.some(row => row.id === expired.id)); assert(records.some(row => row.revocationAuditId));
  const linked = await identity.attachTelegramToUser(target.id, tg(source)); assert.deepEqual(linked, { ok: true, userId: target.id, merged: true });
  assert.equal(await prisma.user.findUnique({ where: { id: source.id } }), null);
  const moved = await prisma.accessRestriction.findMany({ where: { id: { in: records.map(row => row.id) } }, orderBy: { id: 'asc' } }); assert.deepEqual(moved, records.map(row => ({ ...row, userId: target.id })));
  const licenseAfter = await prisma.repoLicense.findUniqueOrThrow({ where: { id: license.id } }); assert.deepEqual(licenseAfter, { ...license, userId: target.id });
  const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }); assert.equal(invoiceAfter.userId, target.id); for (const field of ['status', 'totalMinor', 'subtotalMinor', 'walletAppliedMinor']) assert.equal(invoiceAfter[field], invoice[field]);
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: target.id, currency: 'USD' } } })).balanceMinor, 1500n);
  assert.equal((await identity.userForTelegram(tg(source))).id, target.id, 'same Telegram identity resolves canonical surviving user');
  assert.equal(await access.resolveCurrentUser(source.id, undefined), null, 'old source-bound credentials cannot manufacture an account');
  const claimId = String(Number(telegramId) + 1), claimant = await create('claimant', { email: `tg${claimId}.0123456789abcdef@telegram.local`, telegramId: claimId });
  const claimModule = await service.restrictionTransaction(context, claimant.id, 'forum.moderate', tx => service.insertModuleRestriction(tx, context, { userId: claimant.id, moduleKey: 'forum', effectKey: 'forum.suspend', capabilities: ['forum.post'], reason: stamp, startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) }));
  assert.deepEqual(await identity.claimTelegramAccount({ tg: tg(claimant), email: `${stamp}-claimed@example.invalid`, passwordHash: 'new' }), { ok: true, userId: claimant.id, merged: false }); assert.equal((await prisma.accessRestriction.findUniqueOrThrow({ where: { id: claimModule.id } })).userId, claimant.id);
  const staff = await create('staff', { role: 'ADMIN', telegramId: String(Number(telegramId) + 2) });
  await issue(staff); const staffBefore = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } }); assert.equal(await identity.userForTelegram(tg(staff)), null); assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: staff.id } }), staffBefore);
  const guest = { id: Number(telegramId) + 3, first_name: 'new guest' };
  creationRace = String(guest.id); telegramIds.push(creationRace);
  const newAccounts = await Promise.all([identity.userForTelegram(guest), identity.userForTelegram(guest)]); assert.equal(newAccounts[0].id, newAccounts[1].id); users.push(newAccounts[0].id); assert.equal(await prisma.user.count({ where: { telegramId: String(guest.id) } }), 1); if (!single) assert.equal(creationWaiters, 2);
  console.log('Telegram authority: actual PG/Identity/audit/webhook; current GLOBAL/standing/overlap/expiry/module isolation, no denied metadata/money/delegates, authenticated transport, healthy merge retains restriction history/audit references/license owner and amounts; claim keeps canonical identity' + (single ? ' (single connection)' : ' (including lock-wait authority)'));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  outage = false;
  try {
    users.push(...(await prisma.user.findMany({ where: { telegramId: { in: telegramIds } }, select: { id: true } })).map(row => row.id));
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.accessRestriction.deleteMany({ where: { userId: { in: users } } });
    await prisma.repoProduct.deleteMany({ where: { id: { in: products }, slug: stamp } });
    await prisma.invoice.deleteMany({ where: { number: stamp } });
    await prisma.walletAccount.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  } finally { await prisma.$disconnect(); }
});
