// Run only against the local app container: node scripts/search-query-scale.connected.cjs
// Creates temporary published posts and documents, then verifies numeric and cursor pagination.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const prefix = `codexquery${Date.now()}`
const count = 1021
let originalStamp = null
let stampRead = false

async function query(page = 1, cursor = null) {
  const response = await fetch(`http://localhost:3000/api/search?q=${prefix}&page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: AbortSignal.timeout(60_000) })
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
  assert.equal(first.pages, 50)
  assert.equal(first.totalPages, 52)
  assert.equal(first.hits[0].title, prefix)
  const numericLast = await query(51)
  assert.equal(numericLast.page, 50)
  assert.equal(numericLast.hits.length, 20)
  assert.ok(numericLast.nextCursor)
  const next = await query(1, numericLast.nextCursor)
  assert.equal(next.page, 51)
  assert.equal(next.hits.length, 20)
  assert.equal(next.cursorReset, false)
  assert.equal(new Set([...numericLast.hits, ...next.hits].map(hit => hit.id)).size, 40)
  const back = await query(1, next.previousCursor)
  assert.deepEqual(back.hits, numericLast.hits)
  const last = await query(1, next.nextCursor)
  assert.equal(last.page, 52)
  assert.equal(last.hits.length, 1)
  assert.equal(last.nextCursor, null)
  await db.post.update({ where: { id: last.hits[0].id }, data: { status: 'DRAFT' } })
  const hidden = await query(1, next.nextCursor)
  assert.equal(hidden.total, count - 1)
  assert.equal(hidden.cursorReset, true, 'an emptied last page restarts rather than claiming no matches')
  assert.equal(hidden.page, 1)
  assert.equal(hidden.hits.length, 20)
  assert.ok(hidden.hits.every(hit => hit.id !== last.hits[0].id), 'cursor cannot expose a withdrawn source through a stale document')
  await db.post.update({ where: { id: last.hits[0].id }, data: { status: 'PUBLISHED' } })
  const { chromium } = require('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://localhost:3000/search?q=${prefix}&page=50`, { waitUntil: 'networkidle' })
    await page.locator('.sr-pager a[rel="next"]').click()
    await page.waitForURL(/cursor=/)
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('.sr-list > li').count(), 20)
    assert.ok((await page.locator('.sr-list h2 a').first().getAttribute('href')).endsWith(next.hits[0].url))
    await page.locator('.sr-pager a[rel="prev"]').click()
    await page.waitForFunction(expected => document.querySelector('.sr-list h2 a')?.getAttribute('href')?.endsWith(expected), numericLast.hits[0].url)
    assert.ok((await page.locator('.sr-list h2 a').first().getAttribute('href')).endsWith(numericLast.hits[0].url))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  } finally { await browser.close() }
  console.log(`Search query scale: ${count} visible posts; API and browser crossed page 50 and returned; draft excluded`)
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
