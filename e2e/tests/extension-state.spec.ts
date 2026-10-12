import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'

test('compiled section settings retain concurrent fields and reject visitors', async ({ admin, request, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'owned PostgreSQL fixture required')
  const db = new PrismaClient(), keys = ['extension.store.state.v1', 'storeEnabled']
  const before = await db.setting.findMany({ where: { key: { in: keys } } })
  const stamp = `owned-section-${Date.now()}`
  try {
    const denied = await request.post('/api/admin/sections', { data: { id: 'store', settings: { 'seo.title': stamp } } }); expect(denied.status()).toBe(403)
    const responses = await Promise.all([
      admin.post('/api/admin/sections', { data: { id: 'store', settings: { 'seo.title': stamp } } }),
      admin.post('/api/admin/sections', { data: { id: 'store', settings: { 'seo.description': stamp + '-description' } } }),
    ])
    for (const response of responses) expect(response.status()).toBe(200)
    const response = await admin.get('/api/admin/sections?id=store'); expect(response.status()).toBe(200)
    const { section } = await response.json()
    expect(section.settings['seo.title']).toBe(stamp); expect(section.settings['seo.description']).toBe(stamp + '-description')
    const rendered = await admin.get('/admin/sections/store'); expect(rendered.status()).toBe(200)
    expect(await rendered.text()).toContain('store')
    const corrupt = '{"owned-corrupt":'
    await db.setting.update({ where: { key: keys[0] }, data: { value: corrupt } })
    const refused = await admin.post('/api/admin/sections', { data: { id: 'store', settings: { 'seo.title': 'must not overwrite' } } })
    expect(refused.status()).toBe(400)
    expect((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value).toBe(corrupt)
  } finally {
    for (const key of keys) { const row = before.find(item => item.key === key); if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) }
    await db.$disconnect()
  }
})
