// Run only against the local app container: node scripts/search-query-scale.connected.cjs
// Creates temporary published posts and documents, then verifies search past 400 candidates.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const prefix = `codexquery${Date.now()}`
const count = 521
let originalStamp = null
let stampRead = false

async function query(page = 1) {
  const response = await fetch(`http://localhost:3000/api/search?q=${prefix}&page=${page}`, { signal: AbortSignal.timeout(60_000) })
  assert.equal(response.status, 200)
  return response.json()
}

async function main() {
  originalStamp = await db.setting.findUnique({ where: { key: 'search.indexedAt' } })
  stampRead = true
  for (let start = 1; start <= count; start += 250) {
    await db.post.createMany({ data: Array.from({ length: Math.min(250, count - start + 1) }, (_, offset) => {
      const n = start + offset
      return { slug: `${prefix}-${n}`, title: n === count ? prefix : `Guide ${n}`, content: prefix, status: 'PUBLISHED', publishedAt: new Date('2025-01-01T00:00:00Z') }
    }) })
  }
  const posts = await db.post.findMany({ where: { slug: { startsWith: `${prefix}-` } }, select: { id: true, slug: true, title: true } })
  assert.equal(posts.length, count)
  for (let start = 0; start < posts.length; start += 250) {
    await db.searchDocument.createMany({ data: posts.slice(start, start + 250).map(post => ({
      itemType: 'post', itemId: post.id, title: post.title, text: prefix,
      url: `/blog/${post.slug}`, boost: post.title === prefix ? 0 : 1000,
      publishedAt: new Date('2025-01-01T00:00:00Z'),
    })) })
  }
  await db.setting.upsert({ where: { key: 'search.indexedAt' }, create: { key: 'search.indexedAt', value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
  const first = await query()
  assert.equal(first.total, count)
  assert.equal(first.counts.post, count)
  assert.equal(first.pages, 27)
  assert.equal(first.hits[0].title, prefix)
  const last = await query(27)
  assert.equal(last.hits.length, 1)
  console.log(`Search query scale: ${count} visible posts counted and ranked across 27 pages`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.searchDocument.deleteMany({ where: { itemType: 'post', text: prefix } })
    await db.post.deleteMany({ where: { slug: { startsWith: `${prefix}-` } } })
    assert.equal(await db.post.count({ where: { slug: { startsWith: `${prefix}-` } } }), 0)
    assert.equal(await db.searchDocument.count({ where: { itemType: 'post', text: prefix } }), 0)
    if (stampRead && originalStamp) await db.setting.update({ where: { key: 'search.indexedAt' }, data: { value: originalStamp.value } })
    else if (stampRead) await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  } catch (error) { console.error('Search query cleanup failed:', error); process.exitCode = 1 }
  await db.$disconnect()
})
