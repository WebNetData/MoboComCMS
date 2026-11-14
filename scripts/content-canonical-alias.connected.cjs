// Run against a disposable PostgreSQL database: node scripts/content-canonical-alias.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const db = new PrismaClient()
const stamp = `canonical-${Date.now()}`
const ids = { users: [], titles: [], seasons: [], links: [], products: [], games: [], software: [], aliases: [], roles: [], orders: [], locations: [], paidItems: [], purchases: [] }
let viewer = null, moduleOn = true
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: String(viewer.id), authAt: Date.now() } : null },
  '@/extensions/server/modules': { isModuleEnabled: async () => moduleOn, moduleGuard: async () => moduleOn ? null : Response.json({ error: 'off' }, { status: 404 }) },
  '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
})
const aliases = load('src/modules/content/server/canonical-alias.ts')
const routes = aliases.canonicalAliasRoutes()
const request = (path, method = 'GET', body) => new NextRequest(`http://localhost${path}`, { method, headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

async function main() {
  assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'Disposable PostgreSQL required')
  const role = await db.role.create({ data: { name: stamp, permissions: 'cinema.manage' } }); ids.roles.push(role.id)
  const user = await db.user.create({ data: { email: `${stamp}@test.invalid`, passwordHash: 'test-only', name: stamp, role: 'ADMIN', roleId: role.id, totpEnabledAt: new Date() } })
  ids.users.push(user.id)
  const source = await db.cinemaTitle.create({ data: { slug: `${stamp}-source`, title: 'Duplicate title for alias check', titleEn: 'Duplicate title for alias check', kind: 'SERIES', year: 2025, status: 'PUBLISHED', summary: 'Preserved source record for canonical alias history.' } })
  ids.titles.push(source.id)
  const target = await db.cinemaTitle.create({ data: { slug: `${stamp}-target`, title: 'Duplicate title for alias check', titleEn: 'Duplicate title for alias check', kind: 'SERIES', year: 2025, status: 'PUBLISHED', summary: 'Published canonical destination for alias check.' } })
  ids.titles.push(target.id)
  const season = await db.cinemaSeason.create({ data: { titleId: source.id, number: 1, name: 'History stays on source' } })
  ids.seasons.push(season.id)

  viewer = { id: user.id, email: user.email }
  const query = `/api/admin/content/canonical-alias?kind=cinema&sourceId=${source.id}`
  viewer = null
  const denied = await routes.GET(request(query))
  assert.equal(denied.status, 403, 'an unauthenticated visitor cannot review aliases')
  viewer = user
  const roleBefore = await db.role.findUniqueOrThrow({ where: { id: role.id } })
  await db.role.update({ where: { id: role.id }, data: { permissions: 'software.manage' } })
  assert.equal((await routes.GET(request(query))).status, 403, 'permission for another section cannot review cinema records')
  await db.role.update({ where: { id: role.id }, data: { permissions: roleBefore.permissions } })

  const previewResponse = await routes.GET(request(`${query}&targetId=${target.id}`))
  assert.equal(previewResponse.status, 200)
  const preview = await previewResponse.json()
  assert.equal(preview.canCanonicalize, true)
  const createBody = { kind: 'cinema', sourceId: source.id, targetId: target.id, sourceVersion: preview.source.version, targetVersion: preview.target.version, confirm: true }
  const createdResponse = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', createBody))
  assert.equal(createdResponse.status, 200, await createdResponse.clone().text())
  const alias = await db.contentCanonicalAlias.findFirstOrThrow({ where: { cinemaSourceId: source.id, active: true } })
  ids.aliases.push(alias.id)
  assert.equal(alias.cinemaTargetId, target.id)
  assert.equal((await db.cinemaTitle.findUniqueOrThrow({ where: { id: source.id } })).status, 'TRASHED')
  assert.equal(await db.cinemaSeason.count({ where: { titleId: source.id } }), 1, 'aliasing retains the source season and its identity')
  assert.equal(await aliases.resolveCanonicalAliasSlug('cinema', source.slug), `/cinema/${target.slug}`)

  const staleUndo = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', { ...createBody, action: 'undo', sourceVersion: preview.source.version }))
  assert.equal(staleUndo.status, 409, 'stale current-version claim cannot undo the alias')
  const undoPreview = await routes.GET(request(`${query}&undo=1`))
  assert.equal(undoPreview.status, 200)
  const current = await undoPreview.json()
  const undone = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', { kind: 'cinema', sourceId: source.id, targetId: target.id, action: 'undo', sourceVersion: current.source.version, targetVersion: current.target.version }))
  assert.equal(undone.status, 200, await undone.clone().text())
  const restored = await db.cinemaTitle.findUniqueOrThrow({ where: { id: source.id } })
  assert.equal(restored.status, 'PUBLISHED')
  assert.equal(await db.cinemaSeason.count({ where: { titleId: source.id } }), 1, 'undo leaves the original relationship in place')
  assert.equal(await db.contentCanonicalAlias.count({ where: { id: alias.id, active: true } }), 0)

  const restrictedSource = await db.cinemaTitle.create({ data: { slug: `${stamp}-restricted-source`, title: 'Restricted alias fixture', titleEn: 'Restricted alias fixture', kind: 'MOVIE', year: 2025, status: 'PUBLISHED', audienceGroups: '["members"]' } })
  ids.titles.push(restrictedSource.id)
  const restrictedTarget = await db.cinemaTitle.create({ data: { slug: `${stamp}-restricted-target`, title: 'Restricted alias fixture', titleEn: 'Restricted alias fixture', kind: 'MOVIE', year: 2025, status: 'PUBLISHED' } })
  ids.titles.push(restrictedTarget.id)
  const restrictedPath = `/api/admin/content/canonical-alias?kind=cinema&sourceId=${restrictedSource.id}&targetId=${restrictedTarget.id}`
  assert.equal((await routes.GET(request(restrictedPath))).status, 422, 'source limited to an audience group cannot be aliased')
  await db.cinemaTitle.update({ where: { id: restrictedSource.id }, data: { audienceGroups: '' } })
  await db.cinemaTitle.update({ where: { id: restrictedTarget.id }, data: { audienceGroups: '["members"]' } })
  assert.equal((await routes.GET(request(restrictedPath))).status, 422, 'target limited to an audience group cannot be aliased')

  const paidSource = await db.cinemaTitle.create({ data: { slug: `${stamp}-paid-source`, title: 'Paid alias fixture', titleEn: 'Paid alias fixture', kind: 'SERIES', year: 2025, status: 'PUBLISHED' } })
  ids.titles.push(paidSource.id)
  const paidTarget = await db.cinemaTitle.create({ data: { slug: `${stamp}-paid-target`, title: 'Paid alias fixture', titleEn: 'Paid alias fixture', kind: 'SERIES', year: 2025, status: 'PUBLISHED' } })
  ids.titles.push(paidTarget.id)
  const paidSeason = await db.cinemaSeason.create({ data: { titleId: paidSource.id, number: 1, name: 'Purchased episode season' } })
  ids.seasons.push(paidSeason.id)
  const paidEpisode = await db.cinemaEpisode.create({ data: { seasonId: paidSeason.id, number: 1, title: 'Purchased episode' } })
  const episodeLink = await db.mediaLink.create({ data: { ownerType: 'episode', ownerId: paidEpisode.id, url: 'https://media.example.invalid/purchased-episode' } })
  ids.links.push(episodeLink.id)
  const episodeOffer = await db.paidItem.create({ data: { ownerType: 'link', ownerId: episodeLink.id, priceMinor: 1500n, active: false } })
  ids.paidItems.push(episodeOffer.id)
  const episodeEntitlement = await db.contentPurchase.create({ data: { userId: user.id, ownerType: 'link', ownerId: episodeLink.id, source: 'ADMIN' } })
  ids.purchases.push(episodeEntitlement.id)
  const targetSeason = await db.cinemaSeason.create({ data: { titleId: paidTarget.id, number: 1, name: 'Target purchased episode season' } })
  ids.seasons.push(targetSeason.id)
  const targetEpisode = await db.cinemaEpisode.create({ data: { seasonId: targetSeason.id, number: 1, title: 'Target purchased episode' } })
  const targetEpisodeLink = await db.mediaLink.create({ data: { ownerType: 'episode', ownerId: targetEpisode.id, url: 'https://media.example.invalid/target-purchased-episode' } })
  ids.links.push(targetEpisodeLink.id)
  const targetEpisodeOffer = await db.paidItem.create({ data: { ownerType: 'link', ownerId: targetEpisodeLink.id, priceMinor: 1800n, active: false } })
  ids.paidItems.push(targetEpisodeOffer.id)
  const targetEpisodeEntitlement = await db.contentPurchase.create({ data: { userId: user.id, ownerType: 'link', ownerId: targetEpisodeLink.id, source: 'ADMIN' } })
  ids.purchases.push(targetEpisodeEntitlement.id)
  const inactiveOffer = await db.paidItem.create({ data: { ownerType: 'title', ownerId: paidSource.id, priceMinor: 2500n, active: false } })
  ids.paidItems.push(inactiveOffer.id)
  const targetOffer = await db.paidItem.create({ data: { ownerType: 'title', ownerId: paidTarget.id, priceMinor: 3000n, active: false } })
  ids.paidItems.push(targetOffer.id)
  const entitlement = await db.contentPurchase.create({ data: { userId: user.id, ownerType: 'title', ownerId: paidSource.id, source: 'ADMIN' } })
  ids.purchases.push(entitlement.id)
  const paidPath = `/api/admin/content/canonical-alias?kind=cinema&sourceId=${paidSource.id}&targetId=${paidTarget.id}`
  const paidPreviewResponse = await routes.GET(request(paidPath))
  assert.equal(paidPreviewResponse.status, 200)
  const paidPreview = await paidPreviewResponse.json()
  assert.deepEqual(paidPreview.mediaEntitlements, { paidItems: 2, purchases: 1, descendantPaidItems: 2, descendantPurchases: 2 }, 'source and target offers plus source and target episode-link entitlements are surfaced as blockers')
  assert.equal(paidPreview.canCanonicalize, false)
  const paidCreate = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', { kind: 'cinema', sourceId: paidSource.id, targetId: paidTarget.id, sourceVersion: paidPreview.source.version, targetVersion: paidPreview.target.version, confirm: true }))
  assert.equal(paidCreate.status, 409, 'inactive offer with existing purchases refuses alias creation')
  assert.equal((await db.contentPurchase.findUniqueOrThrow({ where: { id: entitlement.id } })).ownerId, paidSource.id, 'purchase owner remains unchanged')

  async function reviewedAlias(kind, sourceId, targetId, permission, sourceSlug, targetSlug, editArchivedSourceBeforeUndo = false) {
    await db.role.update({ where: { id: role.id }, data: { permissions: permission } })
    const path = `/api/admin/content/canonical-alias?kind=${kind}&sourceId=${sourceId}`
    const detail = await routes.GET(request(`${path}&targetId=${targetId}`))
    assert.equal(detail.status, 200, `${kind} scoped preview`)
    const snapshot = await detail.json()
    assert.equal(snapshot.canCanonicalize, true, `${kind} can be canonicalized`)
    const body = { kind, sourceId, targetId, sourceVersion: snapshot.source.version, targetVersion: snapshot.target.version, confirm: true }
    assert.equal((await routes.POST(request('/api/admin/content/canonical-alias', 'POST', body))).status, 200, `${kind} create`)
    const active = await db.contentCanonicalAlias.findFirstOrThrow({ where: { active: true, sourcePath: snapshot.source.path } })
    ids.aliases.push(active.id)
    assert.equal((await loadEntity(kind, sourceId)).updatedAt.toISOString(), active.sourceVersion.toISOString(), `${kind} stores the source revision after archive`)
    const publicSection = { product: 'products', cinema: 'cinema', game: 'games', software: 'software' }[kind]
    assert.equal(await aliases.resolveCanonicalAliasSlug(kind, sourceSlug), `/${publicSection}/${targetSlug}`)
    const current = await routes.GET(request(`${path}&undo=1`)), currentData = await current.json()
    assert.equal(current.status, 200, `${kind} undo preview`)
    if (editArchivedSourceBeforeUndo) {
      if (kind === 'software') await db.softwareTitle.update({ where: { id: sourceId }, data: { titleEn: 'Archived source edited after alias' } })
      const afterEdit = await routes.GET(request(`${path}&undo=1`)), afterEditData = await afterEdit.json()
      assert.equal(afterEdit.status, 200, `${kind} changed-source undo preview remains current`)
      const refused = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', { ...body, action: 'undo', sourceVersion: afterEditData.source.version, targetVersion: afterEditData.target.version }))
      assert.equal(refused.status, 409, `${kind} undo refuses an archived source edited after alias creation`)
      assert.equal(await db.contentCanonicalAlias.count({ where: { id: active.id, active: true } }), 1, 'refused undo keeps redirect active')
      return
    }
    const undo = await routes.POST(request('/api/admin/content/canonical-alias', 'POST', { ...body, action: 'undo', sourceVersion: currentData.source.version, targetVersion: currentData.target.version }))
    assert.equal(undo.status, 200, `${kind} undo`)
    assert.equal(await db.contentCanonicalAlias.count({ where: { id: active.id, active: true } }), 0)
  }

  async function loadEntity(kind, id) {
    return kind === 'product' ? db.product.findUniqueOrThrow({ where: { id } })
      : kind === 'cinema' ? db.cinemaTitle.findUniqueOrThrow({ where: { id } })
        : kind === 'game' ? db.gameTitle.findUniqueOrThrow({ where: { id } })
          : db.softwareTitle.findUniqueOrThrow({ where: { id } })
  }

  await db.role.update({ where: { id: role.id }, data: { permissions: 'cms.products' } })
  const productSource = await db.product.create({ data: { slug: `${stamp}-product-source`, name: 'Alias product fixture', kind: 'PHYSICAL', currency: 'IRT', price: 1, priceMinor: 100n, stock: 0, active: true, approval: 'APPROVED' } })
  ids.products.push(productSource.id)
  const productTarget = await db.product.create({ data: { slug: `${stamp}-product-target`, name: 'Alias product fixture', kind: 'PHYSICAL', currency: 'IRT', price: 1, priceMinor: 100n, stock: 0, active: true, approval: 'APPROVED' } })
  ids.products.push(productTarget.id)
  const offline = await db.stockLocation.create({ data: { name: `${stamp}-offline`, sellsOnline: false } })
  ids.locations.push(offline.id)
  await db.locationStock.create({ data: { locationId: offline.id, productId: productSource.id, itemKey: `${productSource.id}:0`, quantity: 4 } })
  let productPreview = await routes.GET(request(`/api/admin/content/canonical-alias?kind=product&sourceId=${productSource.id}&targetId=${productTarget.id}`))
  let productSnapshot = await productPreview.json()
  assert.equal(productSnapshot.blockers.physicalLocationStock, 4, 'offline location units block aliasing even while Product.stock cache is zero')
  assert.equal(productSnapshot.canCanonicalize, false)
  await db.locationStock.deleteMany({ where: { productId: productSource.id } })

  const inactiveVariant = await db.productVariant.create({ data: { productId: productSource.id, sku: `${stamp}-inactive-variant`, name: 'Inactive stock variant', stock: 2, active: false } })
  productPreview = await routes.GET(request(`/api/admin/content/canonical-alias?kind=product&sourceId=${productSource.id}&targetId=${productTarget.id}`))
  productSnapshot = await productPreview.json()
  assert.equal(productSnapshot.blockers.stock, 2, 'inactive variant stock blocks aliasing')
  assert.equal(productSnapshot.canCanonicalize, false)
  await db.productVariant.update({ where: { id: inactiveVariant.id }, data: { stock: 0 } })

  const openOrder = await db.order.create({ data: { userId: user.id, productId: productSource.id, status: 'PAID', totalAmount: 1, totalMinor: 100n, currency: 'IRT' } })
  ids.orders.push(openOrder.id)
  productPreview = await routes.GET(request(`/api/admin/content/canonical-alias?kind=product&sourceId=${productSource.id}&targetId=${productTarget.id}`))
  productSnapshot = await productPreview.json()
  assert.equal(productSnapshot.blockers.pendingOrders, 1, 'paid order with no dispatch record blocks aliasing')
  assert.equal(productSnapshot.canCanonicalize, false)
  await db.order.delete({ where: { id: openOrder.id } })
  ids.orders = ids.orders.filter(id => id !== openOrder.id)

  assert((await aliases.canonicalAliasCandidates('product', productSource.id)).candidates.some(row => row.id === productTarget.id), 'product candidate name maps correctly from product.name')
  await reviewedAlias('product', productSource.id, productTarget.id, 'cms.products', productSource.slug, productTarget.slug)

  const releaseDate = new Date('2024-04-05T00:00:00.000Z')
  const gameSource = await db.gameTitle.create({ data: { slug: `${stamp}-game-source`, title: 'Alias game fixture', titleEn: 'Alias game fixture', releaseDate, status: 'PUBLISHED', publishedAt: new Date(), platforms: 'PC' } })
  ids.games.push(gameSource.id)
  const gameTarget = await db.gameTitle.create({ data: { slug: `${stamp}-game-target`, title: 'Alias game fixture', titleEn: 'Alias game fixture', releaseDate, status: 'PUBLISHED', publishedAt: new Date(), platforms: 'PC' } })
  ids.games.push(gameTarget.id)
  await reviewedAlias('game', gameSource.id, gameTarget.id, 'games.manage', gameSource.slug, gameTarget.slug)

  const softwareSource = await db.softwareTitle.create({ data: { slug: `${stamp}-software-source`, title: 'Alias software fixture', titleEn: 'Alias software fixture', version: '1.0', status: 'PUBLISHED', publishedAt: new Date(), platforms: 'Windows' } })
  ids.software.push(softwareSource.id)
  const softwareTarget = await db.softwareTitle.create({ data: { slug: `${stamp}-software-target`, title: 'Alias software fixture', titleEn: 'Alias software fixture', version: '1.0', status: 'PUBLISHED', publishedAt: new Date(), platforms: 'Windows' } })
  ids.software.push(softwareTarget.id)
  await reviewedAlias('software', softwareSource.id, softwareTarget.id, 'software.manage', softwareSource.slug, softwareTarget.slug, true)

  console.log('Canonical alias PostgreSQL passed: section permissions, typed Product/Cinema/Game/Software records, Product candidate discovery and inventory gate, explicit review, redirects, archived Cinema source relationship retention, stale undo refusal and current-version restore')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (ids.aliases.length) await db.contentCanonicalAlias.deleteMany({ where: { id: { in: ids.aliases } } })
  if (ids.purchases.length) await db.contentPurchase.deleteMany({ where: { id: { in: ids.purchases } } })
  if (ids.paidItems.length) await db.paidItem.deleteMany({ where: { id: { in: ids.paidItems } } })
  if (ids.links.length) await db.mediaLink.deleteMany({ where: { id: { in: ids.links } } })
  if (ids.orders.length) await db.order.deleteMany({ where: { id: { in: ids.orders } } })
  if (ids.products.length) await db.locationStock.deleteMany({ where: { productId: { in: ids.products } } })
  if (ids.seasons.length) await db.cinemaSeason.deleteMany({ where: { id: { in: ids.seasons } } })
  if (ids.titles.length) await db.cinemaTitle.deleteMany({ where: { id: { in: ids.titles } } })
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.software.length) await db.softwareTitle.deleteMany({ where: { id: { in: ids.software } } })
  if (ids.products.length) await db.product.deleteMany({ where: { id: { in: ids.products } } })
  if (ids.locations.length) await db.stockLocation.deleteMany({ where: { id: { in: ids.locations } } })
  if (ids.users.length) await db.auditLog.deleteMany({ where: { actorUserId: { in: ids.users } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  if (ids.roles.length) await db.role.deleteMany({ where: { id: { in: ids.roles } } })
  await db.$disconnect()
})
