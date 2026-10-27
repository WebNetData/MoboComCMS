// Real PostgreSQL: one artist profile for the whole site (owner, 2026-10-27). A new person gets one entry whose music
// artist and cinema person carry the same name, picture and biography, with no English name needed (the music address
// is made from the person); an edit reaches both; a person the sync made in one section gains the other on save; an
// English name gives the music address, "-2" when taken; a person split apart from a namesake does not take the
// namesake's cinema record. Fixtures removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), cache = new Map(), memo = new Map(), stamp = `cbp${Date.now().toString(36)}`
const mocks = {
  '@/platform/database/prisma': { db }, react: { cache: (fn) => fn }, 'server-only': {},
  'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn) => fn },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => { if (!memo.has(key)) memo.set(key, await work()); return memo.get(key) }, invalidate: async () => { memo.clear() } },
}
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: db }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {}, MEDIA_RESOURCE_TYPE: {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}

async function main() {
  const hub = load('src/modules/celebrities/server/celebrities.ts'), people = load('src/modules/cinema/domain/people.ts')
  const actor = await db.user.findFirst({ where: { role: 'admin' }, select: { id: true, email: true } }) || { id: 1, email: 'owner@example.invalid' }
  const audit = async () => undefined
  const made = { entries: [], artists: [], people: [] }
  try {
    const name = `هنرمند ${stamp}`
    const keep = (entry) => { made.entries.push(entry.id); if (entry.musicArtistId) made.artists.push(entry.musicArtistId); if (entry.cinemaPersonId) made.people.push(entry.cinemaPersonId); return entry }
    const entry = keep(await hub.saveCelebrityProfile({ name, nameEn: '', image: '', bio: '<p>زندگی‌نامه <strong>پررنگ</strong></p>' }, actor, audit))
    assert.ok(entry.musicArtistId && entry.cinemaPersonId, 'a new person is in both sections at once')
    const [artist, person] = await Promise.all([db.musicArtist.findUnique({ where: { id: entry.musicArtistId } }), db.cinemaPerson.findUnique({ where: { id: entry.cinemaPersonId } })])
    assert.deepEqual([artist.name, person.name, artist.slug, entry.slug, person.imageLocked], [name, name, `artist-${entry.cinemaPersonId}`, `person-${entry.cinemaPersonId}`, true], 'no English name: the addresses come from the person')
    assert.ok(artist.bio.includes('<strong>پررنگ</strong>') && person.bio.includes('<strong>پررنگ</strong>'), 'the formatted biography reaches both')

    await hub.saveCelebrityProfile({ id: entry.id, name: `${name} نو`, nameEn: '', image: '', bio: 'تازه' }, actor, audit)
    const [artist2, person2] = await Promise.all([db.musicArtist.findUnique({ where: { id: entry.musicArtistId } }), db.cinemaPerson.findUnique({ where: { id: entry.cinemaPersonId } })])
    assert.deepEqual([artist2.name, person2.name], [`${name} نو`, `${name} نو`], 'an edit reaches both sections')

    // An actor the sync found in a film only: saving their profile gives them a music artist on the same entry.
    const actorName = `بازیگر ${stamp}`
    const found = await db.cinemaPerson.create({ data: { name: actorName, normalizedName: people.normalizePersonName(actorName) } }); made.people.push(found.id)
    const synced = keep(await db.celebrity.create({ data: { slug: `person-${found.id}`, name: actorName, normalizedName: people.normalizePersonName(actorName), cinemaPersonId: found.id } }))
    const singing = keep(await hub.saveCelebrityProfile({ id: synced.id, name: actorName, nameEn: `Actor ${stamp}`, image: '', bio: '' }, actor, audit))
    assert.deepEqual([singing.id, singing.cinemaPersonId, (await db.musicArtist.findUnique({ where: { id: singing.musicArtistId } })).slug], [synced.id, found.id, `actor-${stamp}`], 'the same entry now holds a music artist named from the English name')

    // The English name of a new person is taken already: the address gets "-2".
    const twin = keep(await hub.saveCelebrityProfile({ name: `همنام ${stamp}`, nameEn: `Actor ${stamp}`, image: '', bio: '' }, actor, audit))
    assert.equal((await db.musicArtist.findUnique({ where: { id: twin.musicArtistId } })).slug, `actor-${stamp}-2`, 'a taken music address gets a number')

    // A singer kept apart from an actor of the same name does not take the actor's cinema record.
    const shared = `همنام‌جدا ${stamp}`
    const actorApart = await db.cinemaPerson.create({ data: { name: shared, normalizedName: people.normalizePersonName(shared) } }); made.people.push(actorApart.id)
    keep(await db.celebrity.create({ data: { slug: `person-${actorApart.id}`, name: shared, normalizedName: people.normalizePersonName(shared), cinemaPersonId: actorApart.id, keepApart: true } }))
    const singerApart = await db.musicArtist.create({ data: { slug: `${stamp}-apart`, name: shared } }); made.artists.push(singerApart.id)
    const singerEntry = keep(await db.celebrity.create({ data: { slug: `${stamp}-apart`, name: shared, normalizedName: people.normalizePersonName(shared), musicArtistId: singerApart.id, keepApart: true } }))
    const saved = await hub.saveCelebrityProfile({ id: singerEntry.id, name: shared, nameEn: '', image: '', bio: '' }, actor, audit)
    assert.deepEqual([saved.musicArtistId, saved.cinemaPersonId], [singerApart.id, null], 'people split apart stay apart')

    await assert.rejects(hub.saveCelebrityProfile({ name: 'ن' }, actor, audit), (error) => error instanceof hub.CelebrityError, 'a name is needed')
    console.log('PASS celebrity profile: one profile for the site, no English name needed, edits reach both, a one-section person gains the other, taken address numbered, split people stay apart')
  } finally {
    await db.celebrity.deleteMany({ where: { OR: [{ id: { in: made.entries } }, { musicArtistId: { in: made.artists } }, { cinemaPersonId: { in: made.people } }] } })
    await db.contentRevision.deleteMany({ where: { entityType: 'music-artists', entityId: { in: made.artists } } }).catch(() => undefined)
    await db.musicArtist.deleteMany({ where: { id: { in: made.artists } } })
    await db.cinemaPerson.deleteMany({ where: { id: { in: made.people } } })
    await db.$disconnect()
  }
}
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
