// Real PostgreSQL: a search stops reading at MAX_SCANNED_MATCHES matches, newest published first, and says so;
// a narrower search is not capped; paging past page 50 still works inside the window; autocomplete is unchanged.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), stamp = 'scap' + Date.now() + process.pid, fresh = new Date().toISOString()
let batches = 0, artist
const db = new Proxy(prisma, { get(target, key) {
  if (key === 'setting') return { findUnique: async args => args.where.key === 'search.indexedAt' ? { key: 'search.indexedAt', value: fresh } : target.setting.findUnique(args), findMany: args => target.setting.findMany(args), upsert: async args => args.where.key === 'search.indexedAt' ? undefined : target.setting.upsert(args) }
  if (key === 'searchDocument') return new Proxy(target[key], { get(model, method) { if (method === 'findMany') return async (args) => { batches++; return model.findMany(args) }; return typeof model[method] === 'function' ? model[method].bind(model) : model[method] } })
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db }, '@/platform/observability/logger': { logEvent: () => {} }, '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, getModuleStates: async () => ({}) },
})
const search = load('src/modules/search/server/search.ts')
async function main() { try {
  const CAP = search.MAX_SCANNED_MATCHES, COUNT = CAP + 600
  assert.equal(CAP, 5000)
  artist = await prisma.musicArtist.create({ data: { slug: stamp, name: stamp } })
  const start = Date.now() - COUNT * 1000 - 10000
  // n = 0 is the oldest. Every track matches the stamp; every 50th also has a narrower word.
  await prisma.musicTrack.createMany({ data: Array.from({ length: COUNT }, (_, n) => ({ slug: `${stamp}-${n}`, title: `${stamp} ${n}${n % 50 === 0 ? ` ${stamp}narrow` : ''}`, artistId: artist.id, status: 'PUBLISHED', audioUrl: '/owned.mp3', publishedAt: new Date(start + n * 1000) })) })
  const tracks = await prisma.musicTrack.findMany({ where: { artistId: artist.id }, orderBy: { publishedAt: 'asc' } })
  // Index ids in the opposite order to publication, as a rebuild can leave them: the cap must follow dates, not ids.
  for (let at = 0; at < tracks.length; at += 1000) await prisma.searchDocument.createMany({ data: tracks.slice().reverse().slice(at, at + 1000).map((row) => ({ itemType: 'track', itemId: row.id, title: row.title, text: row.title.toLowerCase(), url: `/music/track/${row.slug}`, publishedAt: row.publishedAt })) })
  const newest = new Set(tracks.slice(-CAP).map((row) => row.id))

  batches = 0
  let result = await search.searchSite({ q: stamp, type: 'track', log: false })
  assert.equal(result.capped, true, 'a word in every track stops at the cap')
  assert.equal(result.total, CAP); assert.equal(result.counts.track, CAP)
  assert.ok(batches <= CAP / 500 + 1, `read ${batches} batches, not the whole index`)
  assert.ok(result.hits.every((hit) => newest.has(hit.id)), 'what it ranked is the newest part')
  const all = await search.searchSite({ q: stamp, log: false })
  assert.equal(all.capped, true); assert.equal(all.total, CAP)

  // Paging past the numbered 50 pages continues inside the same window without repeats.
  const fifty = await search.searchSite({ q: stamp, type: 'track', page: 50, log: false })
  assert.equal(fifty.page, 50); assert.ok(fifty.nextCursor)
  const next = await search.searchSite({ q: stamp, type: 'track', cursor: fifty.nextCursor, log: false })
  assert.equal(next.page, 51); assert.equal(next.hits.length, 20); assert.equal(next.capped, true)
  assert.equal(new Set([...fifty.hits, ...next.hits].map((hit) => hit.id)).size, 40)
  assert.ok(next.hits.every((hit) => newest.has(hit.id)))

  // A narrower word is read to the end: its total includes the oldest matches, beyond the newest ${CAP}.
  result = await search.searchSite({ q: `${stamp}narrow`, type: 'track', log: false })
  assert.equal(result.capped, false); assert.equal(result.total, Math.ceil(COUNT / 50))
  // Autocomplete keeps its own small sample.
  result = await search.searchSite({ q: stamp, log: false, suggestion: true })
  assert.equal(result.capped, false)
  console.log(`PostgreSQL search cap: ${COUNT} matches stop at ${CAP} newest-published (ids reversed), ${batches} batches, all/type capped, cursor past page 50 inside the window, narrower word uncapped, autocomplete unchanged passed`)
} finally {
  const ids = artist ? (await prisma.musicTrack.findMany({ where: { artistId: artist.id }, select: { id: true } })).map((row) => row.id) : []
  await prisma.searchDocument.deleteMany({ where: { itemType: 'track', itemId: { in: ids } } })
  await prisma.musicTrack.deleteMany({ where: { id: { in: ids } } })
  if (artist) await prisma.musicArtist.delete({ where: { id: artist.id } })
  await prisma.$disconnect()
} }
main().catch((error) => { console.error(error); process.exitCode = 1 })
