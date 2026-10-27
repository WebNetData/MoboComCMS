// Real PostgreSQL: one artist profile for every section. A new person ticked in music and cinema gets one entry whose
// music artist and cinema person carry the same name, picture and biography; an edit reaches both; an actor who starts
// singing gets a music artist on the same entry; adding music without an English name is refused. Fixtures removed.
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
    const entry = await hub.saveCelebrityProfile({ name, nameEn: `Artist ${stamp}`, image: '', bio: 'زندگی‌نامه', music: true, cinema: true }, actor, audit)
    made.entries.push(entry.id); if (entry.musicArtistId) made.artists.push(entry.musicArtistId); if (entry.cinemaPersonId) made.people.push(entry.cinemaPersonId)
    assert.ok(entry.musicArtistId && entry.cinemaPersonId, 'a new person ticked in both sections is in both')
    const [artist, person] = await Promise.all([db.musicArtist.findUnique({ where: { id: entry.musicArtistId } }), db.cinemaPerson.findUnique({ where: { id: entry.cinemaPersonId } })])
    assert.deepEqual([artist.name, person.name, artist.bio.includes('زندگی‌نامه'), person.bio.includes('زندگی‌نامه'), person.imageLocked], [name, name, true, true, true], 'one profile in both sections')

    await hub.saveCelebrityProfile({ id: entry.id, name: `${name} نو`, nameEn: `Artist ${stamp}`, image: '', bio: 'تازه' }, actor, audit)
    const [artist2, person2] = await Promise.all([db.musicArtist.findUnique({ where: { id: entry.musicArtistId } }), db.cinemaPerson.findUnique({ where: { id: entry.cinemaPersonId } })])
    assert.deepEqual([artist2.name, person2.name], [`${name} نو`, `${name} نو`], 'an edit reaches both sections')

    // An actor (cinema only) who starts singing.
    const actorName = `بازیگر ${stamp}`
    const onlyCinema = await hub.saveCelebrityProfile({ name: actorName, nameEn: '', image: '', bio: '', cinema: true }, actor, audit)
    made.entries.push(onlyCinema.id); made.people.push(onlyCinema.cinemaPersonId)
    assert.equal(onlyCinema.musicArtistId, null)
    await assert.rejects(hub.saveCelebrityProfile({ id: onlyCinema.id, name: actorName, nameEn: '', image: '', bio: '', music: true }, actor, audit), (error) => error instanceof hub.CelebrityError, 'music needs an English name for the address')
    const singing = await hub.saveCelebrityProfile({ id: onlyCinema.id, name: actorName, nameEn: `Actor ${stamp}`, image: '', bio: '', music: true }, actor, audit)
    made.artists.push(singing.musicArtistId)
    assert.deepEqual([singing.id, !!singing.musicArtistId, singing.cinemaPersonId], [onlyCinema.id, true, onlyCinema.cinemaPersonId], 'the same entry now holds a music artist too')
    await assert.rejects(hub.saveCelebrityProfile({ name: 'ن', music: false, cinema: false }, actor, audit), (error) => error instanceof hub.CelebrityError, 'a name and a section are needed')
    console.log('PASS celebrity profile: one profile in both sections, edits reach both, an actor gains a music artist, English name required for music')
  } finally {
    await db.celebrity.deleteMany({ where: { OR: [{ id: { in: made.entries } }, { musicArtistId: { in: made.artists } }, { cinemaPersonId: { in: made.people } }] } })
    await db.contentRevision.deleteMany({ where: { entityType: 'music-artists', entityId: { in: made.artists } } }).catch(() => undefined)
    await db.musicArtist.deleteMany({ where: { id: { in: made.artists } } })
    await db.cinemaPerson.deleteMany({ where: { id: { in: made.people } } })
    await db.$disconnect()
  }
}
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
