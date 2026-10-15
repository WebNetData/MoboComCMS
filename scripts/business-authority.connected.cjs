// Current canonical identity, module state, profile invariants and strict audit on PostgreSQL.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), cache = new Map(), stamp = `owned-business-authority-${Date.now()}`
const snapshots = new Map(), authAt = Date.now() - 5000
let actor, staffActor, role, profile, customer, auditFault = false
function wrap(target) {
  return new Proxy(target, { get(target, key) {
    if (key === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
    if (key === 'auditLog') return new Proxy(target[key], { get(model, method) {
      if (method === 'create') return args => { if (auditFault) throw Error('owned audit failure'); return model.create(args) }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
  } })
}
const db = wrap(prisma)
const manifests = ['businesses', 'reviews'].map(id => require(`../src/plugins/${id}/manifest.json`))
const mocks = {
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => ({ uid: actor.id, authAt }) },
  '@/platform/config/env': { authSecret: () => 'owned fixture secret' },
  '@/extensions/generated/catalog': { extensionCatalog: manifests, extensionById: new Map(manifests.map(m => [m.id, m])), extensionPermissionIds: ['businesses.manage', 'reviews.moderate'] },
  '@/themes/generated/catalog': { codeThemeCatalog: [] }, '@/themes/registry': { bundledThemes: [] },
  'react': { cache: fn => fn },
  '@/modules/catalog/server/storefront': { isStoreEnabled: async () => false },
  '@/modules/public-api/server/availability': { isPublicApiEnabled: async () => false },
  '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => work(), invalidate: async () => {} },
}
function load(relative) {
  const file = path.resolve(relative)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name === '@/modules/reviews/server/reviews') return load('src/modules/reviews/server/business-experiences.ts')
    if (name === '@/modules/marketplace/server/marketplace') return load('src/modules/marketplace/server/marketplace/reviews.ts')
    if (name.startsWith('@/') && name.endsWith('.cjs')) return require(path.resolve('src', name.slice(2)))
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const setting = (key, value) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
async function main() {
  try {
    for (const key of ['extension.businesses.state.v1', 'extension.reviews.state.v1', 'security.policy.v1']) snapshots.set(key, await prisma.setting.findUnique({ where: { key } }))
    await setting('extension.businesses.state.v1', '{"enabled":true,"settings":{}}')
    await setting('extension.reviews.state.v1', '{"enabled":true,"settings":{}}')
    await setting('security.policy.v1', '{"requireAdmin2fa":false}')
    role = await prisma.role.create({ data: { name: stamp, permissions: 'businesses.manage' } })
    actor = await prisma.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
    staffActor = actor
    const req = new NextRequest('http://owned.invalid/api/admin/businesses', { method: 'POST', headers: { origin: 'http://owned.invalid' } })
    const { saveBusinessProfile } = load('src/modules/businesses/server/commands.ts')
    const input = { name: stamp, slug: stamp, kind: 'EXTERNAL', website: `https://${stamp}.example`, category: 'owned test', status: 'PUBLISHED' }
    profile = await saveBusinessProfile(req, input)
    assert.equal(profile.status, 'PUBLISHED')
    const original = await prisma.businessProfile.findUniqueOrThrow({ where: { id: profile.id } })
    const snapshot = async () => ({ profile: await prisma.businessProfile.findUniqueOrThrow({ where: { id: profile.id } }), stat: await prisma.itemStat.findUnique({ where: { itemType_itemId: { itemType: 'business', itemId: profile.id } } }), audits: await prisma.auditLog.findMany({ where: { actorUserId: actor.id }, orderBy: { id: 'asc' } }) })
    async function denied(status, overrides = {}) {
      const before = await snapshot()
      await assert.rejects(saveBusinessProfile(req, { ...input, id: profile.id, name: 'Attempted change', ...overrides }), error => error.status === status)
      assert.deepEqual(await snapshot(), before, 'denial leaves profile, aggregate and audit untouched')
    }
    await denied(409, { website: 'https://another.example' })
    await denied(400, { representativeId: actor.id })
    await prisma.role.update({ where: { id: role.id }, data: { permissions: 'cms.posts,reviews.moderate' } }); await denied(403)
    await prisma.role.update({ where: { id: role.id }, data: { permissions: 'businesses.manage' } })
    await prisma.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } }); await denied(403)
    await prisma.user.update({ where: { id: actor.id }, data: { status: 'ACTIVE' } })
    await setting('extension.businesses.state.v1', '{"enabled":false,"settings":{}}'); await denied(404)
    await setting('extension.businesses.state.v1', '{"enabled":true,"settings":{}}')
    await setting('extension.reviews.state.v1', '{"enabled":false,"settings":{}}'); await denied(404)
    await setting('extension.reviews.state.v1', '{"enabled":true,"settings":{}}')
    await setting('security.policy.v1', '{"requireAdmin2fa":true}'); await denied(403)
    await setting('security.policy.v1', '{"requireAdmin2fa":false}')
    await prisma.accessRestriction.create({ data: { userId: actor.id, scope: 'GLOBAL', effectKey: 'identity.suspend', capabilities: '["identity.authenticate"]', reason: stamp } }); await denied(403)
    await prisma.accessRestriction.deleteMany({ where: { userId: actor.id, reason: stamp } })
    const before = await snapshot(); auditFault = true
    await assert.rejects(saveBusinessProfile(req, { ...input, id: profile.id, name: 'Audit must roll back' }), /owned audit failure/)
    auditFault = false; assert.deepEqual(await snapshot(), before)
    assert.deepEqual(await prisma.businessProfile.findUniqueOrThrow({ where: { id: profile.id } }), original)
    profile = await saveBusinessProfile(req, { ...input, id: profile.id, representativeId: actor.id, acknowledgeRepresentative: true })
    assert.equal(profile.representativeId, actor.id)
    const staff = actor
    customer = await prisma.user.create({ data: { email: `${stamp}-customer@example.invalid`, name: 'Owned customer', passwordHash: 'owned fixture', role: 'USER' } })
    const { requestBusiness, decideBusinessRequest, myBusinessRequests } = load('src/modules/businesses/server/requests.ts')
    const suggestion = { kind: 'SUGGESTION', name: 'کسب‌وکار پیشنهادی', website: `https://www.${stamp}-suggest.example/path`, category: 'آزمون', note: 'درخواست معرفی یک کسب‌وکار برای بررسی مستقل مدیریت' }
    actor = customer
    const concurrent = await Promise.allSettled([requestBusiness(req, suggestion), requestBusiness(req, suggestion)])
    assert.equal(concurrent.filter(row => row.status === 'fulfilled').length, 1, 'concurrent normalized duplicate requests converge')
    const submitted = concurrent.find(row => row.status === 'fulfilled').value
    await setting('extension.businesses.state.v1', '{"enabled":true,"settings":{"allow-suggestions":false}}')
    await assert.rejects(requestBusiness(req, { ...suggestion, website: 'https://disabled-suggestion.example' }), error => error.status === 403)
    await setting('extension.businesses.state.v1', '{"enabled":false,"settings":{}}')
    await assert.rejects(requestBusiness(req, suggestion), error => error.status === 404)
    await setting('extension.businesses.state.v1', '{"enabled":true,"settings":{}}')
    assert.equal((await myBusinessRequests(customer.id)).length, 1)
    assert.equal((await myBusinessRequests(staff.id)).length, 0, 'requests scoped to the authenticated account')
    const approval = { requestId: submitted.id, decision: 'APPROVED', decisionNote: 'نام و دامنهٔ عمومی کسب‌وکار بررسی شد', slug: `${stamp}-suggest` }
    await assert.rejects(decideBusinessRequest(req, approval), error => error.status === 403)
    actor = staff; auditFault = true
    await assert.rejects(decideBusinessRequest(req, approval), /owned audit failure/)
    auditFault = false
    assert.equal((await prisma.businessRequest.findUniqueOrThrow({ where: { id: submitted.id } })).status, 'PENDING', 'decision and strict audit roll back together')
    assert.equal(await prisma.businessProfile.count({ where: { slug: approval.slug } }), 0)
    await decideBusinessRequest(req, approval)
    await assert.rejects(decideBusinessRequest(req, approval), error => error.status === 409)
    const suggested = await prisma.businessProfile.findUniqueOrThrow({ where: { slug: approval.slug } })
    assert.equal(suggested.status, 'PUBLISHED'); assert.equal(suggested.domain, `${stamp}-suggest.example`)
    actor = customer
    const claim = await requestBusiness(req, { kind: 'CLAIM', businessId: suggested.id, note: 'من نمایندهٔ این کسب‌وکار هستم و بررسی مستقل درخواست را می‌خواهم' })
    assert.equal((await prisma.businessProfile.findUniqueOrThrow({ where: { id: suggested.id } })).representativeId, null, 'request never automatically assigns a representative')
    actor = staff
    const claimDecision = { requestId: claim.id, decision: 'APPROVED', decisionNote: 'ارتباط حساب با کسب‌وکار به صورت مستقل بررسی شد' }
    await assert.rejects(decideBusinessRequest(req, claimDecision), error => error.status === 400)
    await decideBusinessRequest(req, { ...claimDecision, acknowledgeRepresentative: true })
    assert.equal((await prisma.businessProfile.findUniqueOrThrow({ where: { id: suggested.id } })).representativeId, customer.id)
    const selfClaim = await requestBusiness(req, { kind: 'CLAIM', businessId: (await prisma.businessProfile.create({ data: { ...input, name: stamp + '-self', slug: stamp + '-self', domain: stamp + '-self.example', website: `https://${stamp}-self.example` } })).id, note: 'این درخواست برای اثبات ممنوع بودن تأیید نمایندگی خود است' })
    await assert.rejects(decideBusinessRequest(req, { ...claimDecision, requestId: selfClaim.id, acknowledgeRepresentative: true }), error => error.status === 403)
    await prisma.businessProfile.createMany({ data: Array.from({ length: 105 }, (_, index) => ({ name: `${stamp} ${index}`, slug: `${stamp}-${index}`, kind: 'EXTERNAL', domain: `${stamp}-${index}.example`, website: `https://${stamp}-${index}.example/`, status: 'DRAFT' })) })
    const { businessAdminData } = load('src/modules/businesses/server/queries.ts')
    const adminPage = await businessAdminData({ q: stamp, page: 6, edit: profile.id })
    assert.equal(adminPage.total, 108, 'all namespaced profiles remain discoverable beyond the old hundred-row ceiling')
    assert.equal(adminPage.profiles.length, 8); assert.equal(adminPage.editing.id, profile.id)
    console.log('Business command authority: current role/standing/GLOBAL/modules/2FA/immutable identity/representative acknowledgment/strict audit rollback passed')
    console.log('Business requests: concurrent duplicate prevention, private account view, staff authority, audit rollback, publish, replay refusal, reviewed claims, self-approval refusal and paginated discovery passed')
  } finally {
    actor = staffActor
    try {
      const ownedProfiles = await prisma.businessProfile.findMany({ where: { slug: { startsWith: stamp } }, select: { id: true } })
      await prisma.businessProfile.deleteMany({ where: { id: { in: ownedProfiles.map(row => row.id) }, slug: { startsWith: stamp } } })
      await prisma.itemStat.deleteMany({ where: { itemType: 'business', itemId: { in: ownedProfiles.map(row => row.id) } } })
      if (customer) await prisma.user.deleteMany({ where: { id: customer.id, email: customer.email } })
      if (actor) { await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } }); await prisma.accessRestriction.deleteMany({ where: { userId: actor.id, reason: stamp } }); await prisma.user.deleteMany({ where: { id: actor.id, email: actor.email } }) }
      if (role) await prisma.role.deleteMany({ where: { id: role.id, name: stamp } })
    } finally {
      try { for (const [key, row] of snapshots) { if (row) await setting(key, row.value); else await prisma.setting.deleteMany({ where: { key } }) } } finally { await prisma.$disconnect() }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
