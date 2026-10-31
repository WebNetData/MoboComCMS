// Real owner routes/services against namespaced rows in an explicitly disposable database.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
assert(/test|check|editor_media/i.test(new URL(process.env.DATABASE_URL).pathname), 'owned test database required')
const db = new PrismaClient(), stamp = 'team-slice-' + Date.now().toString(36), users = [], roles = [], orders = [], forms = [], products = [], categories = [], started = new Date(); let viewer
const mocks = {
  '@/platform/database/prisma': { db }, 'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: started.toISOString() } : null },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, moduleGuard: async () => null, requireModule: async () => {}, getModuleStates: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  react: { ...require('react'), cache: fn => fn },
}
const load = require('./connected-source-loader.cjs')(mocks)
const roleApi = load('src/modules/identity/server/http/admin/roles/route.ts'), forumApi = load('src/modules/forum/server/http/admin.ts')
const forum = load('src/modules/forum/server/forum.ts'), community = load('src/modules/forum/server/community.ts'), team = load('src/modules/forum/server/team.ts'), rules = load('src/modules/forum/domain/community.ts')
const store = load('src/modules/store/server/http/routes.ts'), work = load('src/modules/store/server/order-work.ts'), paid = load('src/modules/forms/server/paid.ts')
const roleTemplates = load('src/modules/editor/server/role-templates.ts'), articleLayout = load('src/modules/site/server/http/builder/post-template.ts')
const sanitize = load('src/shared/content/sanitize.ts'), rbac = load('src/modules/identity/rbac.ts')
const themeApi = load('src/modules/site/server/http/theme/templates.ts'), themeTemplates = load('src/modules/site/server/theme-templates.ts')
async function user(label, permissions = null) {
  let roleId = null
  if (permissions) { const role = await db.role.create({ data: { name: stamp + '-' + label, nameFa: label, permissions } }); roles.push(role.id); roleId = role.id }
  const row = await db.user.create({ data: { name: label, email: stamp + '-' + label + '@example.invalid', passwordHash: 'test fixture', role: 'ADMIN', roleId } }); users.push(row.id); return row
}
async function call(handler, method, url, data, id) {
  const response = await handler(new NextRequest('http://site.invalid' + url, { method, headers: { host: 'site.invalid', Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }), { params: Promise.resolve({ id: String(id) }) })
  return { status: response.status, body: await response.json() }
}
async function main() {
  const owner = await user('owner'), forumManager = await user('forum', 'dashboard.view,forum.moderate'), journal = await user('journal', 'dashboard.view,cms.posts'), expert = await user('expert', 'dashboard.view,store.orders.handle,forms.handle'), other = await user('other', 'dashboard.view,store.orders.handle,forms.handle'), roleEditor = await user('role-editor', 'dashboard.view,roles.manage,forum.moderate')
  viewer = owner
  assert.equal((await call(themeApi.POST, 'POST', '/api/admin/theme-templates', { type: 'single-post', name: 'retired' })).status, 410)
  const legacy = await themeTemplates.createThemeTemplate({ type: 'single-post', name: stamp }, { id: owner.id, email: owner.email })
  try {
    assert.equal((await call(themeApi.POST, 'POST', '/api/admin/theme-templates', { action: 'duplicate', id: legacy.id })).status, 410)
    assert.deepEqual((await call(themeApi.GET, 'GET', '/api/admin/theme-templates')).body.presets['single-post'], [])
    await themeTemplates.updateThemeTemplate(legacy.id, { status: 'published', conditions: [{ mode: 'include', target: 'posts' }] })
    assert.equal(await themeTemplates.layoutDocById('post', legacy.id), null)
    assert.equal(await themeTemplates.resolveEntryLayout('post', 1, {}, { id: legacy.id, doc: { mode: 'builder' } }), null)
    assert.ok((await themeTemplates.listLayoutOptions('post')).every(option => ['style', 'mystyle'].includes(option.group)))
    assert.equal((await load('src/modules/site/server/post-presentation.ts').resolvePostPresentation({ postId: 1, format: 'ARTICLE', ctx: { route: 'post', postCategories: [] } })).doc, null)
  }
  finally { await themeTemplates.deleteThemeTemplate(legacy.id) }
  const patch = await call(roleApi.PATCH, 'PATCH', '/api/admin/roles', { id: roles[1], permissions: ['dashboard.view', 'cms.posts'] })
  assert.equal(patch.status, 200, JSON.stringify(patch.body)); assert.equal((await db.role.findUnique({ where: { id: roles[1] } })).permissions, 'dashboard.view,cms.posts')
  const deputy = await call(roleApi.POST, 'POST', '/api/admin/roles', { name: stamp + '-deputy', preset: 'site-deputy', nameFa: 'معاون کل سایت' }); assert.equal(deputy.status, 200); roles.push(deputy.body.id); assert.equal(deputy.body.permissions, '*')
  viewer = roleEditor; assert.equal((await call(roleApi.POST, 'POST', '/api/admin/roles', { name: stamp + '-forbidden', preset: 'site-deputy' })).status, 403)
  viewer = journal; assert.equal((await call(forumApi.PATCH, 'PATCH', '/api/admin/forum', { section: 'users', userId: expert.id, manualLevelId: 'active' })).status, 403)
  await community.ensureProfiles(users)
  viewer = forumManager
  const manual = await call(forumApi.PATCH, 'PATCH', '/api/admin/forum', { section: 'users', userId: expert.id, manualLevelId: 'active' }); assert.equal(manual.status, 200, JSON.stringify(manual.body))
  let author = (await forum.authorsFor([expert.id])).get(expert.id); assert.equal(author.level.name, 'کاربر فعال'); assert.equal(author.trustLevel, 0)
  assert.equal((await call(forumApi.PATCH, 'PATCH', '/api/admin/forum', { section: 'users', userId: expert.id, manualLevelId: 'unknown' })).status, 400)
  assert.equal((await call(forumApi.PATCH, 'PATCH', '/api/admin/forum', { section: 'users', userId: expert.id, manualLevelId: null })).status, 200)
  author = (await forum.authorsFor([expert.id])).get(expert.id); assert.equal(author.level.name, 'عضو تازه'); assert.equal(author.siteRole, 'expert')
  const category = await db.forumCategory.create({ data: { slug: stamp, title: 'owned forum' } }); categories.push(category.id)
  const another = await db.forumCategory.create({ data: { slug: stamp + '-other', title: 'other forum' } }); categories.push(another.id)
  const profile = await db.forumProfile.findUniqueOrThrow({ where: { userId: expert.id } })
  await team.setForumModerator(profile.username, category.id, true)
  const scoped = await community.viewerFor(expert.id)
  assert.equal(rules.inCategory(scoped, category.id).moderator, true); assert.equal(rules.inCategory(scoped, another.id).moderator, false)
  assert.equal((await team.forumRanks([expert.id])).get(expert.id), 'moderator'); assert.equal((await forum.authorsFor([owner.id])).get(owner.id).siteRole, 'مدیر کل سایت')
  const product = await db.product.create({ data: { slug: stamp, name: 'owned service', price: 1, kind: 'VIRTUAL', active: true } }); products.push(product.id)
  for (let i = 0; i < 2; i++) {
    const order = await db.order.create({ data: { userId: owner.id, productId: product.id, status: 'PAID', totalAmount: 1, totalMinor: 100n, currency: 'USD' } }); orders.push(order.id)
    await db.productDelivery.create({ data: { orderId: order.id } })
  }
  const scopes = [expert, other].map(person => ({ actorId: person.id, manager: false }))
  const claims = await Promise.allSettled(scopes.map(scope => work.assignOrder(orders[0], scope.actorId, scope)))
  assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1, 'one simultaneous claimant wins')
  const claimed = await db.order.findUniqueOrThrow({ where: { id: orders[0] } }), winner = claimed.assigneeId === expert.id ? expert : other, loser = winner.id === expert.id ? other : expert
  viewer = loser
  assert.equal((await call(store.GET_order, 'GET', '/api/admin/store/orders/' + orders[0], null, orders[0])).status, 404)
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'note', note: 'must not enter colleague work' }, orders[0])).status, 403)
  const list = await call(store.GET_orders, 'GET', '/api/admin/store/orders'); assert.equal(list.status, 200); assert.ok(!list.body.orders.some(order => order.id === orders[0])); assert.ok(list.body.orders.some(order => order.id === orders[1]))
  viewer = winner
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'status', to: 'PROCESSING', notify: false }, orders[0])).status, 200)
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'status', to: 'CANCELLED' }, orders[0])).status, 403)
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'assign', assigneeId: loser.id }, orders[0])).status, 403)
  viewer = journal; assert.equal((await call(store.GET_orders, 'GET', '/api/admin/store/orders')).status, 403)
  assert.equal(await roleTemplates.startingTemplate('posts', journal.roleId), null)
  assert.equal((await call(roleTemplates.roleTemplates, 'PUT', '/api/admin/editor/role-templates?entity=posts', { roleId: journal.roleId, patternId: null })).status, 410)
  assert.equal((await call(articleLayout.PUT, 'PUT', '/api/admin/builder/post-template', { postId: 999999999, templateId: 'post-pro-standard' })).status, 410)
  viewer = owner
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'assign', assigneeId: journal.id }, orders[0])).status, 400)
  assert.equal((await call(store.POST_order, 'POST', '/api/admin/store/orders/' + orders[0], { action: 'assign', assigneeId: loser.id }, orders[0])).status, 200)
  const form = await db.siteForm.create({ data: { slug: stamp, title: 'owned form', fields: '[]' } }); forms.push(form.id)
  const submission = await db.formSubmission.create({ data: { formId: form.id, data: '{}', stage: 'OPEN' } })
  let arrived = 0, release
  const bothRead = new Promise(resolve => { release = resolve })
  const racingDb = db.$extends({ query: { formSubmission: { async findUnique({ args, query }) {
    const row = await query(args)
    if (args.where.id === submission.id && arrived < 2) { if (++arrived === 2) release(); await bothRead }
    return row
  } } } })
  const racingPaid = require('./connected-source-loader.cjs')({ ...mocks, '@/platform/database/prisma': { db: racingDb } })('src/modules/forms/server/paid.ts')
  const takes = await Promise.allSettled([expert, other].map(person => racingPaid.workOnSubmission(submission.id, person, { take: true }, false)))
  assert.equal(takes.filter(result => result.status === 'fulfilled').length, 1, 'form assignment is atomic')
  const held = await db.formSubmission.findUniqueOrThrow({ where: { id: submission.id } }), colleague = held.assigneeId === expert.id ? other : expert
  await assert.rejects(paid.workOnSubmission(submission.id, colleague, { reply: 'forbidden colleague reply' }, false), error => error.status === 403)
  const html = sanitize.cleanRichText('[note][b]hello[/b][/note][spoiler]details[/spoiler]'); assert.match(html, /mc-decor-note/); assert.doesNotMatch(html, /\[note\]/)
  assert.ok(rbac.ROLE_PRESETS['order-specialist'].includes('store.orders.handle')); assert.ok(!rbac.ROLE_PRESETS['order-specialist'].includes('orders.manage'))
  await assert.rejects(db.role.delete({ where: { id: expert.roleId } }), error => error.code === 'P2003', 'an occupied role cannot silently become null/full access')
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: expert.id } })).roleId, expert.roleId)
  const racingRole = await db.role.create({ data: { name: stamp + '-race-role', permissions: 'forms.handle' } }); roles.push(racingRole.id)
  const candidate = await db.user.create({ data: { email: stamp + '-race@example.invalid', passwordHash: 'fixture', role: 'CUSTOMER' } }); users.push(candidate.id)
  viewer = owner
  await Promise.allSettled([call(roleApi.DELETE, 'DELETE', '/api/admin/roles?id=' + racingRole.id), db.user.update({ where: { id: candidate.id }, data: { role: 'ADMIN', roleId: racingRole.id } })])
  const afterRace = await db.user.findUniqueOrThrow({ where: { id: candidate.id } })
  assert.ok(afterRace.role !== 'ADMIN' || afterRace.roleId !== null, 'delete/assignment race never grants full access')
  console.log('PostgreSQL passed: permission-only role update/full-site deputy boundary, manual/automatic degrees without authority, canonical staff labels, category moderation scope, order scopes/actions and two competing order/form claims.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } }); await db.productDelivery.deleteMany({ where: { orderId: { in: orders } } }); await db.order.deleteMany({ where: { id: { in: orders } } }); await db.product.deleteMany({ where: { id: { in: products } } }); await db.siteForm.deleteMany({ where: { id: { in: forms } } }); await db.forumCategory.deleteMany({ where: { id: { in: categories } } }); await db.userNotification.deleteMany({ where: { userId: { in: users } } }); await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.role.deleteMany({ where: { id: { in: roles } } })
  } finally { await db.$disconnect() }
})
