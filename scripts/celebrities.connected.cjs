// Real PostgreSQL: «چهره‌ها» entries from cinema people and music artists. An actor and a singer with the same name
// become one entry; another name its own; a split keeps them apart through later syncs; a join makes one entry of
// two spellings; the directory lists only people with a published work and filters by role. Fixtures removed after.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), cache = new Map(), stamp = `cb${Date.now().toString(36)}`
const mocks = { '@/platform/database/prisma': { db } }
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', source)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts')) }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  const hub = load('src/modules/celebrities/server/celebrities.ts'), people = load('src/modules/cinema/domain/people.ts')
  const made = { people: [], artists: [], titles: [], tracks: [] }
  const now = new Date(Date.now() - 60_000)
  try {
    const name = `ستاره ${stamp}`, other = `دیگری ${stamp}`
    const person = await db.cinemaPerson.create({ data: { name, normalizedName: people.normalizePersonName(name) } }); made.people.push(person.id)
    const loner = await db.cinemaPerson.create({ data: { name: other, normalizedName: people.normalizePersonName(other) } }); made.people.push(loner.id)
    const artist = await db.musicArtist.create({ data: { slug: `${stamp}-singer`, name: `ستاره  ${stamp}` } }); made.artists.push(artist.id)
    const title = await db.cinemaTitle.create({ data: { slug: `${stamp}-film`, title: `فیلم ${stamp}`, status: 'PUBLISHED', publishedAt: now } }); made.titles.push(title.id)
    await db.cinemaCredit.create({ data: { titleId: title.id, personId: person.id, role: 'CAST' } })
    const track = await db.musicTrack.create({ data: { slug: `${stamp}-song`, title: `آهنگ ${stamp}`, artistId: artist.id, status: 'PUBLISHED', publishedAt: now } }); made.tracks.push(track.id)

    await hub.syncCelebrities()
    const entry = await db.celebrity.findUnique({ where: { cinemaPersonId: person.id } })
    assert.equal(entry.musicArtistId, artist.id, 'the actor and the singer with the same name (spaces aside) are one entry')
    const alone = await db.celebrity.findUnique({ where: { cinemaPersonId: loner.id } })
    assert.ok(alone && alone.id !== entry.id && !alone.musicArtistId, 'another name has its own entry')

    const listed = async (role) => (await hub.celebrityDirectory({ q: stamp, role, creditRole: '', page: 1 }, {})).people.map((card) => card.slug)
    assert.deepEqual(await listed(null), [entry.slug], 'only people with a published work are listed (the loner has none)')
    assert.deepEqual(await listed('singer'), [entry.slug])
    assert.deepEqual(await listed('director'), [], 'a role they do not have filters them out')
    const card = (await hub.celebrityDirectory({ q: stamp, role: null, creditRole: '', page: 1 }, {})).people[0]
    assert.deepEqual([card.roles, card.titles, card.songs], [['بازیگر', 'خواننده'], 1, 1], 'roles and works of both sections')

    const split = await hub.splitCelebrity(entry.id)
    await hub.syncCelebrities()
    // The entry began on the cinema side (its address is the person's), so the actor keeps it and the singer moves out.
    assert.deepEqual([(await db.celebrity.findUnique({ where: { id: entry.id } })).musicArtistId, split.musicArtistId], [null, artist.id], 'split: the side the address came from keeps the entry')
    assert.equal((await db.celebrity.findUnique({ where: { musicArtistId: artist.id } })).id, split.id, 'and a sync does not join them again')

    await hub.joinCelebrities(entry.id, split.id)
    const joined = await db.celebrity.findUnique({ where: { id: entry.id } })
    assert.deepEqual([joined.cinemaPersonId, joined.musicArtistId, joined.keepApart], [person.id, artist.id, false], 'join: one entry again')
    assert.equal(await db.celebrity.count({ where: { id: split.id } }), 0)
    await assert.rejects(hub.joinCelebrities(entry.id, alone.id), (error) => error instanceof hub.CelebrityError, 'two cinema people are merged in cinema, not here')
    console.log('PASS celebrities: same name joins, other name apart, public-only directory with roles, split holds through sync, join merges')
  } finally {
    await db.celebrity.deleteMany({ where: { OR: [{ cinemaPersonId: { in: made.people } }, { musicArtistId: { in: made.artists } }] } })
    await db.musicTrack.deleteMany({ where: { id: { in: made.tracks } } })
    await db.cinemaTitle.deleteMany({ where: { id: { in: made.titles } } })
    await db.cinemaPerson.deleteMany({ where: { id: { in: made.people } } })
    await db.musicArtist.deleteMany({ where: { id: { in: made.artists } } })
    await db.$disconnect()
  }
}
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
