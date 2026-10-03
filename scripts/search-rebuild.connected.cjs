// Run inside the local app container: node scripts/search-rebuild.connected.cjs
// Rebuilds the derived search index without changing source content.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()

async function main() {
  const publishedPosts = await db.post.count({ where: { status: 'PUBLISHED' } })
  const previous = await db.setting.findUnique({ where: { key: 'search.indexedAt' } })
  await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  try {
    const response = await fetch('http://localhost:3000/api/search?q=mobocom', { signal: AbortSignal.timeout(180_000) })
    assert.equal(response.status, 200, await response.text())
    assert.ok(await db.setting.findUnique({ where: { key: 'search.indexedAt' } }), 'rebuild must stamp the completed index')
    const indexedPosts = await db.searchDocument.count({ where: { itemType: 'post' } })
    assert.equal(indexedPosts, publishedPosts, 'all published and scheduled Journal posts should be indexed')
    console.log(`Search rebuild: ${indexedPosts} of ${publishedPosts} Journal posts indexed`)
  } catch (error) {
    if (previous && !await db.setting.findUnique({ where: { key: 'search.indexedAt' } })) await db.setting.create({ data: previous })
    throw error
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
