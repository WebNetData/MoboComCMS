// Native PostgreSQL import/Editor compatibility; no production rows or remote downloads.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient(), prefix = 'import-compat-' + Date.now()
assert(/test|check|editor_media/i.test(new URL(process.env.DATABASE_URL).pathname), 'explicit disposable database required')
let actor, beforeClaim = null
const db = new Proxy(prisma, { get(target, key) {
  if (key === '$transaction') return (callback, options) => target.$transaction(tx => callback(new Proxy(tx, { get(client, field) {
    if (field !== 'post') return client[field]
    return new Proxy(client.post, { get(model, method) {
      if (method !== 'findUnique') return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
      return async args => { const row = await model.findUnique(args); if (beforeClaim && args.select?.editorFormat && args.select?.updatedAt) { const hook = beforeClaim; beforeClaim = null; await hook() }; return row }
    } })
  } })), options)
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db }, '@/modules/content/server/events': { contentChanged() {} } })
const document = JSON.stringify({ version: 1, blocks: [{ id: 'owned-body', type: 'core.paragraph', version: 1, props: { text: 'Protected body' } }] })
async function main() {
  actor = await prisma.user.create({ data: { email: prefix + '@example.invalid', passwordHash: 'owned-unused', name: prefix } })
  load('src/modules/imports/server/adapters/index.ts')
  const { getImporter } = load('src/modules/imports/server/registry.ts'), magazine = getImporter('magazine')
  const { coerceValues } = load('src/modules/imports/domain/coerce.ts')
  for (const name of ['store', 'magazine', 'movies', 'series', 'games', 'software', 'music']) {
    const adapter = getImporter(name), sample = JSON.parse(fs.readFileSync(path.join('public/examples/imports', name + '.json')))[0]
    const result = coerceValues(adapter.fields, sample, { categorySeparator: '>' })
    assert.deepEqual(result.messages, [], name + ' sample must have valid mapped values')
    for (const field of adapter.fields.filter(field => field.requiredOnCreate)) assert(field.key in result.values, name + ':' + field.key)
    if (name !== 'store') { assert.equal(adapter.options.find(option => option.key === 'defaultStatus').default, 'DRAFT'); assert.equal(adapter.normalizeOptions({}).defaultStatus, 'PUBLISHED', 'historical missing defaults keep their meaning') }
  }
  function context(fields = ['content']) { return { actor, jobId: null, dryRun: false, settings: { adapter: 'magazine', source: prefix, existing: 'update', protectEdits: false, options: { ...magazine.normalizeOptions({}), copyAssets: false } }, cache: new Map(), planned: new Set(), knownImages: new Set(), allow: values => Object.fromEntries(Object.entries(values).filter(([key]) => fields.includes(key))), previewLines: () => [], importImage: async () => { throw Error('unexpected remote download') } } }
  const block = await prisma.post.create({ data: { slug: prefix + '-block', title: prefix, content: '<p>Protected body</p>', editorFormat: 'blocks-v1', contentDocument: document } })
  const item = { index: 0, rows: [1], values: {}, variants: [] }, values = { slug: block.slug, content: '<p>replacement</p>', excerpt: 'new excerpt' }
  let ctx = context(); await magazine.prepare([item], [values], ctx)
  const rejected = await magazine.plan(item, values, [], ctx); assert.equal(rejected.action, 'FAIL'); assert.match(rejected.messages.map(m => m.text).join(), /بلوکی/)
  await assert.rejects(magazine.apply(item, { action: 'UPDATE', sourceKey: block.slug, data: { existing: block, values, paths: [], authorId: null } }, ctx), /بلوکی/)
  ctx = context(['excerpt']); await magazine.prepare([item], [values], ctx); let plan = await magazine.plan(item, values, [], ctx)
  assert.equal(plan.action, 'UPDATE'); const metadata = await magazine.apply(item, plan, ctx)
  assert.equal((await prisma.post.findUnique({ where: { id: block.id } })).contentDocument, document)
  assert.deepEqual((await magazine.rollback(metadata.changes)).conflicts, [])
  const legacy = await prisma.post.create({ data: { slug: prefix + '-legacy', title: prefix, content: '<p>old HTML</p>' } })
  const html = '<p>new HTML</p><audio controls src="https://example.com/one.mp3"></audio><audio controls src="https://example.com/two.mp3"></audio>'
  const input = { slug: legacy.slug, content: html }; ctx = context(); await magazine.prepare([item], [input], ctx); plan = await magazine.plan(item, input, [], ctx)
  const imported = await magazine.apply(item, plan, ctx), saved = await prisma.post.findUnique({ where: { id: legacy.id } })
  assert(saved.content.includes('one.mp3') && saved.content.includes('two.mp3')); assert.equal(saved.editorFormat, 'legacy')
  assert.deepEqual((await magazine.rollback(imported.changes)).conflicts, [])
  assert.equal((await prisma.post.findUnique({ where: { id: legacy.id } })).content, legacy.content)
  await prisma.post.update({ where: { id: legacy.id }, data: { editorFormat: 'blocks-v1', contentDocument: document, content: saved.content } })
  assert.equal((await magazine.rollback(imported.changes)).conflicts.length, 1, 'undo must not restore stale HTML over a converted body')
  assert.equal((await prisma.post.findUnique({ where: { id: legacy.id } })).contentDocument, document)
  await prisma.post.update({ where: { id: legacy.id }, data: { editorFormat: 'legacy', contentDocument: '', content: legacy.content } })
  ctx = context(); await magazine.prepare([item], [input], ctx); plan = await magazine.plan(item, input, [], ctx)
  beforeClaim = () => prisma.post.update({ where: { id: legacy.id }, data: { editorFormat: 'blocks-v1', contentDocument: document, content: '<p>concurrent block conversion</p>' } })
  await assert.rejects(magazine.apply(item, plan, ctx), /هم‌زمان|بلوکی/)
  assert.equal((await prisma.post.findUnique({ where: { id: legacy.id } })).content, '<p>concurrent block conversion</p>')
  console.log('Native import compatibility passed: seven valid samples, draft/legacy defaults, block refusal, metadata update/undo, two audio files, HTML undo and concurrent conversion protection.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  try { await prisma.importExternalRef.deleteMany({ where: { source: prefix } }); await prisma.post.deleteMany({ where: { slug: { startsWith: prefix } } }); if (actor) await prisma.user.delete({ where: { id: actor.id } }) } finally { await prisma.$disconnect() }
})
