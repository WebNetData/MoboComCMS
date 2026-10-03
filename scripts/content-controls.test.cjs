const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { NextRequest } = require('next/server')

test('backup settings and execution require settings permission', async () => {
  const route = load('src/modules/notifications/server/http/admin/backups/route.ts', {
    '@/modules/identity/server/access': { requirePerm: async () => null },
    '@/platform/database/prisma': { db: {} },
    '@/modules/notifications/server/backup-scheduler': { runBackupWorker: () => { throw Error('must not start') } },
  })
  for (const method of ['GET','PATCH','POST']) assert.equal((await route[method](new NextRequest('http://localhost/api/admin/backups'))).status,403)
})

test('origin guard accepts the actual host despite Next localhost normalization and rejects foreign origins', async () => {
  const { middleware } = load('src/middleware.ts', { '@/modules/site/server/routes': { loadRouteAliases: async () => ({}) } })
  const request = origin => new NextRequest('http://localhost:3002/api/subscriptions/1', { method: 'POST', headers: { host: '127.0.0.1:3002', origin, 'x-request-id': 'origin-test-123' } })
  assert.equal((await middleware(request('http://127.0.0.1:3002'))).status, 200)
  assert.equal((await middleware(request('https://attacker.invalid'))).status, 403)
  assert.equal((await middleware(request('http://127.0.0.1:9999'))).status, 403)
})

test('middleware publishes sections under their aliases and redirects old addresses', async () => {
  const { middleware } = load('src/middleware.ts', { '@/modules/site/server/routes': { loadRouteAliases: async () => ({ '/games': '/game' }) } })
  const get = (url) => middleware(new NextRequest(url, { headers: { 'x-request-id': 'alias-test-123' } }))
  const old = await get('http://localhost:3002/games/x?y=1')
  assert.equal(old.status, 308)
  const location = new URL(old.headers.get('location'))
  assert.equal(location.pathname + location.search, '/game/x?y=1')
  const aliased = await get('http://localhost:3002/game/x')
  assert.match(aliased.headers.get('x-middleware-rewrite') || '', /\/games\/x$/)
  assert.ok(aliased.headers.get('content-security-policy'))
  assert.equal((await get('http://localhost:3002/api/games/library')).status, 200)
})

test('incident validation rejects invalid scopes, statuses and oversized messages', () => {
  const { validateIncident } = load('src/modules/support/domain/incidents.ts')
  const good = { panelId: null, titleFa: 'اختلال', titleEn: 'Outage', messageFa: 'در حال بررسی', messageEn: 'Investigating', status: 'INVESTIGATING' }
  assert.deepEqual(validateIncident(good), good)
  for (const change of [{ panelId: 0 }, { panelId: '1' }, { status: 'BAD' }, { titleFa: '' }, { messageEn: 'x'.repeat(3001) }]) assert.throws(() => validateIncident({ ...good, ...change }))
})

test('incident feed requires ownership and includes only global and matching service scopes', async () => {
  let user = null, owned = false, query
  const route = load('src/modules/support/server/http/incidents/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user },
    '@/platform/database/prisma': { db: {
      subscription: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.id, 9); return owned ? { panelId: 3 } : null } },
      serviceIncident: { findMany: async args => { query = args; return [] } },
    } },
  })
  const request = () => new NextRequest('http://localhost/api/incidents?subscriptionId=9')
  assert.equal((await route.GET(request())).status, 401)
  user = { id: 7 }
  assert.equal((await route.GET(request())).status, 404)
  assert.equal(query, undefined)
  owned = true
  const response = await route.GET(request())
  assert.equal(response.status, 200)
  assert.deepEqual(query.where.AND[0].OR, [{ panelId: null }, { panelId: 3 }])
  assert.equal(query.where.AND[1].OR[0].status.not, 'RESOLVED')
  assert.equal(query.select.panelId, undefined)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})

test('subscription reports reject another customer subscription before creating a ticket', async () => {
  let owned = false, saved
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role: 'USER' }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/modules/subscriptions/server/happ-protocol': { safeHappLink: async token => { assert.equal(token, 'owned-token'); return 'happ://crypt5/owned-link' } },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async () => ({ active: true, requiresSubscription: true, requiresProduct: false, fields: '[]' }) },
      subscription: { findFirst: async ({ where }) => { assert.equal(where.id, 9); assert.equal(where.userId, 7); assert.equal(where.status, 'ACTIVE'); assert.ok(where.expiresAt.gt instanceof Date); return owned ? { id: 9, username: 'customer-service', subToken: 'owned-token' } : null } },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  const request = overrides => new NextRequest('http://localhost/api/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Connection issue', message: 'Cannot connect', subscriptionId: 9, device: 'android', issueType: 'connection', ...overrides }) })
  assert.equal((await route.POST(request({}))).status, 404)
  assert.equal(saved, undefined)
  owned = true
  assert.equal((await route.POST(request({ device: 'bad' }))).status, 400)
  assert.equal((await route.POST(request({}))).status, 200)
  assert.equal(saved.subscriptionId, 9)
  assert.equal(saved.subscriptionUsername, 'customer-service')
  assert.equal(saved.subscriptionLink, 'happ://crypt5/owned-link')
  assert.equal(saved.department, 'SUBSCRIPTION')
  assert.equal(saved.device, 'android')
  assert.equal(saved.messages.create.fromAdmin, false)
})

test('ticket departments require an active owned service only for product and subscription support', async () => {
  let saved, hasSubscription = false, hasPurchase = false, role = 'USER'
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async ({ where }) => ({ active: true, requiresSubscription: where.slug === 'SUBSCRIPTION', requiresProduct: where.slug === 'PRODUCT', fields: '[]' }) },
      subscription: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.status, 'ACTIVE'); return hasSubscription ? { id: 9 } : null } },
      order: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.status, 'PAID'); assert.equal(where.product.active, true); return hasPurchase ? { productId: 4 } : null } },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  const request = data => new NextRequest('http://localhost/api/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Help needed', message: '<p>Please help</p>', ...data }) })
  assert.equal((await route.POST(request({ department: 'SALES' }))).status, 200)
  assert.equal(saved.department, 'SALES'); assert.equal(saved.subscriptionId, undefined)
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION' }))).status, 400)
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION', subscriptionId: 9 }))).status, 404)
  hasSubscription = true
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION', subscriptionId: 9 }))).status, 200)
  assert.equal(saved.subscriptionId, 9)
  assert.equal((await route.POST(request({ department: 'PRODUCT', productId: 4 }))).status, 404)
  hasPurchase = true
  assert.equal((await route.POST(request({ department: 'PRODUCT', productId: 4 }))).status, 200)
  assert.equal(saved.productId, 4)
  assert.equal((await route.POST(request({ department: 'SALES', productId: 4 }))).status, 400)
  role = 'ADMIN'
  assert.equal((await route.POST(request({ department: 'SALES' }))).status, 200)
  assert.equal(saved.messages.create.fromAdmin, false)
})

test('support reply waits for the customer and customer reply reopens the ticket', async () => {
  let role = 'ADMIN', status = 'OPEN'
  const db = {
    ticket: { findUnique: async () => ({ id: 4, userId: 7, status, firstResponseAt: null }), update: async ({ data }) => { status = data.status } },
    ticketMessage: { create: async () => ({ id: 1 }) },
    $transaction: async callback => callback(db),
  }
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: role === 'ADMIN' ? 1 : 7, role }), requirePerm: async () => true },
    '@/platform/database/prisma': { db },
  })
  const params = { params: Promise.resolve({ id: '4' }) }
  const request = () => new NextRequest('http://localhost/api/tickets/4', { method: 'POST', body: JSON.stringify({ message: '<p>Update</p>' }) })
  assert.equal((await route.POST(request(), params)).status, 200)
  assert.equal(status, 'PENDING')
  role = 'USER'
  assert.equal((await route.POST(request(), params)).status, 200)
  assert.equal(status, 'OPEN')
})

test('an administrator using their customer ticket remains the customer, while a staff reply is marked answered', async () => {
  let status = 'OPEN', sender, lastCustomerAt, lastStaffAt
  const ticket = { id: 4, userId: 7, department: 'SALES', status, firstResponseAt: null, closedAt: null }
  const db = {
    ticket: {
      findUnique: async () => ({ ...ticket, status }),
      update: async ({ data }) => { status = data.status; lastCustomerAt = data.lastCustomerAt; lastStaffAt = data.lastStaffAt },
    },
    ticketMessage: { create: async ({ data }) => { sender = data.fromAdmin; return { id: 1 } } },
    $transaction: async callback => callback(db),
  }
  let userId = 7
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: userId, role: 'ADMIN' }), requirePerm: async () => true },
    '@/modules/support/server/department-access': { canHandleTicket: async () => true },
    '@/platform/database/prisma': { db },
  })
  const params = { params: Promise.resolve({ id: '4' }) }
  const request = body => new NextRequest('http://localhost/api/tickets/4', { method: 'POST', body: JSON.stringify({ message: '<p>Update</p>', ...body }) })
  assert.equal((await route.POST(request({ asCustomer: true }), params)).status, 200)
  assert.equal(sender, false)
  assert.equal(status, 'OPEN')
  assert.ok(lastCustomerAt instanceof Date)
  userId = 8
  assert.equal((await route.POST(request({ asCustomer: true }), params)).status, 403)
  assert.equal((await route.POST(request({}), params)).status, 200)
  assert.equal(sender, true)
  assert.equal(status, 'PENDING')
  assert.ok(lastStaffAt instanceof Date)
})

test('ticket uploads accept bounded images and reject disguised or excessive files', async () => {
  const { parseTicketSubmission, TicketUploadError } = load('src/modules/support/server/ticket-attachments.ts')
  const png = Buffer.alloc(45)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1, 16)
  png.writeUInt32BE(1, 20)
  png.write('IEND', 37)
  const request = blobs => {
    const form = new FormData()
    form.set('payload', JSON.stringify({ message: 'Cannot connect' }))
    for (const [bytes, name] of blobs) form.append('files', new Blob([bytes], { type: 'image/png' }), name)
    return new NextRequest('http://localhost/api/tickets', { method: 'POST', body: form })
  }
  const accepted = await parseTicketSubmission(request([[png, '../error.png']]))
  assert.equal(accepted.files.length, 1)
  assert.equal(accepted.files[0].originalName, 'error.png')
  assert.equal(accepted.files[0].mimeType, 'image/png')
  await assert.rejects(parseTicketSubmission(request([[Buffer.from('<script>alert(1)</script>'), 'error.png']])), TicketUploadError)
  await assert.rejects(parseTicketSubmission(request(Array.from({ length: 4 }, (_, index) => [png, `error-${index}.png`]))), TicketUploadError)
})

test('ticket creation binds an uploaded image to the first message', async () => {
  let saved, stored = false
  const file = { filename: '00000000-0000-4000-8000-000000000001.png', originalName: 'error.png', mimeType: 'image/png', size: 45 }
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role: 'USER' }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/modules/support/server/ticket-attachments': {
      parseTicketSubmission: async () => ({ body: { department: 'SALES', subject: 'Help', message: 'Please see the screenshot' }, files: [file] }),
      saveTicketFiles: async () => { stored = true },
      removeTicketFiles: async () => {},
      ticketAttachmentRows: files => files.map(({ filename, originalName, mimeType, size }) => ({ filename, originalName, mimeType, size })),
    },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async () => ({ active: true, requiresSubscription: false, requiresProduct: false, fields: '[]' }) },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  assert.equal((await route.POST(new NextRequest('http://localhost/api/tickets', { method: 'POST', body: '{}' }))).status, 200)
  assert.equal(stored, true)
  assert.equal(saved.messages.create.attachments.create[0].originalName, 'error.png')
})

test('ticket image reads require the ticket owner or assigned support permission', async () => {
  let user = { id: 3, role: 'USER' }, internal = false, permission = false
  const file = { id: 5, filename: '00000000-0000-4000-8000-000000000005.png', mimeType: 'image/png', message: { internal, ticket: { id: 4, userId: 7, department: 'TECH' } } }
  const route = load('src/modules/support/server/http/tickets/[id]/attachments/[attachmentId]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user, requirePerm: async () => permission },
    '@/modules/support/server/department-access': { canHandleTicket: async () => permission },
    '@/platform/database/prisma': { db: { ticketAttachment: { findUnique: async () => ({ ...file, message: { ...file.message, internal } }) } } },
    'node:fs/promises': { readFile: async () => Buffer.from('image bytes') },
  })
  const context = { params: Promise.resolve({ id: '4', attachmentId: '5' }) }
  const request = new NextRequest('http://localhost/api/tickets/4/attachments/5')
  assert.equal((await route.GET(request, context)).status, 404)
  user = { id: 7, role: 'USER' }
  assert.equal((await route.GET(request, context)).status, 200)
  internal = true
  assert.equal((await route.GET(request, context)).status, 404)
  user = { id: 8, role: 'ADMIN' }
  permission = true
  assert.equal((await route.GET(request, context)).status, 200)
})

test('subscription activity only includes the owner’s purchase, renewals and related tickets', async () => {
  let owner = 7, queried = false
  const route = load('src/modules/subscriptions/server/http/subscriptions/[id]/activity/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: owner }) },
    '@/platform/database/prisma': { db: {
      subscription: { findFirst: async ({ where }) => { assert.equal(where.id, 4); return where.userId === 7 ? { id: 4, orderId: 10 } : null } },
      fulfillmentJob: { findMany: async ({ where }) => { queried = true; assert.equal(where.subscriptionId, 4); return [{ orderId: 12 }] } },
      ticket: { findMany: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.subscriptionId, 4); return [{ id: 3, status: 'OPEN' }] } },
      order: { findMany: async ({ where }) => { assert.equal(where.userId, 7); assert.deepEqual(where.id.in, [10, 12]); return [{ id: 10, status: 'PAID' }, { id: 12, status: 'PAID' }] } },
    } },
  })
  const context = { params: Promise.resolve({ id: '4' }) }
  owner = 8
  assert.equal((await route.GET(new NextRequest('http://localhost/api/subscriptions/4/activity'), context)).status, 404)
  assert.equal(queried, false)
  owner = 7
  const response = await route.GET(new NextRequest('http://localhost/api/subscriptions/4/activity'), context)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.orders.map(order => order.kind), ['purchase', 'renewal'])
  assert.equal(data.tickets[0].id, 3)
})

test('ticket detail stays owner-scoped and returns the reported subscription context', async () => {
  let userId = 8, role = 'USER', canHandle = false
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: userId, role }), requirePerm: async () => true },
    '@/modules/support/server/department-access': { canHandleTicket: async () => canHandle },
    '@/platform/database/prisma': { db: {
      ticket: { findUnique: async () => ({ id: 4, userId: 7, subject: 'Connection issue', status: 'OPEN', priority: 'normal', department: 'SUBSCRIPTION', subscriptionId: 9, subscriptionUsername: 'customer-service', subscriptionLink: 'happ://crypt5/owned-link', user: { name: 'Customer', email: 'customer@example.org' }, messages: [] }) },
      ticketDepartment: { findUnique: async () => null },
    } },
  })
  const context = { params: Promise.resolve({ id: '4' }) }
  const request = new NextRequest('http://localhost/api/tickets/4')
  assert.equal((await route.GET(request, context)).status, 403)
  role = 'ADMIN'
  assert.equal((await route.GET(request, context)).status, 403)
  canHandle = true
  assert.equal((await route.GET(request, context)).status, 200)
  role = 'USER'
  userId = 7
  const response = await route.GET(request, context)
  assert.equal(response.status, 200)
  const detail = await response.json()
  assert.equal(detail.subscriptionUsername, 'customer-service')
  assert.equal(detail.subscriptionLink, 'happ://crypt5/owned-link')
  assert.equal(detail.userName, 'Customer')
})

test('journal comments require sign-in, moderation and an approved parent for replies', async () => {
  let user = null, saved, autoApproveComments = false
  const route = load('src/modules/site/server/http/public/blog/[slug]/comments/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user },
    '@/modules/journal/server/admin': { getJournalSettings: async () => ({ autoApproveComments }) },
    '@/platform/database/prisma': { db: {
      post: { findUnique: async () => ({ id: 5, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) }) },
      postComment: { findFirst: async () => null, create: async ({ data }) => { saved = data; return { id: 11, status: 'PENDING' } } },
    } },
  })
  const context = { params: Promise.resolve({ slug: 'example' }) }
  const request = body => new NextRequest('http://localhost/api/blog/example/comments', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await route.POST(request({ body: 'Useful article' }), context)).status, 401)
  user = { id: 31 }
  assert.equal((await route.POST(request({ body: '<script>alert(1)</script>' }), context)).status, 400)
  assert.equal((await route.POST(request({ body: 'A reply', parentId: 50 }), context)).status, 404)
  assert.equal((await route.POST(request({ body: 'Useful article' }), context)).status, 201)
  assert.equal(saved.status, 'PENDING')
  assert.equal(saved.userId, 31)
  // The journal setting «انتشار خودکار دیدگاه» publishes member comments without review.
  autoApproveComments = true
  user = { id: 32 }
  assert.equal((await route.POST(request({ body: 'Another useful note' }), context)).status, 201)
  assert.equal(saved.status, 'APPROVED')
})

test('incident administration denies users without support permission', async () => {
  const route = load('src/modules/support/server/http/admin/incidents/route.ts', {
    '@/modules/identity/server/access': { requirePerm: async () => null },
    '@/platform/database/prisma': { db: {} },
  })
  for (const verb of ['GET', 'POST', 'PATCH']) assert.equal((await route[verb](new NextRequest('http://localhost/api/admin/incidents'))).status, 403)
})

test('connection guide validates every device and language and rejects unsafe downloads', () => {
  const { defaultConnectionGuide, validateConnectionGuide } = load('src/modules/site/domain/connection-guide.ts')
  assert.deepEqual(validateConnectionGuide(defaultConnectionGuide), defaultConnectionGuide)
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:secret@example.org', 'https://example.org/\\evil']) {
    const value = structuredClone(defaultConnectionGuide)
    value.platforms.android.downloadUrl = url
    assert.throws(() => validateConnectionGuide(value))
  }
  const value = structuredClone(defaultConnectionGuide)
  value.platforms.android.downloadUrl = ''
  assert.equal(validateConnectionGuide(value).platforms.android.downloadUrl, '')
  value.platforms.ios.install.en = ' '
  assert.throws(() => validateConnectionGuide(value))
  delete value.platforms.ios
  assert.throws(() => validateConnectionGuide(value))
})

test('connection guide admin requires permission and saves only validated settings', async () => {
  let allowed = false, stored = null
  const mocks = {
    '@/modules/identity/server/access': { requirePerm: async (_req, permission) => allowed && permission === 'settings.manage' },
    '@/platform/database/prisma': { db: { setting: {
      findUnique: async () => stored,
      upsert: async args => { stored = args.create },
    } } },
  }
  const route = load('src/modules/site/server/http/admin/connection-guide/route.ts', mocks)
  const request = value => new NextRequest('http://localhost/api/admin/connection-guide', { method: 'PATCH', body: JSON.stringify(value) })
  assert.equal((await route.GET(request({}))).status, 403)
  assert.equal((await route.PATCH(request({}))).status, 403)
  allowed = true
  assert.equal((await route.PATCH(request({}))).status, 400)
  assert.equal(stored, null)
  const { defaultConnectionGuide } = load('src/modules/site/domain/connection-guide.ts')
  const value = structuredClone(defaultConnectionGuide)
  value.platforms.windows.install.fa = 'متن سفارشی نصب'
  value.privateToken = 'must-not-persist'
  assert.equal((await route.PATCH(request(value))).status, 200)
  const result = await (await route.GET(request({}))).json()
  assert.equal(result.platforms.windows.install.fa, 'متن سفارشی نصب')
  assert.equal(JSON.stringify(stored).includes('must-not-persist'), false)
})

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
      if (base.endsWith('.json') && fs.existsSync(base)) return require(base)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

test('cover URLs accept local/remote images and reject executable or malformed input', () => {
  const { validateCover } = load('src/shared/content/cover.ts')
  for (const value of ['', '/api/media/covers/test.webp', 'https://example.org/cover.jpg']) assert.equal(validateCover(value), value)
  for (const value of ['javascript:alert(1)', '//example.org/a', '/\\evil', 'data:image/svg+xml,bad', {}, 'https://a b.org']) assert.throws(() => validateCover(value))
})

test('page layout round-trips the cover, preserves layout, and supports clearing it', async () => {
  let stored = null
  const { validatePageLayout, getPageLayout } = load('src/modules/site/server/page-layout.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => stored } } } })
  assert.equal((await getPageLayout(1)).cover, '')
  stored = { value: JSON.stringify(validatePageLayout({ cover: '/images/network-earth.webp', pageLayout: 'sidebar' })) }
  const result = await getPageLayout(1)
  assert.equal(result.cover, '/images/network-earth.webp'); assert.equal(result.pageLayout, 'sidebar')
  assert.equal(validatePageLayout({ ...result, cover: '' }).cover, '')
})

test('storefront is opt-in and public filtering does not erase editable menus', async () => {
  let enabled = false
  const { defaultSite } = load('src/modules/site/config/defaults.ts')
  const db = { setting: { findUnique: async ({ where }) => where.key === 'storeEnabled' ? { value: String(enabled) } : { value: JSON.stringify(defaultSite) } } }
  const mocks = { react: { cache: fn => fn }, '@/platform/database/prisma': { db } }
  const { getPublicSiteConfig, getSiteConfig } = load('src/modules/site/config/store.ts', mocks)
  const hidden = await getPublicSiteConfig()
  assert.equal(hidden.navigation.some(link => link.href === '/products'), false)
  assert.equal(hidden.sections.find(section => section.kind === 'products').enabled, false)
  assert.equal((await getSiteConfig()).navigation.some(link => link.href === '/products'), true)
  enabled = true
  assert.equal((await getPublicSiteConfig()).navigation.some(link => link.href === '/products'), true)
  const { isStoreEnabled } = load('src/modules/catalog/server/storefront.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => null } } } })
  assert.equal(await isStoreEnabled(), false)
})

test('disabled storefront blocks new product checkout before inventory or payment access', async () => {
  const mocks = { '@/platform/database/prisma': { db: { order: { findUnique: async () => null } } }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => false } }
  for (const name of ['@/modules/billing/server/gateways', '@/modules/billing/server/billing', '@/modules/wallet/server/wallet', '@/modules/subscriptions/server/usernames', '@/modules/fulfillment/server/jobs', '@/modules/catalog/server/inventory', '@/shared/money', '@/extensions/server/runtime']) mocks[name] = {}
  const { executeCheckout } = load('src/modules/checkout/server/checkout.ts', mocks)
  const result = await executeCheckout({ userId: 1, productId: 1, idempotencyKey: 'test-store-disabled', siteUrl: 'http://localhost' })
  assert.equal(result.code, 'STORE_DISABLED'); assert.equal(result.status, 403)
})

test('direct checkout rejects an active product awaiting approval before payment access', async () => {
  const db = {
    order: { findUnique: async () => null },
    product: { findUnique: async () => ({ id: 7, active: true, approval: 'PENDING', name: 'Awaiting approval', variants: [] }) },
  }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/membership/server/membership': { isMember: async () => false },
  }
  for (const name of ['@/modules/billing/server/gateways', '@/modules/billing/server/billing', '@/modules/wallet/server/wallet', '@/modules/subscriptions/server/usernames', '@/modules/fulfillment/server/jobs', '@/modules/catalog/server/inventory', '@/shared/money', '@/extensions/server/runtime']) mocks[name] = {}
  const { executeCheckout } = load('src/modules/checkout/server/checkout.ts', mocks)
  const result = await executeCheckout({ userId: 1, productId: 7, idempotencyKey: 'test-pending-product', siteUrl: 'http://localhost' })
  assert.equal(result.code, 'PRODUCT_NOT_FOUND'); assert.equal(result.status, 404)
  const malformed = await executeCheckout({ userId: 1, lines: [{ productId: 7, quantity: 0 }, { productId: 8, quantity: 1 }], idempotencyKey: 'test-pending-cart', siteUrl: 'http://localhost' })
  assert.equal(malformed.code, 'PRODUCT_NOT_FOUND'); assert.doesNotMatch(malformed.message, /Awaiting approval/)
})

test('authenticated homepage cards hide wallet details while other plan views retain them', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { default: PlanCards } = load('src/components/PlanCards.tsx', {
    'next-auth/react': { useSession: () => ({ status: 'authenticated' }) },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/i18n/LocaleProvider': { useI18n: () => ({ locale: 'en', t: { walletBalance: 'Wallet balance', walletPayHint: 'Wallet payment hint', topUpWallet: 'Top up' } }) },
    '@/modules/checkout/ui/client': { money: value => `$${value}`, fetchWalletBalances: async () => [] },
  })
  const home = renderToStaticMarkup(React.createElement(PlanCards, { plans: [], showWallet: false }))
  const standard = renderToStaticMarkup(React.createElement(PlanCards, { plans: [] }))
  assert.doesNotMatch(home, /wallet-strip|Wallet balance|Wallet payment hint/)
  assert.match(standard, /Wallet balance/)
})

test('media upload requires CMS access, rejects invalid bytes, and serves uploads immediately', async () => {
  let allowed = false
  const files = new Map()
  const mocks = {
    '@/modules/identity/server/access': { requirePerm: async () => allowed ? { id: 1 } : null },
    'node:fs/promises': { mkdir: async () => {}, writeFile: async (file, bytes) => files.set(file, bytes), readFile: async file => { if (!files.has(file)) throw new Error('missing'); return files.get(file) } },
  }
  const { POST } = load('src/modules/site/server/http/admin/media/route.ts', mocks)
  const { GET } = load('src/modules/site/server/http/media/cover-route.ts', mocks)
  const request = (bytes) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/webp' }), 'cover.webp'); return new NextRequest('http://localhost/api/admin/media', { method: 'POST', body: form }) }
  const bytes = fs.readFileSync(path.join(__dirname, '../public/images/network-earth.webp'))
  assert.equal((await POST(request(bytes))).status, 403)
  allowed = true
  assert.equal((await POST(request('<svg>bad</svg>'))).status, 400)
  const response = await POST(request(bytes)); assert.equal(response.status, 200)
  const { url } = await response.json()
  const served = await GET(new Request('http://localhost' + url), { params: { file: url.split('/').pop() } })
  assert.equal(served.headers.get('Content-Type'), 'image/webp')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), [...files.values()].pop())
  assert.equal((await GET(new Request('http://localhost'), { params: { file: '../.env' } })).status, 404)
  const oversized = new NextRequest('http://localhost/api/admin/media', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: Buffer.alloc(17 * 1024 * 1024) })
  assert.equal((await POST(oversized)).status, 413)
})

test('renewal adds time and traffic while preserving remaining allowance and unlimited quotas', () => {
  const { renewalTarget } = load('src/modules/subscriptions/domain/renewal.ts')
  const day = 86400000, now = Date.UTC(2026, 8, 21)
  const input = { now, localExpiresAt: now + 10 * day, panelExpiresAt: now + 10 * day, localLimitGB: 100, panelLimitGB: 100, days: 30, trafficGB: 50 }
  const next = renewalTarget(input)
  assert.equal(next.trafficLimitGB - 40, 110) // 60 GB remaining + the purchased 50 GB.
  assert.equal(new Date(next.expiresAt).getTime(), now + 40 * day)
  assert.equal(new Date(renewalTarget({ ...input, localExpiresAt: now - day, panelExpiresAt: now - day }).expiresAt).getTime(), now + 30 * day)
  assert.equal(renewalTarget({ ...input, panelLimitGB: 0 }).trafficLimitGB, 0)
  assert.equal(renewalTarget({ ...input, trafficGB: 0 }).trafficLimitGB, 0)
  assert.throws(() => renewalTarget({ ...input, days: -1 }))
})

function renewalHarness() {
  const gb = 1024 ** 3
  const expiresAt = new Date(Date.now() + 10 * 86400000)
  const state = {
    lock: null, failCommit: false, failRead: false, failAfterPanel: false, calls: [],
    sub: { id: 9, username: 'test', trafficLimit: 100, trafficUsed: 40, expiresAt, panelSubUrl: '/sub', panel: {}, plan: { days: 999, trafficGB: 999, panel: {} } },
    remote: { trafficLimit: 100 * gb, trafficUsed: 40 * gb, expiresAt, subUrl: '/sub' },
    jobs: [1, 2].map(id => ({ id, subscriptionId: 9, kind: 'RENEW_SUBSCRIPTION', status: 'PENDING', payload: JSON.stringify({ subscriptionId: 9, days: 30, trafficGB: 50, renewalVersion: 2 }) })),
  }
  const db = {
    setting: {
      create: async ({ data }) => { if (state.lock) throw Object.assign(new Error('unique'), { code: 'P2002' }); state.lock = { ...data } },
      findUnique: async () => state.lock,
      updateMany: async () => ({ count: 0 }),
      deleteMany: async ({ where }) => { if (state.lock?.value === where.value) state.lock = null },
    },
    subscription: { findUnique: async () => structuredClone(state.sub), update: async ({ data }) => Object.assign(state.sub, data) },
    fulfillmentJob: {
      findFirst: async ({ where }) => state.jobs.find(job => job.id < where.id.lt && job.status !== 'DONE') || null,
      update: async ({ where, data }) => Object.assign(state.jobs.find(job => job.id === where.id), data),
    },
    $transaction: async fn => { if (state.failCommit) { state.failCommit = false; throw new Error('database unavailable') } return fn(db) },
  }
  const adapter = {
    getUser: async () => state.failRead ? { ok: false } : { ok: true, user: structuredClone(state.remote) },
    updateUser: async (_username, target) => {
      state.calls.push(structuredClone(target))
      state.remote.expiresAt = target.expiresAt; state.remote.trafficLimit = target.trafficGB * gb
      if (state.failAfterPanel) { state.failAfterPanel = false; throw new Error('response lost') }
      return { ok: true, user: structuredClone(state.remote) }
    },
  }
  const { applyPaidRenewal } = load('src/modules/subscriptions/server/renewal.ts', { '@/platform/database/prisma': { db }, '@/modules/providers/server/panels': { getPanelAdapter: () => adapter } })
  return { state, apply: index => applyPaidRenewal(structuredClone(state.jobs[index])) }
}

test('renewal retries after a lost panel response or failed DB commit do not add credit twice', async () => {
  for (const fault of ['failAfterPanel', 'failCommit']) {
    const { state, apply } = renewalHarness()
    state[fault] = true
    const originalExpiry = state.sub.expiresAt.getTime()
    await assert.rejects(apply(0))
    assert.equal(state.remote.trafficLimit, 150 * 1024 ** 3)
    assert.equal(state.sub.trafficLimit, 100)
    await apply(0)
    assert.equal(state.sub.trafficLimit, 150)
    assert.equal(state.sub.trafficUsed, 40)
    assert.equal(state.sub.expiresAt.getTime(), originalExpiry + 30 * 86400000)
    assert.deepEqual(state.calls[0], state.calls[1])
    await apply(0)
    assert.equal(state.calls.length, 2)
  }
})

test('paid renewals execute in order and use purchased allowances instead of edited plan values', async () => {
  const { state, apply } = renewalHarness()
  await assert.rejects(apply(1), /earlier paid renewal/)
  assert.equal(state.calls.length, 0)
  const originalExpiry = state.sub.expiresAt.getTime()
  await apply(0); state.jobs[0].status = 'DONE'
  await apply(1)
  assert.equal(state.sub.trafficLimit, 200)
  assert.equal(state.sub.trafficUsed, 40)
  assert.equal(state.sub.expiresAt.getTime(), originalExpiry + 60 * 86400000)
})

test('unavailable panel leaves renewal credit unapplied and retryable', async () => {
  const { state, apply } = renewalHarness()
  state.failRead = true
  await assert.rejects(apply(0), /cannot read/)
  assert.equal(state.calls.length, 0)
  assert.equal(state.sub.trafficLimit, 100)
  assert.equal(state.lock, null)
  state.failRead = false
  await apply(0)
  assert.equal(state.sub.trafficLimit, 150)
})

test('concurrent workers cannot apply the same renewal twice', async () => {
  const { state, apply } = renewalHarness()
  const results = await Promise.allSettled([apply(0), apply(0)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(state.calls.length, 1)
  assert.equal(state.sub.trafficLimit, 150)
})

test('customer traffic resets and their legacy alias are denied before calling the provider', async () => {
  let called = false
  const { POST } = load('src/modules/subscriptions/server/http/subscriptions/[id]/route.ts', {
    '@/platform/database/prisma': { db: { subscription: { findUnique: async () => ({ id: 1, userId: 2 }) } } },
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 2 }) },
    '@/modules/subscriptions/server/submanage': { CUSTOMER_SUB_ACTIONS: ['renew', 'sync'], subscriptionAction: async () => { called = true } },
  })
  for (const action of ['reset-traffic', 'resetTraffic']) {
    const req = new NextRequest('http://localhost/api/subscriptions/1', { method: 'POST', body: JSON.stringify({ action }) })
    assert.equal((await POST(req, { params: { id: '1' } })).status, 403)
  }
  assert.equal(called, false)
})

test('disabled public API denies access without resolving credentials', async () => {
  const { authorize } = load('src/modules/public-api/server/v1.ts', {
    '@/modules/public-api/server/availability': { isPublicApiEnabled: async () => false },
    '@/modules/public-api/server/api-keys': { resolveApiCaller: () => { throw new Error('must not resolve credentials') } },
  })
  const result = await authorize(new NextRequest('http://localhost/api/v1/me'))
  assert.equal(result.ok, false); assert.equal(result.response.status, 404)
})

test('category trees expose complete paths, exclude descendants and reject invalid selections', () => {
  const { categoryDescendants, categoryOptions, parseCategoryIds, postCategories } = load('src/modules/site/domain/categories.ts')
  const nodes = [{id:1,name:'Root'}, {id:2,name:'Child',parentId:1}, {id:3,name:'Leaf',parentId:2}, {id:4,name:'Other'}]
  assert.deepEqual(categoryDescendants(nodes,1),[1,2,3])
  assert.equal(categoryOptions(nodes,'en').find(x=>x.value==='3').label,'Root / Child / Leaf')
  assert.deepEqual(categoryOptions(nodes,'en',1).map(x=>x.value),['4'])
  assert.deepEqual(parseCategoryIds(['1',2,1]),[1,2])
  for(const invalid of [null,'1',[0],[-1],[true],[{}],[1.5],Array(101).fill(1)]) assert.throws(()=>parseCategoryIds(invalid))
  assert.deepEqual(postCategories({category:nodes[0],categories:[{category:nodes[0]},{category:nodes[1]}]}).map(x=>x.id),[1,2])
})

test('category parent validation rejects self, ancestor cycles and missing parents', async () => {
  const nodes = [{id:1,name:'Root'}, {id:2,name:'Child',parentId:1}, {id:3,name:'Leaf',parentId:2}]
  const tx = { postCategory: { findMany: async()=>nodes, count: async({where})=>nodes.filter(x=>where.id.in.includes(x.id)).length } }
  const {validateCategoryParent,validateCategorySelection,categoryFilter}=load('src/modules/site/server/categories.ts',{'@/platform/database/prisma':{db:tx}})
  assert.equal(await validateCategoryParent(tx,'',1),null)
  assert.equal(await validateCategoryParent(tx,1,3),1)
  for(const parent of [1,2,3,99]) await assert.rejects(()=>validateCategoryParent(tx,parent,1))
  await assert.rejects(()=>validateCategorySelection(tx,{categoryIds:[1,99]}))
  assert.deepEqual(await validateCategorySelection(tx,{categoryIds:[]}),[])
  assert.deepEqual(await validateCategorySelection(tx,{categoryId:2}),[2])
  assert.deepEqual(await categoryFilter('unknown'),{OR:[{categoryId:{in:[]}},{categories:{some:{categoryId:{in:[]}}}}]})
})

test('renewal preview is read-only, owner-scoped and uses live remaining data', async () => {
  const plan={id:2,name:'Monthly',days:30,trafficGB:50,price:5,priceMinor:500n,currency:'USD',panel:{id:1}}
  const sub={id:3,userId:7,username:'test',plan,panel:null,expiresAt:new Date('2090-01-01'),trafficLimit:100}
  let pending=null, balance=10, online=true, reads=0
  const user={trafficUsed:40*1024**3,trafficLimit:100*1024**3,expiresAt:new Date('2090-01-05')}
  const mocks={
    '@/platform/database/prisma':{db:{subscription:{findUnique:async()=>sub},fulfillmentJob:{findFirst:async()=>pending}}},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({getUser:async()=>{reads++;return {ok:online,user:online?user:null}}})},
    '@/modules/wallet/server/wallet':{walletBalance:async()=>balance},
  }
  const {getRenewalPreview,renewalTerms}=load('src/modules/subscriptions/server/renewal-preview.ts',mocks)
  assert.equal(await getRenewalPreview(3,8),null);assert.equal(reads,0)
  let result=await getRenewalPreview(3,7)
  assert.equal(result.currentRemainingGB,60);assert.equal(result.nextRemainingGB,110)
  assert.equal(result.nextExpiresAt,new Date(new Date('2090-01-05').getTime()+30*86400000).toISOString())
  assert.equal(result.price,5);assert.equal(result.canPay,true)
  const terms=result.terms
  for(const change of [{priceMinor:600n},{days:31},{trafficGB:60},{currency:'EUR'}]) assert.notEqual(renewalTerms({...plan,...change}),terms)
  balance=0;result=await getRenewalPreview(3,7);assert.equal(result.canPay,false)
  user.trafficLimit=0;result=await getRenewalPreview(3,7);assert.equal(result.currentRemainingGB,null);assert.equal(result.nextRemainingGB,null)
  pending={id:9};await assert.rejects(()=>getRenewalPreview(3,7),/RENEWAL_PENDING/)
  pending=null;online=false;await assert.rejects(()=>getRenewalPreview(3,7),/PANEL_UNAVAILABLE/)
})

test('changed renewal terms are rejected before any wallet charge or order creation', async()=>{
  const mocks={
    '@/platform/database/prisma':{db:{subscription:{findUnique:async()=>({id:3,userId:7,plan:{id:2,price:6,priceMinor:600n,currency:'USD',days:30,trafficGB:50,panel:{id:1}}})},order:{findUnique:async()=>null}}},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({})},
    '@/modules/subscriptions/server/provision':{},
    '@/modules/billing/server/billing':{},
    '@/modules/wallet/server/wallet':{walletBalance:()=>{throw new Error('Must not touch wallet')}},
    '@/modules/fulfillment/server/jobs':{},
  }
  const {subscriptionAction}=load('src/modules/subscriptions/server/submanage.ts',mocks)
  const result=await subscriptionAction(3,'renew',{idempotencyKey:'renew-test-123',expectedTerms:'old-terms'})
  assert.equal(result.ok,false);assert.equal(result.code,'RENEWAL_CHANGED')
})

test('reminder thresholds handle boundary, unlimited traffic and invalid data safely',()=>{
  const {reminderDefaults,validateReminderSettings,reminderFacts,renderReminder}=load('src/modules/notifications/domain/reminders.ts')
  const now=Date.now();const input={now,expiresAt:now+3*86400000,used:80,limit:100}
  assert.equal(reminderFacts(input,reminderDefaults).expiry,true)
  assert.equal(reminderFacts(input,reminderDefaults).traffic,true)
  assert.equal(reminderFacts({...input,expiresAt:input.expiresAt+1,used:79},reminderDefaults).expiry,false)
  assert.equal(reminderFacts({...input,limit:0},reminderDefaults).traffic,false)
  assert.equal(reminderFacts({...input,expiresAt:now-1000},reminderDefaults).expired,true)
  assert.equal(reminderFacts({...input,expiresAt:now-1000},reminderDefaults).expiry,false)
  assert.equal(reminderFacts({...input,expiresAt:now-86400001},reminderDefaults),null)
  assert.equal(reminderFacts({...input,used:NaN},reminderDefaults),null)
  for(const change of [{expiryDays:0},{expiryDays:31},{trafficPercent:0},{trafficPercent:91},{enabled:'true'},{expiryTemplate:'{secret}'},{trafficTemplate:''},{expiredTemplate:'{secret}'},{expiryTemplateEn:'{secret}'},{trafficTemplateEn:''},{expiredTemplateEn:'{secret}'}]) assert.throws(()=>validateReminderSettings({...reminderDefaults,...change}))
  assert.equal(renderReminder('{plan} {username}',{plan:'<b>plain</b>',username:'a&b'}),'<b>plain</b> a&b')
})

test('reminder worker deduplicates cycles, respects opt-out, and never retries uncertain delivery',async()=>{
  const records=new Map(),settings=new Map(),texts=[];let sends=0,optedOut=false,sendResult={ok:true,status:200},pending=null,locale='en'
  let expiresAt=new Date(Date.now()+86400000),limit=100*1024**3
  const sub={id:1,userId:2,username:'demo',status:'ACTIVE',panel:{active:true},plan:{name:'پلن تست',nameEn:'Test plan',trafficGB:50,days:30},user:{telegramId:'test-chat'}}
  const db={
    setting:{findUnique:async({where})=>settings.has(where.key)?{key:where.key,value:settings.get(where.key)}:null,
      create:async({data})=>{if(settings.has(data.key))throw {code:'P2002'};settings.set(data.key,data.value);return data},
      upsert:async({where,create,update})=>{settings.set(where.key,settings.has(where.key)?update.value:create.value)},
      deleteMany:async({where})=>{if(settings.get(where.key)===where.value)settings.delete(where.key);return {count:1}},
      updateMany:async()=>({count:0})},
    subscription:{findMany:async()=>[sub]},user:{findUnique:async()=>({telegramId:'test-chat',subscriptionAlerts:!optedOut,status:'ACTIVE'})},
    fulfillmentJob:{findFirst:async()=>pending},
    subscriptionReminder:{
      create:async({data})=>{if(records.has(data.id))throw {code:'P2002'};records.set(data.id,{...data,status:'CLAIMED',attempts:1});return data},
      update:async({where,data})=>records.set(where.id,{...records.get(where.id),...data}),
      updateMany:async()=>({count:0})},
  }
  const {reminderDefaults}=load('src/modules/notifications/domain/reminders.ts')
  const mocks={
    '@/platform/database/prisma':{db},
    './telegram-locale':{getBotLocale:async()=>locale,botText:(lang,en,fa)=>lang==='fa'?fa:en},
    './reminder-settings':{getReminderSettings:async()=>({...reminderDefaults,enabled:true})},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({getUser:async()=>({ok:true,user:{status:'active',trafficUsed:90*1024**3,trafficLimit:limit,expiresAt}})})},
    '@/modules/notifications/server/telegram':{telegramConfig:async()=>({ready:true}),miniAppButton:async(label,path)=>[{text:label,web_app:{url:path}}],bot:async(method,payload)=>{assert.equal(method,'sendMessage');assert.equal(payload.parse_mode,undefined);assert.ok(payload.reply_markup.inline_keyboard[0][0].web_app.url.includes('subscription=1&renew=1'));texts.push(payload.text);sends++;return sendResult}},
  }
  const {runSubscriptionReminders,REMINDER_RUN}=load('src/modules/notifications/server/reminders.ts',mocks)
  const run=async()=>{settings.delete(REMINDER_RUN);return runSubscriptionReminders()}
  await run();assert.equal(sends,2);assert.match(texts[0],/Test plan/);assert.doesNotMatch(texts[0],/پلن تست/);await run();assert.equal(sends,2)
  expiresAt=new Date(expiresAt.getTime()+86400000);optedOut=true;await run();assert.equal(sends,2)
  optedOut=false;pending={id:1};await run();assert.equal(sends,2)
  pending=null;sendResult={ok:false};await run();assert.equal(sends,4);await run();assert.equal(sends,4)
  assert.equal([...records.values()].filter(row=>row.status==='UNKNOWN').length,2)
  expiresAt=new Date(expiresAt.getTime()+86400000);sendResult={ok:true,status:200};locale='fa';await run();assert.equal(sends,6);assert.match(texts.at(-1),/پلن تست/)
})

test('concurrent reminder claims admit one sender for a cycle',async()=>{
  let exists=false
  const mocks={'@/platform/database/prisma':{db:{subscriptionReminder:{create:async()=>{if(exists)throw {code:'P2002'};exists=true},updateMany:async()=>({count:0})}}}}
  const {claimReminder}=load('src/modules/notifications/server/reminders.ts',mocks)
  assert.deepEqual((await Promise.all([claimReminder('same',1,'expiry'),claimReminder('same',1,'expiry')])).sort(),[false,true])
})

test('visual page blocks validate content, reject unsafe links, and load saved sections', async () => {
  let stored = null
  const mocks = { '@/platform/database/prisma': { db: { setting: { findUnique: async () => stored } } } }
  const { validatePageBlocks } = load('src/modules/site/domain/page-blocks.ts', mocks)
  const { getPageBlocks } = load('src/modules/site/server/page-blocks.ts', mocks)
  const block = { id: 'intro', kind: 'hero', title: 'Welcome', titleEn: 'Welcome', text: 'Safe text', image: '/cover.webp', link: '/plans', tone: 'accent' }
  const result = validatePageBlocks([block])
  assert.equal(result[0].link, '/plans')
  stored = { value: JSON.stringify(result) }
  assert.deepEqual(await getPageBlocks(3), result)
  for (const change of [{ link: 'javascript:alert(1)' }, { image: '//evil.example/a' }, { id: 'bad id' }, { kind: 'script' }]) assert.throws(() => validatePageBlocks([{ ...block, ...change }]))
  assert.throws(() => validatePageBlocks([block, block]))
})

test('ticket departments validate fields and restrict staff to assigned teams', () => {
  const { validateDepartment, validateAnswers, parseFields, canHandleDepartment } = load('src/modules/support/domain/department-config.ts')
  const config = validateDepartment({ slug: 'technical', nameFa: 'فنی', nameEn: 'Technical', roleIds: [4], fields: [{ key: 'device', labelFa: 'دستگاه', labelEn: 'Device', type: 'text', required: true }] })
  assert.equal(config.slug, 'TECHNICAL')
  assert.deepEqual(validateAnswers(parseFields(config.fields), { device: 'Android' }), { device: 'Android' })
  assert.throws(() => validateAnswers(parseFields(config.fields), {}))
  assert.throws(() => validateAnswers(parseFields(config.fields), { device: 'Android', rogue: 'x' }))
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: 4, permissions: ['tickets.handle'] }, config), true)
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: 5, permissions: ['tickets.handle'] }, config), false)
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: null }, config), true)
})

test('ticket desk scopes lists and status edits to assigned departments', async () => {
  let listWhere, updates = 0
  const db = {
    ticketDepartment: { findMany: async () => [{ slug: 'SALES', nameFa: 'فروش', nameEn: 'Sales', roleIds: '[4]' }, { slug: 'TECH', nameFa: 'فنی', nameEn: 'Technical', roleIds: '[5]' }], findUnique: async () => ({ roleIds: '[5]' }) },
    ticket: { findMany: async ({ where }) => { listWhere = where; return [] }, findUnique: async () => ({ department: 'TECH' }), update: async () => { updates++; return { id: 1, status: 'CLOSED' } } },
  }
  const route = load('src/modules/support/server/http/admin/tickets/route.ts', { '@/platform/database/prisma': { db }, '@/modules/identity/server/access': { requirePerm: async () => ({ role: 'ADMIN', roleId: 4, permissions: ['tickets.handle'] }) }, '@/modules/identity/rbac': { parsePermissions: value => value.split(',') } })
  assert.equal((await route.GET(new NextRequest('http://localhost/api/admin/tickets'))).status, 200)
  assert.deepEqual(listWhere.department.in, ['SALES'])
  const response = await route.PATCH(new NextRequest('http://localhost/api/admin/tickets', { method: 'PATCH', body: JSON.stringify({ id: 1, status: 'CLOSED' }) }))
  assert.equal(response.status, 403)
  assert.equal(updates, 0)
})

test('Turnstile fails closed and verifies action and hostname when configured', async () => {
  const previous = {
    secret: process.env.TURNSTILE_SECRET_KEY,
    hostname: process.env.TURNSTILE_EXPECTED_HOSTNAME,
    fetch: global.fetch,
  }
  const { verifyTurnstile } = load('src/modules/identity/server/turnstile.ts', {
    '@/platform/http/rate-limit': { clientIp: () => '203.0.113.10' },
  }, new Map())
  try {
    delete process.env.TURNSTILE_SECRET_KEY
    assert.equal(await verifyTurnstile('', new Headers(), 'login'), true)
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key-with-safe-length'
    process.env.TURNSTILE_EXPECTED_HOSTNAME = 'example.com'
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.equal(body.remoteip, '203.0.113.10')
      assert.ok(body.idempotency_key)
      return new Response(JSON.stringify({ success: true, action: 'login', hostname: 'example.com' }))
    }
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'login'), true)
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'register'), false)
    global.fetch = async () => { throw Error('network down') }
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'login'), false)
  } finally {
    if (previous.secret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = previous.secret
    if (previous.hostname === undefined) delete process.env.TURNSTILE_EXPECTED_HOSTNAME; else process.env.TURNSTILE_EXPECTED_HOSTNAME = previous.hostname
    global.fetch = previous.fetch
  }
})
