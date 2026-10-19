const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = 'moduleblocks' + Date.now() + process.pid, owned = [], events = [], reads = {}
const states = Object.fromEntries(['block-editor', 'journal', 'store', 'cinema', 'music', 'games', 'software', 'forum'].map(name => [name, true])), closed = new Set()
let actor, viewer, fault = ''
function wrap(client) { return new Proxy(client, { get(target, key) {
  if (key === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
  if (target[key] && typeof target[key] === 'object') return new Proxy(target[key], { get(model, method) {
    if (typeof model[method] !== 'function') return model[method]
    return args => {
      if (method === 'findMany') reads[key] = (reads[key] || 0) + 1
      if (fault === key && method === 'create') throw Error('injected ' + key)
      if (key === 'setting' && args?.where?.key === 'storeEnabled') args = { ...args, where: { ...args.where, key: stamp + ':storeEnabled' } }
      return model[method](args)
    }
  } })
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} }) }
const db = wrap(prisma), permission = (user, needed) => user && (user.role === 'ADMIN' && user.roleId == null || user.permissions?.includes(needed))
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db }, '@/platform/cache/kv': { cached: async (_key, _ttl, work) => work(), invalidate: async () => {} },
  '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp }, react: { ...require('react'), cache: fn => fn },
  '@/modules/content/server/events': { contentChanged: (...args) => events.push(args) },
  '@/modules/site/server/maintenance': { closedSectionPlugins: async () => closed },
  '@/modules/identity/server/access': {
    requireContentScope: async (_req, manager, author) => permission(viewer, manager) ? { admin: viewer, authorId: null } : author && permission(viewer, author) ? { admin: viewer, authorId: viewer.id } : null,
    requirePerm: async (_req, needed) => permission(viewer, needed) ? viewer : null,
  },
  '@/modules/identity/server/admin-guard': { adminGuard: async (_req, module, perms) => states[module] === false || !perms.some(needed => permission(viewer, needed)) ? { response: new Response('', { status: 403 }) } : { admin: viewer } },
  '@/extensions/server/modules': { isModuleEnabled: async name => states[name] === true, getModuleStates: async () => states, getModuleSettings: async () => ({}) },
})
const editor = load('src/modules/editor/server/documents.ts'), api = load('src/modules/editor/server/http/documents.ts'), history = load('src/modules/content/server/http/history.ts')
const { defaultProps } = load('src/modules/editor/domain/fields.ts'), { escapeHtml } = load('src/modules/editor/domain/rich-text.ts')
const { blockDescriptors, registryFromDescriptors } = load('src/modules/editor/domain/descriptors.ts'), adapter = load('src/modules/editor/adapters/gutenberg/convert.ts')
const { publicDocumentHtml } = load('src/modules/editor/server/blocks/render.ts')
let next = 0
const block = (type, props = {}) => { const definition = editor.editorRegistry().get(type); return { id: 'blk_module_' + ++next, type, version: definition?.version || 1, props: { ...(definition ? defaultProps(definition.fields) : {}), ...props } } }
const doc = (...blocks) => ({ version: 1, blocks })
const ctx = (entity, id) => ({ params: Promise.resolve({ entity, id: String(id) }) })
const req = (body, method = 'POST', origin = 'http://localhost:3000') => new NextRequest('http://localhost:3000/api/admin/editor/pages/0/preview', { method, headers: { host: 'localhost:3000', origin, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
async function own(model, data) { const row = await prisma[model].create({ data: model === 'post' ? { content: '', ...data } : data }); owned.push({ model, id: row.id }); return row }
async function main() { try {
  actor = await own('user', { email: stamp + '@example.invalid', role: 'ADMIN', passwordHash: 'unused' }); viewer = { ...actor, permissions: null }
  await prisma.setting.create({ data: { key: stamp + ':storeEnabled', value: 'true' } })
  const page = await own('page', { slug: stamp, title: 'Module document', content: '<p>Legacy</p>' }), post = await own('post', { slug: stamp, title: stamp + ' post', authorId: actor.id, excerpt: 'Public excerpt', publishedAt: new Date(Date.now() - 1000) })
  const title = await own('cinemaTitle', { slug: stamp, title: stamp + ' cinema', kind: 'MOVIE', publishedAt: new Date(Date.now() - 1000) })
  const artist = await own('musicArtist', { slug: stamp, name: stamp + ' artist' }), album = await own('musicAlbum', { slug: stamp, title: stamp + ' album', artistId: artist.id, publishedAt: new Date(Date.now() - 1000) })
  const track = await own('musicTrack', { slug: stamp, title: stamp + ' track', artistId: artist.id, albumId: album.id, publishedAt: new Date(Date.now() - 1000) })
  const game = await own('gameTitle', { slug: stamp, title: stamp + ' game', publishedAt: new Date(Date.now() - 1000) }), software = await own('softwareTitle', { slug: stamp, title: stamp + ' software', publishedAt: new Date(Date.now() - 1000) })
  const product = await own('product', { slug: stamp, name: stamp + ' product', active: true, approval: 'APPROVED' })
  const person = await own('cinemaPerson', { name: stamp + ' person', normalizedName: stamp }), credit = await own('cinemaCredit', { personId: person.id, titleId: title.id, role: 'CAST' })
  const category = await own('forumCategory', { slug: stamp, title: 'Public fixture' }), privateCategory = await own('forumCategory', { slug: stamp + '-private', title: 'Members fixture', access: 'MEMBERS' })
  const thread = await own('forumThread', { categoryId: category.id, userId: actor.id, title: stamp + ' thread' })
  const hiddenThread = await own('forumThread', { categoryId: privateCategory.id, userId: actor.id, title: stamp + ' PRIVATE_THREAD' })
  const unlisted = await own('forumThread', { categoryId: category.id, userId: actor.id, title: stamp + ' UNLISTED_THREAD', listed: false })
  const draft = await own('cinemaTitle', { slug: stamp + '-draft', title: 'PRIVATE_DRAFT', kind: 'MOVIE', status: 'DRAFT' })
  const future = await own('cinemaTitle', { slug: stamp + '-future', title: 'PRIVATE_FUTURE', kind: 'MOVIE', publishedAt: new Date(Date.now() + 86400000) })
  const memberPost = await own('post', { slug: stamp + '-member', title: 'Member metadata', access: 'MEMBERS', content: 'PRIVATE_MEMBER_BODY', publishedAt: new Date(Date.now() - 1000) })
  const pairs = [['store.productGrid', product], ['journal.latestPosts', post], ['cinema.titleGrid', title], ['cinema.peopleGrid', person], ['music.trackGrid', track], ['music.albumGrid', album], ['music.artistGrid', artist], ['games.gameGrid', game], ['software.softwareGrid', software], ['forum.topicGrid', thread]]
  const modules = pairs.map(([type, row]) => block(type, { source: 'selected', items: [{ id: row.id }] }))
  const storedDocument = doc(block('layout.section', { space: 'sm' }), ...modules, block('future.unknown', { raw: '<script>PRIVATE_UNKNOWN</script>' }))
  // A module definition and trusted renderer both reach the browser and public composition.
  editor.registerModuleBlocks([{ type: 'journal.fixtureNote', owner: 'journal', kind: 'static', category: 'journal', version: 1, label: { fa: 'Fixture', en: 'Fixture' }, icon: 'note', fields: { text: { kind: 'string', max: 100 } } }], { 'journal.fixtureNote': item => `<aside>${escapeHtml(String(item.props.text))}</aside>` })
  storedDocument.blocks.push(block('journal.fixtureNote', { text: '<b>escaped custom</b>' }))
  let response = await api.GET(req({}, 'GET'), ctx('pages', page.id)), loaded = await response.json()
  assert.equal(response.status, 200); assert.equal(loaded.blockDefinitions.filter(definition => definition.dataSource).length, 10)
  assert.ok(!JSON.stringify(loaded.blockDefinitions).includes('migrate'))
  const clientRegistry = registryFromDescriptors(loaded.blockDefinitions)
  assert.ok(clientRegistry.has('cinema.peopleGrid'))
  assert.deepEqual(defaultProps(clientRegistry.get('cinema.titleGrid').fields).columns, { desktop: 3, tablet: 2, mobile: 1 })
  response = await api.PUT(req({ document: storedDocument, updatedAt: loaded.updatedAt }, 'PUT'), ctx('pages', page.id))
  assert.equal(response.status, 200, await response.clone().text())
  let row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } }), html = await editor.publicBlocksHtml(row)
  for (const [, item] of pairs) assert.ok(html.includes(item.title || item.name), 'current public item rendered')
  assert.ok(html.includes('&lt;b&gt;escaped custom&lt;/b&gt;')); assert.ok(!html.includes('PRIVATE_UNKNOWN')); assert.ok(!row.content.includes(stamp + ' cinema'), 'storage holds query criteria, not a catalogue snapshot')
  const roundtrip = adapter.fromEngineBlocks(adapter.toEngineBlocks(JSON.parse(row.contentDocument), clientRegistry), clientRegistry)
  assert.deepEqual(roundtrip.blocks.find(item => item.type === 'future.unknown'), storedDocument.blocks.find(item => item.type === 'future.unknown'))
  for (const [type, hidden] of [['cinema.titleGrid', draft], ['cinema.titleGrid', future], ['forum.topicGrid', hiddenThread], ['forum.topicGrid', unlisted]]) {
    response = await api.POST_preview(req({ block: block(type, { source: 'selected', items: [{ id: hidden.id }] }) }), ctx('pages', page.id))
    assert.equal(response.status, 200); assert.ok(!(await response.json()).html.includes(hidden.title))
  }
  response = await api.POST_preview(req({ block: block('journal.latestPosts', { source: 'selected', items: [{ id: memberPost.id }] }) }), ctx('pages', page.id))
  assert.equal(response.status, 200); assert.ok(!(await response.json()).html.includes('PRIVATE_MEMBER_BODY'))
  const livePreview = block('cinema.titleGrid', { source: 'selected', items: [{ id: title.id }], title: '<script>unsafe</script>' })
  response = await api.POST_preview(req({ block: livePreview }), ctx('pages', page.id)); assert.equal(response.status, 200)
  html = (await response.json()).html; assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;')); assert.ok(!html.includes('<script>'))
  response = await api.POST_preview(req({ action: 'items', type: 'cinema.titleGrid', query: stamp, ids: [title.id, draft.id, future.id] }), ctx('pages', page.id))
  let choices = await response.json(); assert.equal(response.status, 200); assert.deepEqual(choices.selected.map(item => item.id), [title.id]); assert.ok(choices.items.some(item => item.id === title.id)); assert.ok(!JSON.stringify(choices).includes('PRIVATE_'))
  // Repeated grids share one bounded owner query, and every public read rechecks current publication.
  const beforeReads = reads.cinemaTitle || 0
  await publicDocumentHtml(doc(...Array.from({ length: 10 }, () => block('cinema.titleGrid', { source: 'selected', items: [{ id: title.id }] }))), await editor.activeEditorRegistry())
  assert.equal(reads.cinemaTitle - beforeReads, 1)
  await prisma.cinemaTitle.update({ where: { id: title.id }, data: { status: 'DRAFT' } })
  assert.ok(!(await editor.publicBlocksHtml(row)).includes(title.title))
  await prisma.cinemaTitle.update({ where: { id: title.id }, data: { status: 'PUBLISHED' } })
  for (const owner of ['journal', 'store', 'cinema', 'music', 'games', 'software', 'forum']) {
    states[owner] = false
    loaded = await editor.loadPageDocument(page.id)
    assert.ok(!loaded.blockDefinitions.some(definition => definition.owner === owner))
    assert.ok(loaded.unsupported.length >= 2)
    const unavailable = pairs.filter(([type]) => type.startsWith(owner + '.')).map(([, item]) => item.title || item.name)
    html = await editor.publicBlocksHtml(row); assert.ok(unavailable.every(name => !html.includes(name)))
    await editor.savePageDocument({ id: page.id, document: loaded.document, expectedUpdatedAt: loaded.updatedAt, actor: viewer })
    row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } }); assert.deepEqual(JSON.parse(row.contentDocument).blocks.find(item => item.type === modules.find(item => item.type.startsWith(owner + '.')).type), modules.find(item => item.type.startsWith(owner + '.')))
    states[owner] = true
  }
  states['block-editor'] = false
  assert.ok((await editor.publicBlocksHtml(row)).includes(title.title)); assert.equal((await api.POST_preview(req({ block: livePreview }), ctx('pages', page.id))).status, 404)
  states['block-editor'] = true; closed.add('cinema'); assert.ok(!(await editor.publicBlocksHtml(row)).includes(title.title)); closed.clear()
  await prisma.setting.update({ where: { key: stamp + ':storeEnabled' }, data: { value: 'false' } }); assert.ok(!(await editor.publicBlocksHtml(row)).includes(product.name))
  await prisma.setting.update({ where: { key: stamp + ':storeEnabled' }, data: { value: 'true' } })
  loaded = await editor.loadPageDocument(page.id)
  for (const injected of ['contentRevision', 'auditLog']) {
    fault = injected
    response = await api.PUT(req({ document: doc(block('content.heading', { text: injected })), updatedAt: loaded.updatedAt }, 'PUT'), ctx('pages', page.id))
    fault = ''; assert.equal(response.status, 500); assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: page.id } })).contentDocument, row.contentDocument)
  }
  response = await api.PUT(req({ document: doc(...Array.from({ length: 21 }, () => block('cinema.titleGrid'))), updatedAt: loaded.updatedAt }, 'PUT'), ctx('pages', page.id))
  assert.equal(response.status, 422)
  assert.equal((await api.POST_preview(req({ block: livePreview }, 'POST', ''), ctx('pages', page.id))).status, 403)
  viewer = null; assert.equal((await api.POST_preview(req({ block: livePreview }), ctx('pages', page.id))).status, 403)
  const author = await own('user', { email: stamp + '-author@example.invalid', passwordHash: 'unused' })
  viewer = { ...author, roleId: 12345, permissions: ['journal.author'] }
  editor.registerModuleBlocks([{ ...editor.editorRegistry().get('cinema.titleGrid'), type: 'cinema.restrictedFixture', permission: 'cinema.manage' }])
  assert.equal((await api.POST_preview(req({ block: livePreview }), ctx('posts', post.id))).status, 404)
  assert.equal((await api.POST_preview(req({ block: livePreview }), ctx('pages', page.id))).status, 403)
  const ownPost = await own('post', { slug: stamp + '-own', title: 'Author document', authorId: author.id })
  assert.equal((await api.POST_preview(req({ block: livePreview }), ctx('posts', ownPost.id))).status, 200)
  assert.equal((await api.POST_preview(req({ action: 'items', type: 'cinema.restrictedFixture', query: stamp }), ctx('posts', ownPost.id))).status, 403)
  assert.equal((await api.POST_preview(req({ block: block('cinema.restrictedFixture') }), ctx('posts', ownPost.id))).status, 422)
  viewer = { ...actor, permissions: null }
  // The canonical JSON is kept whole even beyond the historical200k text cap; restore regenerates its HTML copy.
  const large = doc(...Array.from({ length: 3 }, () => block('content.richText', { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(80000) }] }] } })))
  row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } })
  response = await api.PUT(req({ document: large, updatedAt: row.updatedAt.toISOString() }, 'PUT'), ctx('pages', page.id)); assert.equal(response.status, 200, await response.clone().text())
  const largeRevision = await prisma.contentRevision.findFirstOrThrow({ where: { entityType: 'pages', entityId: page.id }, orderBy: { version: 'desc' } })
  assert.ok(JSON.parse(largeRevision.snapshot).contentDocument.length > 200000)
  row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } })
  response = await api.PUT(req({ document: doc(block('content.heading', { text: 'replacement' })), updatedAt: row.updatedAt.toISOString() }, 'PUT'), ctx('pages', page.id)); assert.equal(response.status, 200)
  response = await history.POST_history(new NextRequest('http://localhost:3000/api/admin/history', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'pages', id: page.id, version: largeRevision.version }) }))
  assert.equal(response.status, 200, await response.clone().text()); row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } }); assert.equal((row.content.match(/x{80000}/g) || []).length, 3, 'restore regenerates the complete HTML body, including its text beyond200k')
  const latest = await prisma.contentRevision.findFirstOrThrow({ where: { entityType: 'pages', entityId: page.id }, orderBy: { version: 'desc' } })
  await prisma.contentRevision.create({ data: { entityType: 'pages', entityId: page.id, version: latest.version + 1, source: 'edit', snapshot: JSON.stringify({ editorFormat: 'blocks-v1', contentDocument: '{truncated', content: 'bad' }) } })
  response = await history.POST_history(new NextRequest('http://localhost:3000/api/admin/history', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'pages', id: page.id, version: latest.version + 1 }) }))
  assert.equal(response.status, 422); assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: page.id } })).contentDocument, row.contentDocument)
  console.log('Module blocks: ten canonical sources, descriptors/renderers, current privacy/disabled gates, preview/author guards, bounded deduplication and atomic/full-body history passed.')
} finally {
  for (const { model, id } of owned.filter(row => ['page', 'post'].includes(row.model))) await prisma.contentRevision.deleteMany({ where: { entityType: model === 'page' ? 'pages' : 'posts', entityId: id } })
  if (actor) await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } })
  await prisma.setting.deleteMany({ where: { key: stamp + ':storeEnabled' } })
  for (const { model, id } of [...owned].reverse()) await prisma[model].deleteMany({ where: { id } })
  await prisma.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
