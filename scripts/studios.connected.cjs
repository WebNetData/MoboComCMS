// Local PostgreSQL + port 3000: node --env-file=.env scripts/studios.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const suffix = Date.now()
const name = `Codex Shared Studio ${suffix}`
const publisher = `Codex Shared Publisher ${suffix}`
const hidden = `Codex Hidden Studio ${suffix}`
const slug = `codex-studios-${suffix}`
const titleIds = { software: [], games: [] }
const studioIds = []

async function main() {
  const missing = await Promise.all([
    db.gameTitle.count({ where: { developer: { not: '' }, developerStudioId: null } }),
    db.gameTitle.count({ where: { publisher: { not: '' }, publisherStudioId: null } }),
    db.softwareTitle.count({ where: { developer: { not: '' }, developerStudioId: null } }),
  ])
  assert.deepEqual(missing, [0, 0, 0], 'legacy developer and publisher strings were backfilled')
  const admin = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } })
  assert.ok(admin)
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, name: admin.name, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const cookie = `next-auth.session-token=${token}`
  const api = (method, route, body) => fetch(`http://127.0.0.1:3000${route}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45_000) })
  const page = async (route) => (await (await fetch(`http://127.0.0.1:3000${route}`, { signal: AbortSignal.timeout(45_000) })).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const add = async (type, body) => {
    const response = await api('POST', `/api/admin/media-library?type=${type}`, body)
    assert.equal(response.status, 201, response.status === 201 ? '' : await response.text())
    const saved = await response.json()
    titleIds[type].push(saved.id)
    return saved.id
  }
  const softwareId = await add('software', { slug: `${slug}-software`, title: 'نرم‌افزار مشترک کدکس', developer: name, publisher, status: 'PUBLISHED' })
  const gameId = await add('games', { slug: `${slug}-game`, title: 'بازی مشترک کدکس', developer: name.toLowerCase(), publisher, status: 'PUBLISHED' })
  const hiddenId = await add('games', { slug: `${slug}-hidden`, title: 'بازی پنهان کدکس', developer: hidden, status: 'DRAFT' })
  const [software, game, draft] = await Promise.all([
    db.softwareTitle.findUniqueOrThrow({ where: { id: softwareId } }),
    db.gameTitle.findUniqueOrThrow({ where: { id: gameId } }),
    db.gameTitle.findUniqueOrThrow({ where: { id: hiddenId } }),
  ])
  assert.ok(software.developerStudioId && software.publisherStudioId)
  assert.equal(game.developerStudioId, software.developerStudioId, 'case variants share one developer')
  assert.equal(game.publisherStudioId, software.publisherStudioId, 'publisher is shared across catalogues')
  studioIds.push(software.developerStudioId, software.publisherStudioId, draft.developerStudioId)
  const directory = await page(`/studios?q=${encodeURIComponent(name)}`)
  assert.ok(directory.includes(name) && directory.includes(`/studios/${software.developerStudioId}`), 'shared studio appears in public directory')
  const profile = await page(`/studios/${software.developerStudioId}`)
  assert.ok(profile.includes('نرم‌افزار مشترک') && profile.includes('بازی مشترک'), 'profile joins visible software and games')
  assert.ok((await page(`/software/${software.slug}`)).includes(`/studios/${software.developerStudioId}`), 'software links to shared studio')
  assert.ok((await page(`/games/${game.slug}`)).includes(`/studios/${game.developerStudioId}`), 'game links to shared studio')
  assert.ok((await page(`/software/browse?developerStudioId=${software.developerStudioId}`)).includes(software.slug), 'software browse filters by shared identity')
  assert.ok((await page(`/games/browse?developerStudioId=${game.developerStudioId}`)).includes(game.slug), 'games browse filters by shared identity')
  assert.ok(!(await page(`/studios?q=${encodeURIComponent(hidden)}`)).includes(`/studios/${draft.developerStudioId}`), 'draft-only studio is hidden from directory')
  assert.equal((await fetch(`http://127.0.0.1:3000/studios/${draft.developerStudioId}`, { signal: AbortSignal.timeout(45_000) })).status, 404, 'draft-only studio detail is hidden')
  assert.equal((await fetch('http://127.0.0.1:3000/api/admin/studios', { signal: AbortSignal.timeout(45_000) })).status, 403, 'admin API requires content privilege')
  const invalid = await api('PATCH', '/api/admin/studios', { id: software.developerStudioId, website: 'javascript:alert(1)' })
  assert.equal(invalid.status, 400, 'unsafe website rejected')
  const saved = await api('PATCH', '/api/admin/studios', { id: software.developerStudioId, summary: 'پروفایل مشترک آزمایشی', website: 'https://example.com', logo: '/og.svg' })
  assert.equal(saved.status, 200, saved.status === 200 ? '' : await saved.text())
  assert.ok((await page(`/studios/${software.developerStudioId}`)).includes('پروفایل مشترک آزمایشی'), 'public profile reflects admin edit')
  console.log('Studios: shared identity, publication gates, cross-catalogue hub, admin authorization and profile edit OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (titleIds.games.length) await db.gameTitle.deleteMany({ where: { id: { in: titleIds.games } } })
  if (titleIds.software.length) await db.softwareTitle.deleteMany({ where: { id: { in: titleIds.software } } })
  if (studioIds.length) await db.studio.deleteMany({ where: { id: { in: studioIds } } })
  await db.$disconnect()
})
