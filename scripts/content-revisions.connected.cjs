// Real PostgreSQL films and their versions through the admin save path, the version service and the restore.
// Only this script's films and their versions are created and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `crev${Date.now()}`
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/content/server/events') return { contentChanged: (ref) => { announced.push(`${ref.type}:${ref.id}`) }, MEDIA_RESOURCE_TYPE: { 'cinema-titles': 'title' } }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const announced = []
const media = load('src/modules/media/server/admin.ts'), revisions = load('src/modules/content/server/revisions.ts'), rules = load('src/modules/content/domain/revisions.ts')
const T = 'cinema-titles', editor = { id: 1, email: `${seed}@example.invalid` }
const versions = async id => (await revisions.listRevisions(T, id)).map(row => [row.version, row.source, row.changed.join(','), row.by]).reverse()
const refused = async (promise, status) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }

async function main() {
  // ---- what a version holds: the item's own columns, nothing secret, no counters
  assert.deepEqual(rules.snapshotOf({ id: 7, title: 't', views: 9, updatedAt: new Date(), publishedAt: new Date('2026-01-02T03:04:05Z'), priceMinor: 12n, featured: true, summary: null, passwordHash: 'x', apiKey: 'y', seasons: [{ n: 1 }], author: { id: 1 } }),
    { title: 't', publishedAt: '2026-01-02T03:04:05.000Z', priceMinor: '12', featured: true, summary: null })

  // ---- a new item: its first version; an edit: the next, naming what changed; a save that changes no column: nothing
  const { row: film } = await media.saveMediaItem(T, { title: `${seed} first`, slug: `${seed}-film`, kind: 'MOVIE', summary: 'as it was', year: 2001 }, null, editor)
  await media.saveMediaItem(T, { title: `${seed} second`, year: 2002 }, film.id, editor)
  await media.saveMediaItem(T, { links: [{ url: 'https://dl.example.invalid/a.mp4' }] }, film.id, editor)
  await media.saveMediaItem(T, { summary: 'from a file' }, film.id)
  assert.deepEqual(await versions(film.id), [[1, 'edit', '', editor.email], [2, 'edit', 'title,year', editor.email], [3, 'import', 'summary', '']], 'links have their own table and make no version; an import is named as one')
  assert.deepEqual((await revisions.revisionDetail(T, film.id, 2)).diff, [{ field: 'title', before: `${seed} first`, after: `${seed} second` }, { field: 'year', before: '2001', after: '2002' }])
  await refused(revisions.revisionDetail(T, film.id, 99), 404)

  // ---- an item older than versions: the first edit keeps what it was, then what it became
  const old = await prisma.cinemaTitle.create({ data: { slug: `${seed}-old`, title: `${seed} old`, kind: 'MOVIE', summary: 'before versions existed' } })
  await media.saveMediaItem(T, { summary: 'edited' }, old.id, editor)
  assert.deepEqual(await versions(old.id), [[1, 'baseline', '', ''], [2, 'edit', 'summary', editor.email]])
  assert.equal((await revisions.revisionSnapshot(T, old.id, 1)).summary, 'before versions existed')

  // ---- putting a version back: the item's own columns, in their own kinds of value; counters and links stay
  await prisma.cinemaTitle.update({ where: { id: film.id }, data: { views: 99 } })
  announced.length = 0
  const snapshot = await revisions.revisionSnapshot(T, film.id, 1)
  const { before, after } = await media.restoreMediaItem(T, film.id, current => rules.restoreValues(snapshot, current))
  await revisions.recordRevision({ entityType: T, entityId: film.id, before, after, actor: editor, source: 'restore' })
  const back = await prisma.cinemaTitle.findUniqueOrThrow({ where: { id: film.id } })
  assert.deepEqual([back.title, back.year, back.summary, back.views, back.publishedAt instanceof Date, back.publishedAt.toISOString() === snapshot.publishedAt, await prisma.mediaLink.count({ where: { ownerType: 'title', ownerId: film.id } }), announced], [`${seed} first`, 2001, 'as it was', 99, true, true, 1, [`title:${film.id}`]], 'search and feeds are told, as after any edit')
  assert.deepEqual((await versions(film.id)).at(-1), [4, 'restore', 'summary,title,year', editor.email], 'a restore is itself a version: it can be undone')

  assert.deepEqual((await revisions.revisionDetail(T, film.id, 4)).diff.map(row => [row.field, row.before, row.after]), [['summary', 'from a file', 'as it was'], ['title', `${seed} second`, `${seed} first`], ['year', '2002', '2001']], 'what a version changed is told against the version just before it')

  // ---- a version whose address now belongs to another item is not put back
  await media.saveMediaItem(T, { slug: `${seed}-moved` }, film.id, editor)
  const taker = await prisma.cinemaTitle.create({ data: { slug: `${seed}-film`, title: `${seed} taker`, kind: 'MOVIE' } })
  const error = await media.restoreMediaItem(T, film.id, current => rules.restoreValues(snapshot, current)).then(() => null, caught => caught)
  assert.deepEqual([error?.code, (await prisma.cinemaTitle.findUniqueOrThrow({ where: { id: film.id } })).slug], ['P2002', `${seed}-moved`], 'refused, and nothing changed')
  // A column the item no longer has, and one it gained, do not break a restore.
  assert.deepEqual(rules.restoreValues({ title: 'x', dropped: 'gone', publishedAt: '2026-01-02T03:04:05.000Z', priceMinor: '5', id: 1, views: 3 }, { title: 'y', added: 'new', publishedAt: new Date(), priceMinor: 9n, views: 50, id: 2 }), { title: 'x', publishedAt: new Date('2026-01-02T03:04:05.000Z'), priceMinor: 5n })

  // ---- only the latest versions are kept
  for (let n = 0; n < rules.KEEP_REVISIONS + 6; n++) await revisions.recordRevision({ entityType: T, entityId: taker.id, before: null, after: { title: `t${n}` }, actor: editor })
  const kept = await prisma.contentRevision.findMany({ where: { entityType: T, entityId: taker.id }, orderBy: { version: 'asc' }, select: { version: true } })
  assert.deepEqual([kept.length, kept[0].version, kept.at(-1).version], [rules.KEEP_REVISIONS, 7, rules.KEEP_REVISIONS + 6])
  assert.equal(await revisions.recordRevision({ entityType: T, entityId: taker.id, before: null, after: { title: `t${rules.KEEP_REVISIONS + 5}` }, actor: editor }), null, 'saving the same again adds nothing')
  await revisions.dropRevisions(T, taker.id)
  assert.equal(await prisma.contentRevision.count({ where: { entityType: T, entityId: taker.id } }), 0)
  console.log('PostgreSQL content versions: a version per save that changes a column, a baseline for older items, what changed, restore of the item\'s own columns as a new version, a taken address refused, and the keeping limit passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.contentRevision.deleteMany({ where: { entityType: T, entityId: { in: ids } } }); await prisma.mediaLink.deleteMany({ where: { ownerType: 'title', ownerId: { in: ids } } })
    await prisma.cinemaTitle.deleteMany({ where: { id: { in: ids } } }); await prisma.cinemaPerson.deleteMany({ where: { normalizedName: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
