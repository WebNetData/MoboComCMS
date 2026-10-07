// Real PostgreSQL forums, topics, studios, film people, collections and categories through the sitemap's
// entity lists. The lists are read for the whole site; the assertions only look at this script's own rows.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `seoent${Date.now()}`
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
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => null, isMember: async () => false }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const seo = load('src/modules/seo/server/sitemap-entities.ts'), rules = load('src/modules/seo/domain/seo.ts')
const live = { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) }

async function main() {
  // ---- forums: what a visitor may read, by the forum's own rule
  const user = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const forum = (name, data = {}) => prisma.forumCategory.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, sortOrder: 9500, ...data } })
  const open = await forum('open'), vip = await forum('vip', { access: 'MEMBERS' }), club = await forum('club', { permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } })
  const topic = (cat, name, data = {}) => prisma.forumThread.create({ data: { categoryId: cat.id, userId: user.id, title: `${seed} ${name}`, ...data } })
  const seen = await topic(open, 'seen'), hidden = await topic(open, 'hidden', { status: 'HIDDEN' }), unlisted = await topic(open, 'unlisted', { listed: false }), inVip = await topic(vip, 'vip'), inClub = await topic(club, 'club')
  const forumPaths = (await seo.forumSitemap()).map(entry => entry.path)
  const has = (paths, value) => paths.includes(value)
  assert.deepEqual([has(forumPaths, `/forum/c/${open.slug}`), has(forumPaths, `/forum/t/${seen.id}`)], [true, true])
  assert.deepEqual([vip.slug, club.slug].map(slug => has(forumPaths, `/forum/c/${slug}`)), [false, false], 'a members-only forum and a forum of one group are not advertised')
  assert.deepEqual([hidden, unlisted, inVip, inClub].map(row => has(forumPaths, `/forum/t/${row.id}`)), [false, false, false, false], 'nor a hidden or unlisted topic, nor any topic inside those forums')

  // ---- entities: only those with something public behind them
  const studio = await prisma.studio.create({ data: { name: `${seed} studio`, normalizedName: `${seed} studio` } }), idle = await prisma.studio.create({ data: { name: `${seed} idle`, normalizedName: `${seed} idle` } })
  const drafts = await prisma.studio.create({ data: { name: `${seed} drafts`, normalizedName: `${seed} drafts` } })
  await prisma.gameTitle.create({ data: { slug: `${seed}-game`, title: `${seed} game`, developerStudioId: studio.id, ...live } })
  await prisma.gameTitle.create({ data: { slug: `${seed}-draft`, title: `${seed} draft`, developerStudioId: drafts.id, status: 'DRAFT' } })
  const film = await prisma.cinemaTitle.create({ data: { slug: `${seed}-film`, title: `${seed} film`, ...live } }), unreleased = await prisma.cinemaTitle.create({ data: { slug: `${seed}-unreleased`, title: `${seed} unreleased`, status: 'DRAFT' } })
  const person = name => prisma.cinemaPerson.create({ data: { name: `${seed} ${name}`, normalizedName: `${seed} ${name}` } })
  const known = await person('known'), unknown = await person('unknown'), nobody = await person('nobody')
  await prisma.cinemaCredit.createMany({ data: [{ titleId: film.id, personId: known.id, role: 'DIRECTOR' }, { titleId: unreleased.id, personId: unknown.id, role: 'CAST' }] })
  const collection = (name, visibility, items = 1) => prisma.userCollection.create({ data: { ownerId: user.id, title: `${seed} ${name}`, visibility, items: { create: Array.from({ length: items }, (_, i) => ({ itemType: 'title', itemId: film.id + i, position: i + 1 })) } } })
  const shared = await collection('public', 'PUBLIC'), editorial = await collection('editorial', 'EDITORIAL'), priv = await collection('private', 'PRIVATE'), unlistedList = await collection('unlisted', 'UNLISTED'), empty = await collection('empty', 'PUBLIC', 0)
  const term = (name, count) => prisma.taxonomyTerm.create({ data: { taxonomy: 'cinema', slug: `${seed}-${name}`, name: `${seed} ${name}`, count } })
  const used = await term('used', 3), unused = await term('unused', 0)
  const paths = (await seo.entitySitemap()).map(entry => entry.path)
  assert.deepEqual([`/studios/${studio.id}`, `/cinema/people/${known.id}`, `/collections/${shared.id}`, `/collections/${editorial.id}`, '/studios', '/cinema/people', '/collections'].map(value => has(paths, value)), [true, true, true, true, true, true, true])
  assert.deepEqual([`/studios/${idle.id}`, `/studios/${drafts.id}`, `/cinema/people/${unknown.id}`, `/cinema/people/${nobody.id}`, `/collections/${priv.id}`, `/collections/${unlistedList.id}`, `/collections/${empty.id}`].map(value => has(paths, value)), [false, false, false, false, false, false, false], 'a studio or person with nothing published, a private or link-only collection, an empty collection')
  assert.deepEqual([paths.some(value => value.endsWith(`/${used.slug}`)), paths.some(value => value.endsWith(`/${unused.slug}`)), new Set(paths).size === paths.length], [true, false, true], 'a category page with something in it; every address once')

  // ---- listing pages: one address per list worth indexing
  const meta = (params, keep = ['kind', 'genre', 'page']) => rules.listingMeta('/cinema/browse', params, keep)
  assert.deepEqual([meta({}), meta({ genre: 'درام', sort: 'imdb' }), meta({ page: '1', kind: 'SERIES' }), meta({ page: '3', genre: 'a b', kind: 'MOVIE' })],
    [{ canonical: '/cinema/browse', index: true }, { canonical: '/cinema/browse?genre=%D8%AF%D8%B1%D8%A7%D9%85', index: true }, { canonical: '/cinema/browse?kind=SERIES', index: true }, { canonical: '/cinema/browse?kind=MOVIE&genre=a%20b&page=3', index: true }], 'a reordering is the same list; the first page is the list itself; the order of filters does not make another address')
  assert.deepEqual([meta({ q: 'x' }), meta({ genre: 'a', year: '2020' }), meta({ year: '' }), meta({ genre: ['a', 'b'] })], [{ canonical: '/cinema/browse', index: false }, { canonical: '/cinema/browse?genre=a', index: false }, { canonical: '/cinema/browse', index: true }, { canonical: '/cinema/browse?genre=a', index: true }], 'a search or a one-off combination is not indexed and points at the list it narrows')
  console.log('PostgreSQL sitemap entities: forums and topics by the forum\'s own visibility, studios, film people, collections and category pages with something public, and canonical addresses of filtered lists passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.gameTitle.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.studio.deleteMany({ where: { normalizedName: { startsWith: seed } } })
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.cinemaPerson.deleteMany({ where: { normalizedName: { startsWith: seed } } })
    await prisma.taxonomyTerm.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.userCollection.deleteMany({ where: { owner: { email: { startsWith: seed } } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
