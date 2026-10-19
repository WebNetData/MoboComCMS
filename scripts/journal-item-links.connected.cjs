// Run inside the local app container: node scripts/journal-item-links.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
function loadItemLinks() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/journal/server/item-links.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  const items = { LINKABLE: ['software', 'game', 'studio', 'title', 'album', 'track', 'artist', 'product'], isItemType: (value) => ['software', 'game', 'studio', 'title', 'album', 'track', 'artist', 'product', 'post', 'thread'].includes(String(value)), itemKey: (ref) => `${ref.type}:${ref.id}` }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/modules/content/domain/items': items,
    '@/modules/catalog/domain/product-publication': { publicProductWhere: { active: true, approval: 'APPROVED' } },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/content/server/registry': { enabledItemTypes: async () => ['product'], itemCards: (refs, client = db) => client.product.findMany({ where: { id: { in: refs.filter((ref) => ref.type === 'product').map((ref) => ref.id) }, active: true, approval: 'APPROVED' }, select: { id: true } }).then((rows) => new Map(rows.map((row) => [`product:${row.id}`, row]))) },
  }
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const { parsePostItemLinks, validatePostItemLinks, replacePostItemLinks } = loadItemLinks()
  const suffix = `journal-link-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const rollback = new Error('ROLLBACK_CONNECTED_CHECK')
  try {
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { slug: suffix, name: suffix, active: true, approval: 'APPROVED' } })
      const post = await tx.post.create({ data: { slug: suffix, title: suffix, content: '<p>check</p>', status: 'PUBLISHED' } })
      const selected = [{ type: 'product', id: product.id }]
      await validatePostItemLinks(tx, selected)
      await replacePostItemLinks(tx, post.id, selected)
      assert.deepEqual(await tx.postItemLink.findMany({ where: { postId: post.id }, select: { itemType: true, itemId: true, position: true } }), [{ itemType: 'product', itemId: product.id, position: 0 }])
      await assert.rejects(validatePostItemLinks(tx, [{ type: 'product', id: product.id + 1_000_000 }]), /Linked public item not found/)
      assert.equal(await tx.postItemLink.count({ where: { postId: post.id } }), 1, 'failed selection did not alter links')
      assert.throws(() => parsePostItemLinks([{ type: 'post', id: post.id }]), /Invalid article links/, 'articles and threads are not linkable')
      await replacePostItemLinks(tx, post.id, [])
      assert.equal(await tx.postItemLink.count({ where: { postId: post.id } }), 0)
      await replacePostItemLinks(tx, post.id, selected)
      await tx.product.delete({ where: { id: product.id } })
      assert.equal(await tx.postItemLink.count({ where: { postId: post.id } }), 1, 'target deletion retains inert reference')
      await validatePostItemLinks(tx, selected, post.id)
      await tx.post.delete({ where: { id: post.id } })
      assert.equal(await tx.postItemLink.count({ where: { postId: post.id } }), 0, 'post deletion cascades references')
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  } finally {
    await db.product.deleteMany({ where: { slug: suffix } }).catch(() => null)
  }
  assert.equal(await db.post.count({ where: { slug: suffix } }), 0)
  assert.equal(await db.product.count({ where: { slug: suffix } }), 0)
  console.log('Journal entity links: create, validate, clear, target retention, cascade and rollback passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
