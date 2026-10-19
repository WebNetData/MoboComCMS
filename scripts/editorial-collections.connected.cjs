// Real PostgreSQL collections, members and songs through the collections service: the lists members keep,
// and the collections staff write for the site. Only this script's rows are created and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `edcol${Date.now()}`
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
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const c = load('src/modules/content/server/collections.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }
const mine = rows => rows.filter(row => row.title.startsWith(seed))

async function main() {
  const user = name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })
  const editor = await user('editor'), colleague = await user('colleague'), member = await user('member'), reader = await user('reader')
  const artist = await prisma.musicArtist.create({ data: { slug: seed, name: `${seed} artist` } })
  const song = (name, data = {}) => prisma.musicTrack.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, artistId: artist.id, audioUrl: '/test.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), ...data } })
  const first = await song('first'), second = await song('second'), draft = await song('draft', { status: 'DRAFT' })
  const key = row => `track:${row.id}`
  const state = async id => { const row = await prisma.userCollection.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { position: 'asc' } } } }); return [row.visibility, row.staffAuthored, row.items.map(item => item.itemId)] }

  // ---- a member's own list, public: staff may select it, never change it
  const { id: memberList } = await c.createCollection(member.id, { title: `${seed} member list`, visibility: 'PUBLIC' })
  await c.addCollectionItem(member.id, memberList, key(first))
  const { id: memberPrivate } = await c.createCollection(member.id, { title: `${seed} member private` })

  // ---- staff write a collection for the site: a draft nobody else sees
  const { id } = await c.createEditorialCollection(editor.id, { title: `${seed} best of`, description: 'picked by the site' })
  assert.deepEqual(await state(id), ['PRIVATE', true, []])
  await refused(c.getCollection(id, null), 404, 'a visitor opening a draft')
  await refused(c.getCollection(id, editor.id), 404, 'the staff member opening it as a member, outside the admin panel')
  assert.deepEqual([(await c.getCollection(id, null, undefined, true)).title, mine(await c.myCollections(editor.id)).length, mine((await c.publicCollections(1)).items).map(row => row.title)], [`${seed} best of`, 0, [`${seed} member list`]], 'staff see the draft; it is not among the writer\'s own lists nor public')
  await refused(c.createEditorialCollection(editor.id, { title: '   ' }), 400, 'no title')

  // ---- what it holds: published items only, each once, in the order staff give
  await refused(c.addEditorialItem(id, key(draft)), 404, 'an item the public cannot open')
  assert.deepEqual([await c.addEditorialItem(id, key(first)), await c.addEditorialItem(id, key(second)), await c.addEditorialItem(id, key(first))], [{ added: true }, { added: true }, { added: false }])
  assert.deepEqual([await c.moveEditorialItem(id, key(second), 'up'), (await state(id))[2]], [{ moved: true }, [second.id, first.id]])
  await c.updateEditorialCollection(id, { title: `${seed} best songs`, cover: '/api/media/covers/x.webp' })
  await refused(c.updateEditorialCollection(id, { cover: 'javascript:alert(1)' }), 400, 'a cover that is not an address')

  // ---- the two kinds do not mix: the member paths do not reach a staff collection, the staff paths do not reach a member's list
  await refused(c.updateCollection(editor.id, id, { visibility: 'PUBLIC' }), 404, 'the writer making it an ordinary public list')
  await refused(c.deleteCollection(editor.id, id), 404, 'the writer deleting it as a member')
  await refused(c.addCollectionItem(editor.id, id, key(first)), 404, 'the writer adding through the member path')
  await refused(c.addEditorialItem(memberList, key(second)), 404, 'staff adding to a member\'s list')
  await refused(c.removeEditorialItem(memberList, key(first)), 404, 'staff removing from a member\'s list')
  await refused(c.updateEditorialCollection(memberList, { title: 'renamed by staff' }), 404, 'staff renaming a member\'s list')
  await refused(c.publishEditorialCollection(memberList, true), 404, 'staff publishing a member\'s list as the site\'s')
  await refused(c.deleteEditorialCollection(memberList), 404, 'staff deleting a member\'s list')
  await refused(c.deleteEditorialCollection(memberPrivate), 404, 'staff deleting a member\'s private list')
  assert.deepEqual(await state(memberList), ['PUBLIC', false, [first.id]])

  // ---- publishing: signed by the site, open to all, changed by nobody from the public side
  const { id: empty } = await c.createEditorialCollection(colleague.id, { title: `${seed} empty` })
  await refused(c.publishEditorialCollection(empty, true), 400, 'publishing a collection with nothing in it')
  assert.deepEqual(await c.publishEditorialCollection(id, true), { published: true })
  const open = await c.getCollection(id, editor.id)
  assert.deepEqual([open.visibility, open.ownerName, open.canEdit, open.items.map(item => item.card.title), (await c.collectionPublicMetadata(id)).title], ['EDITORIAL', 'تحریریه', false, [`${seed} second`, `${seed} first`], `${seed} best songs`], 'the writer\'s name is not shown and the public page offers them no editing')
  assert.deepEqual(mine((await c.publicCollections(1)).items).map(row => [row.title, row.owner.name]), [[`${seed} best songs`, 'تحریریه'], [`${seed} member list`, `${seed} member`]], 'the site\'s collections come first, under the site\'s byline')
  assert.deepEqual(await c.addEditorialItem(id, key(first)), { added: false }, 'a colleague goes on editing a published collection')
  await refused(c.featureCollection(id, false), 404, 'releasing it like a member\'s list, which would make it an ordinary public one')
  assert.deepEqual([await c.featureCollection(memberList, true), (await state(memberList))[0], await c.featureCollection(memberList, false), (await state(memberList))[0]], [{ editorial: true }, 'EDITORIAL', { editorial: false }, 'PUBLIC'], 'selecting a member\'s list works as before')

  // ---- taking it back to a draft keeps who followed, saved and liked it
  await c.followCollection(reader.id, id, true); await c.saveCollection(reader.id, id, true); await c.reactCollection(reader.id, id, true)
  assert.deepEqual(await c.publishEditorialCollection(id, false), { published: false })
  await refused(c.getCollection(id, reader.id), 404, 'a follower opening the draft')
  await refused(c.followCollection(member.id, id, true), 404, 'following a draft')
  assert.equal(mine((await c.savedCollections(reader.id)).map(row => row.collection)).length, 0, 'not among the reader\'s saved lists while it is a draft')
  await c.publishEditorialCollection(id, true)
  const again = await c.getCollection(id, reader.id)
  assert.deepEqual([again.followerCount, again.reactionCount, await c.collectionIsSaved(reader.id, id), mine((await c.savedCollections(reader.id)).map(row => row.collection)).length], [1, 1, true, 1])
  await refused(c.publishEditorialCollection(id, true), 404, 'publishing what is published')

  // ---- every item unpublished since: it cannot be published as an empty page
  await c.publishEditorialCollection(id, false)
  await prisma.musicTrack.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { status: 'DRAFT' } })
  await refused(c.publishEditorialCollection(id, true), 400, 'publishing when nothing in it is public any more')
  await prisma.musicTrack.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { status: 'PUBLISHED' } })

  // ---- the admin list and removal
  const listed = []
  for (let page = 1; page <= 20; page++) { const result = await c.adminCollections(page); listed.push(...mine(result.items)); if (page >= result.pages) break }
  assert.deepEqual(listed.map(row => [row.title, row.staffAuthored, row.visibility]).sort(), [[`${seed} best songs`, true, 'PRIVATE'], [`${seed} empty`, true, 'PRIVATE'], [`${seed} member list`, false, 'PUBLIC']], 'drafts and published collections of the site, and members\' public lists; never a member\'s private list')
  assert.deepEqual(await c.deleteEditorialCollection(empty), { deleted: true })
  await refused(c.getCollection(empty, null, undefined, true), 404, 'a deleted collection')
  console.log('PostgreSQL editorial collections: staff drafts, items and order, the member and staff paths kept apart, publishing under the site\'s byline, withdrawal that keeps followers, and the admin list passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const users = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.userCollection.deleteMany({ where: { ownerId: { in: users } } })
    await prisma.musicTrack.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.musicArtist.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  } finally { await prisma.$disconnect() }
})
