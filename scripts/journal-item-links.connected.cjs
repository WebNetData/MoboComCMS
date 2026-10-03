// Run inside the local app container: node scripts/journal-item-links.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
function loadItemLinks() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/journal/server/item-links.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => name === '@/platform/database/prisma' ? { db } : name === '@/modules/catalog/domain/product-publication' ? { publicProductWhere: { active: true, approval: 'APPROVED' } } : name === '@/extensions/server/modules' ? { isModuleEnabled: async () => true } : require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const { validatePostItemLinks, replacePostItemLinks } = loadItemLinks()
  const suffix = `journal-link-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const rollback = new Error('ROLLBACK_CONNECTED_CHECK')
  try {
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { slug: suffix, name: suffix } })
      const post = await tx.post.create({ data: { slug: suffix, title: suffix, content: '<p>check</p>', status: 'PUBLISHED' } })
      const selected = [{ type: 'product', id: product.id }]
      await validatePostItemLinks(tx, selected)
      await replacePostItemLinks(tx, post.id, selected)
      assert.deepEqual(await tx.postItemLink.findMany({ where: { postId: post.id }, select: { itemType: true, itemId: true, position: true } }), [{ itemType: 'product', itemId: product.id, position: 0 }])
      await assert.rejects(validatePostItemLinks(tx, [{ type: 'product', id: product.id + 1_000_000 }]), /Linked public product not found/)
      assert.equal(await tx.postItemLink.count({ where: { postId: post.id } }), 1, 'failed selection did not alter links')
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
  }
  assert.equal(await db.post.count({ where: { slug: suffix } }), 0)
  assert.equal(await db.product.count({ where: { slug: suffix } }), 0)
  console.log('Journal entity links: create, validate, clear, target retention, cascade and rollback passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
