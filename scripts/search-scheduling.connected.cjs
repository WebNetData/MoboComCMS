// Run inside the local app container after an authenticated E2E setup:
// node scripts/search-scheduling.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PrismaClient } = require('@prisma/client')
const { request } = require('@playwright/test')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const state = 'e2e/.auth/admin.json'
const seed = `codexschedule${Date.now()}`
let postId = 0
let originalIndexTime
let admin

async function search() {
  const response = await fetch(`${base}/api/search?q=${seed}`, { signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200)
  return response.json()
}

async function main() {
  assert.ok(fs.existsSync(state), 'authenticated E2E state is required')
  admin = await request.newContext({ baseURL: base, storageState: state, extraHTTPHeaders: { origin: base } })
  originalIndexTime = await db.setting.findUnique({ where: { key: 'search.indexedAt' } })
  await db.setting.upsert({ where: { key: 'search.indexedAt' }, create: { key: 'search.indexedAt', value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
  const due = new Date(Date.now() + 12_000)
  const response = await admin.post('/api/admin/cms?type=posts', { data: {
    slug: seed, title: seed, excerpt: 'Scheduled search integration check', content: '<p>Scheduled search integration check</p>', status: 'PUBLISHED', publishedAt: due.toISOString(),
  } })
  assert.equal(response.status(), 200, await response.text())
  postId = (await response.json()).id
  assert.ok(postId)

  let indexed
  for (let attempt = 0; attempt < 40; attempt++) {
    indexed = await db.searchDocument.findUnique({ where: { itemType_itemId: { itemType: 'post', itemId: postId } } })
    if (indexed) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(indexed, 'admin save should prepare a search document before publication')
  assert.equal(indexed.publishedAt.getTime(), due.getTime())
  assert.equal((await search()).total, 0, 'scheduled post must stay out of public search')
  await new Promise(resolve => setTimeout(resolve, Math.max(0, due.getTime() - Date.now() + 100)))
  const after = await search()
  assert.equal(after.total, 1, 'post should become searchable without another save or index rebuild')
  assert.equal(after.hits[0].id, postId)
  console.log('Scheduled search: prepared privately, visible at due time without reindex OK')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (postId) {
    await db.socialPost.deleteMany({ where: { itemType: 'post', itemId: postId } })
    await db.searchDocument.deleteMany({ where: { itemType: 'post', itemId: postId } })
    await db.post.deleteMany({ where: { id: postId } })
  }
  if (originalIndexTime) await db.setting.update({ where: { key: 'search.indexedAt' }, data: { value: originalIndexTime.value } })
  else await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  await admin?.dispose()
  await db.$disconnect()
})
