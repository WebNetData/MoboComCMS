// Stock locations (catalog/server/locations): online sales take only from online locations above the reserve, the counter
// only from its shelf, releases go back where they came from, transfers/receipts/counts keep the ledger and site count right.
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), { PrismaClient } = require('@prisma/client')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
const db = new PrismaClient(), stamp = `loc-${Date.now().toString(36)}`
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db } })
const locations = load('src/modules/catalog/server/locations.ts'), documents = load('src/modules/catalog/server/stock-documents.ts'), admin = load('src/modules/catalog/server/location-admin.ts')
const created = { products: [], places: [], users: [], orders: [] }
const units = async (productId, locationId) => (await db.locationStock.findFirst({ where: { productId, locationId } }))?.quantity ?? null
const site = async (productId) => (await db.product.findUnique({ where: { id: productId }, select: { stock: true } })).stock

;(async () => {
  const home = await db.$transaction((tx) => locations.defaultLocationId(tx))
  const product = await db.product.create({ data: { name: `${stamp}-p`, slug: `${stamp}-p`, sku: `${stamp}-p`, kind: 'PHYSICAL', active: true, price: 1000, priceMinor: 1000n, costMinor: 600n, currency: 'IRT', stock: 10 } })
  created.products.push(product.id)
  await db.$transaction((tx) => locations.adoptEditorStock(tx, product.id))
  assert.equal(await units(product.id, home), 10, 'a new finite count starts in the default location')
  assert.equal(await site(product.id), 10)

  const shop = await admin.saveLocation({ name: `${stamp}-shop`, kind: 'SHOP', sellsOnline: false })
  created.places.push(shop.id)
  await admin.transferItem({ productId: product.id, from: home, to: shop.id, quantity: 3 }, null)
  assert.equal(await units(product.id, home), 7); assert.equal(await units(product.id, shop.id), 3)
  assert.equal(await site(product.id), 7, 'units on a shop-only shelf are not sold online')
  await assert.rejects(admin.transferItem({ productId: product.id, from: shop.id, to: home, quantity: 4 }, null), /کافی نیست/)

  await admin.setOnlineReserve({ productId: product.id, reserve: 2 })
  assert.equal(await site(product.id), 5, 'the online reserve is kept back from the site')

  const item = { productId: product.id, variantId: null }
  await assert.rejects(db.$transaction((tx) => locations.takeFromLocations(tx, { ...item, quantity: 6 })), locations.OutOfStock)
  const online = await db.$transaction((tx) => locations.takeFromLocations(tx, { ...item, quantity: 5 }))
  assert.deepEqual(online, [{ l: home, q: 5 }]); assert.equal(await site(product.id), 0); assert.equal(await units(product.id, home), 2)

  const counter = await db.$transaction((tx) => locations.takeFromLocations(tx, { ...item, quantity: 3 }, { locationId: shop.id }))
  assert.deepEqual(counter, [{ l: shop.id, q: 3 }]); assert.equal(await units(product.id, shop.id), 0)
  await assert.rejects(db.$transaction((tx) => locations.takeFromLocations(tx, { ...item, quantity: 1 }, { locationId: shop.id })), locations.OutOfStock, 'the counter never sells the warehouse')

  await db.$transaction((tx) => locations.returnToLocations(tx, { ...item, quantity: 5 }, online, 'RELEASE'))
  assert.equal(await units(product.id, home), 7); assert.equal(await site(product.id), 5)

  // Concurrent online holds on the last sellable units: exactly one wins.
  const race = await Promise.allSettled([1, 2].map(() => db.$transaction((tx) => locations.takeFromLocations(tx, { ...item, quantity: 4 }))))
  assert.equal(race.filter((row) => row.status === 'fulfilled').length, 1)
  const won = race.find((row) => row.status === 'fulfilled').value
  await db.$transaction((tx) => locations.returnToLocations(tx, { ...item, quantity: 4 }, won, 'RELEASE'))

  const receipt = await documents.createReceipt({ requestId: randomUUID(), locationId: home, supplier: 'QA', lines: [{ productId: product.id, quantity: 4, unitCost: '900' }] }, null)
  assert.equal(await units(product.id, home), 11)
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).costMinor, 709n, 'moving-average cost (7×600 + 4×900) / 11')

  const request = { requestId: randomUUID(), locationId: home, supplier: 'QA-retry', lines: [{ productId: product.id, quantity: 1 }] }
  const before = await units(product.id, home)
  await assert.rejects(documents.createReceipt(request, null, async () => { throw Error('audit-fault') }), /audit-fault/)
  assert.equal(await units(product.id, home), before)
  const receiptRace = await Promise.all([documents.createReceipt(request, null), documents.createReceipt(request, null)])
  assert.equal(receiptRace[0].id, receiptRace[1].id); assert.equal(await units(product.id, home), before + 1)
  await assert.rejects(documents.createReceipt({ ...request, supplier: 'changed' }, null), /دیگری/)
  await db.stockReceipt.delete({ where: { id: receiptRace[0].id } })
  const unknown = await db.product.create({ data: { name: `${stamp}-unknown`, slug: `${stamp}-unknown`, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 2, costMinor: null } }); created.products.push(unknown.id)
  await db.$transaction(tx => locations.adoptEditorStock(tx, unknown.id))
  const receivedUnknown = await documents.createReceipt({ requestId: randomUUID(), locationId: home, lines: [{ productId: unknown.id, quantity: 1, unitCost: '500' }] }, null)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: unknown.id } })).costMinor, null, 'a receipt never invents the unknown cost of existing units')
  await db.stockReceipt.delete({ where: { id: receivedUnknown.id } })
  const count = await documents.startCount({ locationId: shop.id }, null)
  await documents.countLine({ countId: count.id, productId: product.id }); await documents.countLine({ countId: count.id, productId: product.id })
  await assert.rejects(documents.startCount({ locationId: shop.id }, null), /شمارش باز/)
  assert.deepEqual(await documents.postCount({ countId: count.id }, null), { changed: 1 })
  assert.equal(await units(product.id, shop.id), 2)
  const line = await db.stockCountLine.findFirst({ where: { countId: count.id } })
  assert.equal(line.expected, 0); assert.equal(line.delta, 2)

  await assert.rejects(documents.countLine({ countId: count.id, productId: product.id }), /بسته/)
  const staleCount = await documents.startCount({ locationId: home }, null)
  await documents.countLine({ countId: staleCount.id, productId: product.id, counted: await units(product.id, home) })
  await new Promise(resolve => setTimeout(resolve, 5))
  await db.$transaction(tx => locations.addAtLocation(tx, { productId: product.id, variantId: null, locationId: home, quantity: 1 }, 'RECEIPT'))
  await assert.rejects(documents.postCount({ countId: staleCount.id }, null), /پس از شمارش/)
  await documents.cancelCount({ countId: staleCount.id })
  await db.stockCount.delete({ where: { id: staleCount.id } })
  const ledger = await db.stockMovement.findMany({ where: { productId: product.id }, orderBy: { id: 'asc' } })
  assert.ok(ledger.every((row) => row.balance >= 0))
  assert.ok(['INIT', 'TRANSFER', 'HOLD', 'RELEASE', 'RECEIPT', 'COUNT'].every((reason) => ledger.some((row) => row.reason === reason)))
  for (const place of [home, shop.id]) {
    const sum = ledger.filter((row) => row.locationId === place).reduce((total, row) => total + row.delta, 0)
    assert.equal(sum, await units(product.id, place), 'ledger sums to the location units')
  }

  const family = await db.product.create({ data: { name: `${stamp}-variants`, slug: `${stamp}-variants`, kind: 'PHYSICAL', price: 1000, priceMinor: 1000n, currency: 'IRT', stock: -1, costMinor: 600n, variants: { create: [{ name: 'A', sku: `${stamp}-a`, stock: 3, price: 1000, priceMinor: 1000n }, { name: 'B', sku: `${stamp}-b`, stock: 4, price: 1000, priceMinor: 1000n }] } }, include: { variants: { orderBy: { id: 'asc' } } } }); created.products.push(family.id)
  const [a, b] = family.variants
  await db.$transaction(tx => locations.adoptEditorStock(tx, family.id))
  const variantReceipt = await documents.createReceipt({ requestId: randomUUID(), locationId: home, lines: [{ productId: family.id, variantId: a.id, quantity: 3, unitCost: '900' }] }, null)
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: a.id } })).costMinor, 750n, 'weighted variant cost starts from its inherited parent cost')
  await admin.transferItem({ productId: family.id, variantId: a.id, from: home, to: shop.id, quantity: 5 }, null)
  await admin.setOnlineReserve({ productId: family.id, reserve: 1 })
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: a.id } })).stock, 0)
  await assert.rejects(db.$transaction(tx => locations.takeFromLocations(tx, { productId: family.id, variantId: a.id, quantity: 1 })), locations.OutOfStock)
  const fromShop = await db.$transaction(tx => locations.takeFromLocations(tx, { productId: family.id, variantId: a.id, quantity: 2 }, { locationId: shop.id }))
  assert.deepEqual(fromShop, [{ l: shop.id, q: 2 }])
  const fromWeb = await db.$transaction(tx => locations.takeFromLocations(tx, { productId: family.id, variantId: b.id, quantity: 3 }))
  assert.deepEqual(fromWeb, [{ l: home, q: 3 }])
  await db.$transaction(async tx => { await locations.returnToLocations(tx, { productId: family.id, variantId: a.id, quantity: 2 }, fromShop, 'RELEASE'); await locations.returnToLocations(tx, { productId: family.id, variantId: b.id, quantity: 3 }, fromWeb, 'RELEASE') })
  await db.stockReceipt.delete({ where: { id: variantReceipt.id } })
  const buyer = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'test-only' } }); created.users.push(buyer.id)
  const held = await db.order.create({ data: { userId: buyer.id, productId: product.id, idempotencyKey: `${stamp}-held`, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', lines: { create: [{ productId: product.id, name: 'held', kind: 'PHYSICAL', quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, currency: 'IRT' }] } } }); created.orders.push(held.id)
  const inventory = load('src/modules/catalog/server/inventory.ts')
  assert.equal((await inventory.reserveInventory({ orderId: held.id })).ok, true)
  await db.$transaction(async (tx) => { await tx.product.update({ where: { id: product.id }, data: { stock: -1 } }); await locations.adoptEditorStock(tx, product.id) })
  assert.equal(await db.locationStock.count({ where: { productId: product.id } }), 0, 'unlimited stops tracking')
  await inventory.releaseInventoryReservation(held.id)
  assert.equal(await site(product.id), -1, 'releasing an old hold never turns unlimited stock finite again')
  await db.stockReceipt.delete({ where: { id: receipt.id } })
  console.log('stock locations: ok')
})().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.inventoryReservation.deleteMany({ where: { orderId: { in: created.orders } } })
  await db.orderLine.deleteMany({ where: { orderId: { in: created.orders } } })
  await db.order.deleteMany({ where: { id: { in: created.orders } } })
  await db.user.deleteMany({ where: { id: { in: created.users } } })
  await db.stockMovement.deleteMany({ where: { productId: { in: created.products } } })
  await db.locationStock.deleteMany({ where: { productId: { in: created.products } } })
  await db.stockCount.deleteMany({ where: { locationId: { in: created.places } } })
  await db.stockLocation.deleteMany({ where: { id: { in: created.places } } })
  await db.product.deleteMany({ where: { id: { in: created.products } } })
  await db.$disconnect()
})
