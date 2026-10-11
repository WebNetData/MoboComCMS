import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../helpers'

test('disabled or corrupt modules reject direct calls while Core recovery and valid sections remain', async ({ admin, request, page, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'owned PostgreSQL fixture required')
  const db = new PrismaClient()
  const manifests = fs.readdirSync('src/plugins').flatMap(id => {
    const file = path.join('src/plugins', id, 'manifest.json')
    return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : []
  }).filter(m => m.kind === 'module') as { id: string; stateSetting?: string }[]
  const keys = [...manifests.map(m => `extension.${m.id}.state.v1`), ...manifests.flatMap(m => m.stateSetting ? [m.stateSetting] : [])]
  const before = await db.setting.findMany({ where: { key: { in: keys } } })
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  try {
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'forum', enabled: false } })).status()).toBe(200)
    expect((await request.get('/forum')).status()).toBe(404)
    expect((await request.post('/api/forum/threads', { headers: { Origin: baseURL! }, data: {} })).status()).toBe(404)
    expect((await admin.get('/api/admin/forum')).status()).toBe(404)
    const corrupt = '{"owned-corrupt":'
    await set('extension.forum.state.v1', corrupt)
    expect((await request.get('/forum')).status()).toBe(404)
    expect((await admin.get('/api/admin/forum')).status()).toBe(404)
    expect((await db.setting.findUniqueOrThrow({ where: { key: 'extension.forum.state.v1' } })).value).toBe(corrupt)
    await set('extension.music.state.v1', '{"enabled":true,"settings":{}}')
    expect((await request.get('/music')).status()).toBe(200)
    await set('extension.store.state.v1', corrupt); await set('storeEnabled', 'true')
    expect((await request.get('/products')).status()).toBe(404)
    expect((await admin.get('/api/admin/extensions')).status()).toBe(200)
    for (const manifest of manifests) {
      await set(`extension.${manifest.id}.state.v1`, '{"enabled":false,"settings":{}}')
      if (manifest.stateSetting) await set(manifest.stateSetting, 'false')
    }
    expect((await page.goto('/'))?.status()).toBe(200)
    expect((await request.get('/music')).status()).toBe(404)
    expect((await request.get('/forum')).status()).toBe(404)
    expect((await request.get('/products')).status()).toBe(404)
    expect((await admin.get('/api/admin/extensions')).status()).toBe(200)
    await page.waitForLoadState('networkidle'); expect(errors).toEqual([])
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'forum', enabled: true } })).status()).toBe(200)
    expect((await request.get('/forum')).status()).toBe(200)
    expect((await request.get('/music')).status()).toBe(404)
  } finally {
    for (const key of keys) { const row = before.find(r => r.key === key); if (row) await set(key, row.value); else await db.setting.deleteMany({ where: { key } }) }
    await db.$disconnect()
  }
})
