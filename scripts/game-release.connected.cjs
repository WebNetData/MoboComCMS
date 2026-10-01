// Local PostgreSQL + port 3000 check: node --env-file=.env scripts/game-release.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const slug = `codex-release-${Date.now()}`
let gameId = 0, linkId = 0

async function get(path) {
  return fetch(`http://127.0.0.1:3000${path}`, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(45_000) })
}
// Next dev embeds server query traces in scripts; assert the rendered page content.
const rendered = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')

async function main() {
  const yesterday = new Date(Date.now() - 86_400_000)
  const tomorrow = new Date(Date.now() + 86_400_000)
  const game = await db.gameTitle.create({ data: { slug, title: 'Codex release gate', version: 'codex9.9-test', publishedAt: yesterday } })
  gameId = game.id
  const update = await db.gameUpdate.create({ data: { gameId, title: 'Future Codex DLC', version: 'codex9.9-test', releasedAt: tomorrow } })
  const link = await db.mediaLink.create({ data: { ownerType: 'gameupdate', ownerId: update.id, label: 'Future file', url: 'https://example.invalid/future.zip' } })
  linkId = link.id
  assert.ok(await db.gameUpdate.findFirst({ where: { gameId, version: 'codex9.9-test', kind: { not: 'DLC' }, releasedAt: { gt: new Date() } } }))

  const futurePage = await get(`/games/${slug}`)
  assert.equal(futurePage.status, 200)
  const futureHtml = rendered(await futurePage.text())
  assert.ok(!futureHtml.includes('Future Codex DLC'), 'future update stays off the public timeline')
  assert.ok(!futureHtml.includes('codex9.9-test'), 'a stored future version stays off the rendered game detail')
  assert.equal((await get(`/api/media/link/${linkId}`)).status, 404, 'direct file access is closed before release')

  await db.gameUpdate.update({ where: { id: update.id }, data: { releasedAt: yesterday } })
  await db.gameTitle.update({ where: { id: gameId }, data: { version: 'base-old-version' } })
  const livePage = await get(`/games/${slug}`)
  assert.equal(livePage.status, 200)
  const liveHtml = rendered(await livePage.text())
  assert.ok(liveHtml.includes('Future Codex DLC'), 'due update appears without a deploy')
  assert.ok(liveHtml.includes('codex9.9-test'), 'due version appears on the game detail')
  const staleVersionAt = liveHtml.indexOf('base-old-version')
  assert.equal(staleVersionAt, -1, `stale version shown: ${liveHtml.slice(Math.max(0, staleVersionAt - 180), staleVersionAt + 180)}`)
  assert.notEqual((await get(`/api/media/link/${linkId}`)).status, 404, 'due file passes the publication gate')

  await db.gameTitle.update({ where: { id: gameId }, data: { publishedAt: tomorrow } })
  assert.equal((await get(`/api/media/link/${linkId}`)).status, 404, 'scheduled parent game closes the direct file link')
  console.log('Game release PostgreSQL/API: future timeline, version and direct link gated; due release visible; parent publication enforced')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (linkId) await db.mediaLink.deleteMany({ where: { id: linkId } })
  if (gameId) await db.gameTitle.deleteMany({ where: { id: gameId } })
  await db.$disconnect()
})
