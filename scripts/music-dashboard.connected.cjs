// Local Docker-only namespaced fixtures; pass a preceding clean-source admin.ts as argv[2].
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const db = new PrismaClient(), seed = `ms${Date.now().toString(36)}`, ids = { tracks: [], artists: [], albums: [], users: [] }
function load(source, mocks) {
  const mod = { exports: {} }, code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => mocks[name] || load(fs.readFileSync(path.join(__dirname, '..', `src/${name.slice(2)}.ts`), 'utf8'), mocks), mod, mod.exports)
  return mod.exports
}
async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } }); ids.users.push(user.id)
  const artist = await db.musicArtist.create({ data: { slug: seed, name: seed } }); ids.artists.push(artist.id)
  const album = await db.musicAlbum.create({ data: { slug: seed, title: seed, artistId: artist.id, cover: '/fixture.jpg', status: 'PUBLISHED' } }); ids.albums.push(album.id)
  await db.musicTrack.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ slug: `${seed}-${i}`, title: `${seed}-${i}`, artistId: artist.id, albumId: album.id, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86400000), plays: i + 1, downloads: i, audioUrl: 'fixture-only', audioHqUrl: i ? 'fixture-only' : '', duration: i ? 100 : 0, genre: 'Pop', lyrics: 'Fixture' })) })
  const rows = await db.musicTrack.findMany({ where: { slug: { startsWith: `${seed}-` } }, select: { id: true } }); ids.tracks.push(...rows.map(row => row.id))
  await db.downloadLog.createMany({ data: rows.map(row => ({ ownerType: 'track', ownerId: row.id, visitor: seed })) })
  const mocks = { '@/platform/database/prisma': { db }, '@/modules/settings/server': {} }
  const old = load(fs.readFileSync(process.argv[2] || '/tmp/mobocom-music-discovery/src/modules/music/server/admin.ts', 'utf8'), mocks)
  const current = load(fs.readFileSync(path.join(__dirname, '../src/modules/music/server/admin.ts'), 'utf8'), mocks)
  const now = new Date(), before = await old.musicDashboard(now), after = await current.musicDashboard(now)
  // Previous code had unspecified tie ordering; compare values/order with explicit ID tie breaks.
  for (const key of ['kpis', 'series', 'health']) assert.deepEqual(after[key], before[key], key)
  assert.equal(after.topArtists.find(row => row.id === artist.id)?.plays, 125751)
  assert.equal(after.topPlayed.length, 8); assert.equal(after.topDownloaded.length, 8)
  assert.ok(after.topPlayed.every((row, index, all) => !index || all[index - 1].plays >= row.plays))
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const response = await fetch('http://localhost:3000/api/admin/music/dashboard', { headers: { cookie: `next-auth.session-token=${token}` }, signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200)
  const http = await response.json(); assert.equal(http.kpis.tracks, after.kpis.tracks); assert.equal(http.kpis.downloads30, after.kpis.downloads30)
  assert.ok(http.topArtists.some(row => row.id === artist.id && row.plays === 125751))
  assert.equal((await fetch('http://localhost:3000/api/admin/music/dashboard')).status, 403)
  console.log('Music dashboard PostgreSQL baseline totals/Tehran series/health and authenticated API checks passed with 501 tracks/downloads.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  // Select namespaced IDs again so cleanup also works after a partial create/read failure.
  const fixtureTracks = await db.musicTrack.findMany({ where: { slug: { startsWith: `${seed}-` } }, select: { id: true } })
  await db.downloadLog.deleteMany({ where: { visitor: seed } })
  await db.musicTrack.deleteMany({ where: { id: { in: fixtureTracks.map(row => row.id) } } })
  await db.musicAlbum.deleteMany({ where: { id: { in: ids.albums } } })
  await db.musicArtist.deleteMany({ where: { id: { in: ids.artists } } })
  await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
