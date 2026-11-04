// Real PostgreSQL: the hosting catalogue (docs/specs/hosting-cloud/SPEC.md, slice 1). The same server functions the Admin
// API calls, on real rows. HOSTING_FAULT=secret sends the stored secret to the browser view; HOSTING_FAULT=plain stores it
// unencrypted; HOSTING_FAULT=prices keeps old prices when a product is saved. Each must fail this script.
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), prefix = `hosting-${Date.now()}`, ids = { providers: [], products: [] }
const fault = process.env.HOSTING_FAULT || ''
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')

function server() {
  const cache = new Map()
  const mocks = { '@/platform/database/prisma': { db: prisma } }
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    let text = fs.readFileSync(file, 'utf8')
    if (file.endsWith('hosting/server/catalog.ts')) {
      if (fault === 'secret') text = text.replace('({ secret, config: _config, _count, ...provider }) => ({', '({ secret, config: _config, _count, ...provider }) => ({ secret,')
      if (fault === 'plain') text = text.replace('secret: encryptPanelCredential(input.secret) }, select', 'secret: input.secret }, select')
      if (fault === 'prices') text = text.replace('await tx.hostingPrice.deleteMany({ where: { productId: product.id } })', '')
    }
    new Function('require', 'module', 'exports', ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/')) { const base = `src/${name.slice(2)}`; return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`) }
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return { ...load('src/modules/hosting/server/catalog.ts'), registry: load('src/modules/hosting/server/drivers/registry.ts') }
}

async function main() {
  const h = server()
  const refuses = async (promise, pattern, why) => { await assert.rejects(promise, pattern, why) }

  // A connected system: the secret is encrypted at rest and never part of what the Admin page receives.
  const token = `${prefix}-token`
  const provider = await h.saveHostingProvider({ driver: 'PROXMOX', name: `${prefix} pve`, url: 'https://pve.example.invalid:8006', username: 'root@pam!site', secret: token })
  ids.providers.push(provider.id)
  const stored = await prisma.hostingProvider.findUnique({ where: { id: provider.id } })
  assert.ok(stored.secret.startsWith('encv1:') && !stored.secret.includes(token), 'the secret is stored encrypted')
  const view = (await h.adminHostingCatalog()).providers.find((row) => row.id === provider.id)
  assert.equal(view.hasSecret, true)
  assert.ok(!('secret' in view) && !JSON.stringify(view).includes(stored.secret), 'the Admin view never carries the secret')
  // Editing without a secret keeps it; a new one replaces it and clears the last check.
  await prisma.hostingProvider.update({ where: { id: provider.id }, data: { lastCheckOk: true, lastCheckMessage: 'ok', lastCheckAt: new Date() } })
  await h.saveHostingProvider({ id: provider.id, driver: 'PROXMOX', name: `${prefix} pve 2`, url: 'https://pve.example.invalid:8006', username: 'root@pam!site', secret: '' })
  assert.equal((await prisma.hostingProvider.findUnique({ where: { id: provider.id } })).secret, stored.secret)
  await h.saveHostingProvider({ id: provider.id, driver: 'PROXMOX', name: `${prefix} pve 2`, url: 'https://pve.example.invalid:8006', username: 'root@pam!site', secret: `${token}-new` })
  const replaced = await prisma.hostingProvider.findUnique({ where: { id: provider.id } })
  assert.ok(replaced.secret !== stored.secret && replaced.lastCheckOk === null, 'a new secret replaces the old and forgets the last check')
  await refuses(h.saveHostingProvider({ driver: 'PROXMOX', name: 'x', url: 'https://pve.example.invalid', username: 'u', secret: '' }), /رمز یا توکن/, 'a new system needs a secret')

  // The connection check goes through the driver registry and is recorded; a test driver stands in for the real system.
  h.registry.registerHostingDriver('TEST_OK', (connection) => ({ id: 'TEST_OK', capabilities: [], testConnection: async () => ({ ok: connection.secret === `${token}-new`, message: 'test driver' }) }))
  await prisma.hostingProvider.update({ where: { id: provider.id }, data: { driver: 'TEST_OK' } })
  assert.deepEqual(await h.testHostingProvider(provider.id), { ok: true, message: 'test driver' }, 'the driver receives the decrypted secret')
  assert.equal((await prisma.hostingProvider.findUnique({ where: { id: provider.id } })).lastCheckOk, true)
  await prisma.hostingProvider.update({ where: { id: provider.id }, data: { driver: 'PROXMOX' } })
  const pending = await h.testHostingProvider(provider.id)
  assert.equal(pending.ok, false, 'a driver not built yet says so instead of pretending')

  // Products: prices are replaced as a whole and the database refuses what the form would refuse.
  const product = await h.saveHostingProduct({ kind: 'CLOUD_SERVER', name: `${prefix} cloud`, slug: `${prefix}-cloud`, fulfillment: 'DRIVER', providerId: provider.id, prices: [{ cycle: 'HOURLY', amountMinor: '150' }, { cycle: 'MONTH', amountMinor: '100000' }, { cycle: 'YEAR', amountMinor: '1000000' }] })
  ids.products.push(product.id)
  await h.saveHostingProduct({ id: product.id, kind: 'CLOUD_SERVER', name: `${prefix} cloud`, slug: `${prefix}-cloud`, fulfillment: 'DRIVER', providerId: provider.id, prices: [{ cycle: 'MONTH', amountMinor: '120000' }] })
  const prices = await prisma.hostingPrice.findMany({ where: { productId: product.id } })
  assert.deepEqual(prices.map((price) => [price.cycle, price.amountMinor]), [['MONTH', 120000n]], 'a saved product has exactly the prices of the form')
  await refuses(prisma.hostingPrice.create({ data: { productId: product.id, cycle: 'MONTH', currency: 'IRT', amountMinor: 1n } }), /Unique constraint/, 'one price per cycle and currency')
  await refuses(prisma.hostingPrice.create({ data: { productId: product.id, cycle: 'WEEK', currency: 'IRT', amountMinor: 1n } }), /HostingPrice_cycle_check/)
  await refuses(prisma.hostingPrice.create({ data: { productId: product.id, cycle: 'HALF', currency: 'IRT', amountMinor: 0n } }), /HostingPrice_amount_check/)
  await refuses(prisma.hostingProduct.create({ data: { slug: `${prefix}-orphan`, name: 'x', kind: 'VPS', fulfillment: 'DRIVER' } }), /HostingProduct_fulfillment_check/, 'automatic delivery needs a system')
  await refuses(prisma.hostingProduct.create({ data: { slug: `${prefix}-pack`, name: 'x', kind: 'VPS', allowTraffic: true } }), /HostingProduct_traffic_pack_check/)
  await refuses(h.saveHostingProduct({ kind: 'SHARED', name: 'x', slug: `${prefix}-cloud`, prices: [{ cycle: 'MONTH', amountMinor: '1' }] }), /نامک/, 'slugs are unique')
  await refuses(h.saveHostingProduct({ kind: 'SHARED', name: 'x', slug: `${prefix}-panel`, fulfillment: 'DRIVER', providerId: provider.id, prices: [{ cycle: 'MONTH', amountMinor: '1' }] }), /این سامانه برای این نوع محصول نیست/, 'a web hosting product cannot be delivered by a virtualizer')

  // A system that delivers products is not deleted, by the function or by the database.
  await refuses(h.deleteHostingProvider(provider.id), /محصول دارد/)
  await refuses(prisma.hostingProvider.delete({ where: { id: provider.id } }), /Foreign key constraint/)

  // The public catalogue: active, priced products of the page's group, with exact monthly figures and savings.
  const manual = await h.saveHostingProduct({ kind: 'VPS', name: `${prefix} vps`, slug: `${prefix}-vps`, prices: [{ cycle: 'MONTH', amountMinor: '200000' }, { cycle: 'YEAR', amountMinor: '2000000' }] })
  ids.products.push(manual.id)
  const hidden = await h.saveHostingProduct({ kind: 'VPS', name: `${prefix} off`, slug: `${prefix}-off`, active: false, prices: [] })
  ids.products.push(hidden.id)
  const servers = await h.publicHostingCatalog('servers'), web = await h.publicHostingCatalog('hosting')
  const vps = servers.find((row) => row.id === manual.id)
  assert.deepEqual(vps.prices.map((price) => [price.cycle, price.amount, price.monthly, price.saving]), [['MONTH', 200000, 200000, 0], ['YEAR', 2000000, 166666, 16]])
  assert.ok(!servers.some((row) => row.id === hidden.id), 'an inactive product is not public')
  assert.ok(!web.some((row) => row.id === manual.id), 'servers are not listed with web hosting')

  assert.equal(await h.deleteHostingProduct(product.id), true)
  assert.equal(await prisma.hostingPrice.count({ where: { productId: product.id } }), 0, 'prices go with their product')
  assert.equal(await h.deleteHostingProvider(provider.id), true, 'a system without products can be removed')
  console.log('hosting catalogue: secrets, prices, database rules and public catalogue verified')
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => {
    await prisma.hostingProduct.deleteMany({ where: { slug: { startsWith: prefix } } }).catch(() => {})
    await prisma.hostingProvider.deleteMany({ where: { name: { startsWith: prefix } } }).catch(() => {})
    await prisma.$disconnect()
  })
