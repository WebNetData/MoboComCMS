// Local PostgreSQL + port 3000: node --env-file=.env scripts/software-compatibility.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const slug = `codex-compatibility-${Date.now()}`
let softwareId = 0
let releaseId = 0

async function main() {
  const admin = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } })
  assert.ok(admin, 'local admin account exists')
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, name: admin.name, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const cookie = `next-auth.session-token=${token}`
  const request = (method, route, body) => fetch(`http://127.0.0.1:3000${route}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45_000) })
  const software = await db.softwareTitle.create({ data: { slug, title: 'Codex compatibility test', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000) } })
  softwareId = software.id
  const payload = {
    softwareId, version: '3.2.0', channel: 'STABLE', status: 'PUBLISHED', releasedAt: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    changelog: '<p>Compatibility release</p>', requirements: 'RAM 16 GB', screenshots: [{ src: '/og.svg' }],
    targets: [{ platform: 'Windows', architecture: 'arm64', minVersion: '11', notes: 'ARM test' }],
    links: [{ label: 'ARM installer', kind: 'DOWNLOAD', quality: '', size: '80 MB', url: 'https://example.invalid/arm64.exe', platform: 'Windows', architecture: 'arm64', checksum: 'a'.repeat(64), access: 'PUBLIC' }],
  }
  const invalid = await request('POST', '/api/admin/software/releases', { ...payload, links: [{ ...payload.links[0], checksum: 'bad' }] })
  assert.equal(invalid.status, 400, 'invalid per-file checksum rejected')
  const duplicate = await request('POST', '/api/admin/software/releases', { ...payload, targets: [payload.targets[0], payload.targets[0]] })
  assert.equal(duplicate.status, 400, 'duplicate OS/CPU rejected')
  const mismatched = await request('POST', '/api/admin/software/releases', { ...payload, links: [{ ...payload.links[0], architecture: 'x86' }] })
  assert.equal(mismatched.status, 400, 'file architecture must match release target')
  const created = await request('POST', '/api/admin/software/releases', payload)
  assert.equal(created.status, 201, created.status === 201 ? '' : await created.text())
  releaseId = (await created.json()).id
  const listed = await request('GET', `/api/admin/software/releases?softwareId=${softwareId}`)
  assert.equal(listed.status, 200)
  const row = (await listed.json()).releases[0]
  assert.equal(row.targets[0].architecture, 'arm64')
  assert.equal(row.links[0].checksum, 'a'.repeat(64))
  assert.equal(row.requirements, 'RAM 16 GB')
  const publicPage = await (await fetch(`http://127.0.0.1:3000/software/${slug}`, { signal: AbortSignal.timeout(45_000) })).text()
  const rendered = publicPage.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  assert.ok(rendered.includes('ARM test') && rendered.includes('RAM 16 GB') && rendered.includes('arm64') && rendered.includes('SHA-256'), 'public release shows compatibility and file hash')
  console.log('Software compatibility: admin validation/save/read and public metadata OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (releaseId) await db.mediaLink.deleteMany({ where: { ownerType: 'softwarerelease', ownerId: releaseId } })
  if (softwareId) await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  await db.$disconnect()
})
