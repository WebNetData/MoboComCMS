// Run the actual seed owner against an in-memory Prisma boundary; no database or .env.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const seedDir = path.join(__dirname, '..', 'prisma')
const source = fs.readFileSync(path.join(seedDir, 'seed.cjs'), 'utf8')
const definitions = require('../prisma/system-roles.json')
const demoModels = ['panel', 'plan', 'postCategory', 'post', 'productCategory', 'product', 'mapLocation', 'gateway', 'expense', 'order', 'payment', 'siteForm', 'forumCategory']

async function run(demo, existing = false) {
  let nextId = 10
  const calls = []
  const rows = Object.fromEntries([...demoModels, 'user', 'role', 'page', 'setting', 'invoice', 'ticketDepartment'].map(name => [name, []]))
  rows.role = definitions.map((role, id) => ({ id: id + 1, ...role }))
  rows.role[0].permissions = 'owner-custom-permission'
  if (existing) {
    rows.user.push({ id: 1, email: 'admin@example.com', role: 'CUSTOMER', roleId: 99, passwordHash: 'owner-password' })
    rows.page.push({ id: 2, slug: 'terms', title: 'Owner policy', content: 'Owner approved terms', status: 'PUBLISHED' })
    rows.setting.push({ key: 'brandName', value: 'Owner brand' }, { key: 'page.layout.2', value: 'owner-layout' })
  }
  const original = structuredClone(rows)
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'user') return matches(rows.user.find(user => user.id === row.userId) || {}, value)
    if (value && typeof value === 'object') {
      if ('startsWith' in value) return row[key]?.startsWith(value.startsWith)
      if ('contains' in value) return row[key]?.includes(value.contains)
    }
    return row[key] === value
  })
  const prisma = { $executeRaw: async () => {}, $transaction: async work => work(prisma) }
  for (const [model, data] of Object.entries(rows)) {
    const record = operation => { calls.push(`${model}.${operation}`) }
    const find = args => data.find(row => matches(row, args?.where)) || null
    const create = args => { const row = { id: nextId++, ...args.data }; data.push(row); return row }
    prisma[model] = {
      findUnique: async args => { record('findUnique'); return find(args) },
      findFirst: async args => { record('findFirst'); return find(args) },
      findMany: async args => { record('findMany'); return data.filter(row => matches(row, args?.where)).slice(0, args?.take) },
      count: async () => { record('count'); return data.length },
      create: async args => { record('create'); return create(args) },
      createMany: async args => { record('createMany'); args.data.forEach(row => create({ data: row })) },
      upsert: async args => { record('upsert'); assert.deepEqual(args.update, {}, 'bootstrap never overwrites existing rows'); return find(args) || create({ data: args.create }) },
      update: async () => { throw new Error(`Seed must never update existing ${model} rows`) },
    }
  }
  const module = { exports: {} }
  const env = { ...(demo === undefined ? {} : { SEED_DEMO_DATA: demo }), ADMIN_PASSWORD: 'test-only-not-a-real-password' }
  const fakeRequire = name => {
    if (name === '@prisma/client') return { PrismaClient: class { constructor() { return prisma } }, Prisma: { sql: (...args) => args } }
    if (name === 'bcryptjs') return { hashSync: value => `hash:${value}` }
    if (name === './system-roles.json') return definitions
    return require(name)
  }
  new Function('require', 'module', 'exports', '__dirname', 'process', 'console', source.replace(/\nmain\(\)[\s\S]*$/, '\nmodule.exports = { main }\n'))(
    fakeRequire, module, module.exports, seedDir, { env }, { log() {} },
  )
  assert.equal(typeof module.exports.main, 'function', 'execute the actual seed main')
  await module.exports.main()
  return { rows, calls, original }
}

async function main() {
  for (const flag of [undefined, 'false', 'TRUE', '1', 'true ']) {
    const { rows, calls } = await run(flag)
    assert.equal(calls.some(call => demoModels.some(model => call.startsWith(`${model}.`))), false, `demo owners must not run for ${String(flag)}`)
    assert.equal(rows.invoice.length, 0)
    assert.equal(rows.user.length, 1, 'initial admin still bootstraps')
    assert.deepEqual(rows.page.map(page => [page.slug, page.status]), [['terms', 'DRAFT'], ['privacy', 'DRAFT'], ['refund', 'DRAFT']])
    assert.equal(rows.setting.find(row => row.key === 'supportTelegram').value, '')
    assert.equal(rows.setting.some(row => row.key.startsWith('stats')), false, 'no fictional public statistics')
    assert.equal(rows.ticketDepartment.length, 4, 'support bootstrap remains available')
  }
  const replay = await run(undefined, true)
  assert.deepEqual(replay.rows.user[0], replay.original.user[0], 'existing identity role and password preserved')
  assert.deepEqual(replay.rows.page[0], replay.original.page[0], 'existing publication/content preserved')
  assert.deepEqual(replay.rows.setting.slice(0, 2), replay.original.setting, 'existing settings/layout preserved')
  assert.deepEqual(replay.rows.role, replay.original.role, 'existing role definitions preserved')
  const { rows, calls } = await run('true')
  for (const model of demoModels) assert.ok(calls.some(call => call.startsWith(`${model}.`)), `explicit demo still includes ${model}`)
  assert.equal(rows.product.length, 3)
  assert.equal(rows.post.length, 3)
  assert.equal(rows.mapLocation.length, 25)
  assert.equal(rows.page.filter(page => ['terms', 'privacy', 'refund'].includes(page.slug)).every(page => page.status === 'DRAFT'), true)
  assert.equal(rows.order.length, 15)
  assert.equal(rows.invoice.length, 15)
  assert.equal(rows.payment.length, 15)
  console.log('Seed launch controls: explicit demo opt-in, draft starter policies, preserved existing identity/content/settings and bootstrap essentials passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
