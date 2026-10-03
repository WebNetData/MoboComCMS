// Run only against the local app container: node scripts/search-rebuild-scale.connected.cjs
// Creates temporary scheduled posts, verifies an index rebuild past 5,000 rows,
// then deletes only its own rows and rebuilds the derived index again.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const prefix = `codexindex${Date.now()}`
const count = 5001

async function rebuild() {
  await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  const response = await fetch(`http://localhost:3000/api/search?q=${prefix}`, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`Search rebuild returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

async function main() {
  const due = new Date(Date.now() + 7 * 86_400_000)
  for (let start = 1; start <= count; start += 500) {
    await db.post.createMany({ data: Array.from({ length: Math.min(500, count - start + 1) }, (_, offset) => ({
      slug: `${prefix}-${start + offset}`, title: `${prefix} ${start + offset}`, content: 'Temporary search rebuild check', status: 'PUBLISHED', publishedAt: due,
    })) })
  }
  const publicSearch = await rebuild()
  assert.equal(publicSearch.total, 0, 'future posts stay absent from public search')
  const indexed = await db.searchDocument.count({ where: { itemType: 'post', title: { startsWith: prefix } } })
  assert.equal(indexed, count, 'full rebuild should include every temporary post')
  console.log(`Search rebuild scale: ${indexed} scheduled posts indexed without public exposure`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.post.deleteMany({ where: { slug: { startsWith: prefix } } })
    await db.searchDocument.deleteMany({ where: { itemType: 'post', title: { startsWith: prefix } } })
    await rebuild()
  } catch (error) { console.error('Search rebuild cleanup failed:', error); process.exitCode = 1 }
  await db.$disconnect()
})
