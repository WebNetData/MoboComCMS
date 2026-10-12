import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test'
import { test, expect, openEmailLogin, watchErrors } from '../helpers'

// A section author posts in their section and manages only what they posted; a delete they ask for waits in the
// trash for the section's manager or the owner. Real routes, real sessions, PostgreSQL.

const owned = (baseURL: string | undefined) => process.env.MOBOCOM_ISOLATED_FIXTURE === '1' && baseURL === 'https://e2e.mobocom.test:3443'
const PASSWORD = 'Author-fixture-2026!'

async function signIn(browser: Browser, baseURL: string, email: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await openEmailLogin(page)
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASSWORD)
  await page.locator('form.auth-form button.btn-primary').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 })
  await page.close()
  return context
}

test('a section author manages only their own items and their deletes wait for a manager', async ({ admin, browser, request, baseURL }, testInfo) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  test.setTimeout(300_000)
  const db = new PrismaClient(), stamp = `e2eauthor${Date.now()}`
  const policy = await db.setting.findUnique({ where: { key: 'security.policy.v1' } })
  const users: { id: number; email: string }[] = []
  const contexts: BrowserContext[] = []
  const write = (api: APIRequestContext, method: 'post' | 'patch' | 'delete' | 'put', url: string, data?: unknown) => api[method](url, { headers: { Origin: baseURL! }, ...(data === undefined ? {} : { data }) })
  try {
    await db.setting.upsert({ where: { key: 'security.policy.v1' }, create: { key: 'security.policy.v1', value: '{"requireAdmin2fa":false}' }, update: { value: '{"requireAdmin2fa":false}' } })
    for (const name of ['anna', 'babak']) users.push(await db.user.create({ data: { email: `${stamp}-${name}@example.invalid`, name, passwordHash: bcrypt.hashSync(PASSWORD, 4), role: 'CUSTOMER' }, select: { id: true, email: true } }))
    const [anna, babak] = users

    // The owner names them: Anna writes in the magazine and music, Babak in the magazine only.
    const named = await admin.post('/api/admin/section-managers', { data: { email: anna.email, sections: ['magazine', 'music'], as: 'author' } })
    expect(named.status(), await named.text()).toBe(200)
    expect((await admin.post('/api/admin/section-managers', { data: { email: babak.email, sections: ['magazine'], as: 'author' } })).status()).toBe(200)
    expect((await admin.post('/api/admin/section-managers', { data: { email: babak.email, sections: ['forum'], as: 'author' } })).status(), 'the forum has no authors').toBe(400)
    const staff = (await (await admin.get('/api/admin/section-managers')).json()).staff as { id: number; kind: string; sections: string[]; authorOf: string[]; roleName: string }[]
    expect(staff.find((row) => row.id === anna.id)).toMatchObject({ kind: 'authors', sections: [], authorOf: ['magazine', 'music'], roleName: 'نویسندهٔ مجله و موزیک' })
    const role = await db.user.findUniqueOrThrow({ where: { id: anna.id }, select: { role: true, roleRef: { select: { name: true, permissions: true } } } })
    expect(role).toEqual({ role: 'ADMIN', roleRef: { name: 'authors:magazine+music', permissions: 'dashboard.view,journal.author,music.author' } })

    const annaContext = await signIn(browser, baseURL!, anna.email), babakContext = await signIn(browser, baseURL!, babak.email)
    contexts.push(annaContext, babakContext)
    const a = annaContext.request, b = babakContext.request

    // ---- the magazine
    const mine = await write(a, 'post', '/api/admin/cms?type=posts', { slug: `${stamp}-anna`, title: `نوشتهٔ آنا ${stamp}`, content: '<p>متن آنا</p>', status: 'PUBLISHED', featured: true })
    expect(mine.status(), await mine.text()).toBe(200)
    const annaPost = await mine.json()
    expect(annaPost).toMatchObject({ authorId: anna.id, status: 'PUBLISHED', featured: false })
    const theirs = await (await write(b, 'post', '/api/admin/cms?type=posts', { slug: `${stamp}-babak`, title: `نوشتهٔ بابک ${stamp}`, content: '<p>متن بابک</p>', status: 'DRAFT' })).json()
    expect(theirs.authorId).toBe(babak.id)
    expect((await write(a, 'post', '/api/admin/cms?type=posts', { slug: `${stamp}-t`, title: 'x', content: 'x', status: 'TRASHED' })).status(), 'the trash is not a status a form may send').toBe(400)

    const list = await (await a.get('/api/admin/cms?type=posts&paged=1')).json()
    expect(list.rows.map((row: { id: number }) => row.id)).toEqual([annaPost.id])
    expect(list).toMatchObject({ total: 1, overall: 1, published: 1, trashed: 0, mine: true })
    expect((await (await a.get('/api/admin/cms?type=posts')).json()).every((row: { authorId: number }) => row.authorId === anna.id)).toBe(true)
    expect(await (await a.get(`/api/admin/cms?type=posts&id=${theirs.id}`)).json(), 'another author\'s article is not there').toEqual([])
    expect((await write(a, 'patch', '/api/admin/cms?type=posts', { id: theirs.id, title: 'taken' })).status()).toBe(404)
    expect((await write(a, 'delete', `/api/admin/cms?type=posts&id=${theirs.id}`)).status()).toBe(404)
    expect((await (await write(a, 'post', '/api/admin/cms/bulk?type=posts', { ids: [theirs.id, annaPost.id], action: 'draft' })).json()).failed).toEqual([{ id: theirs.id, reason: 'not found' }])
    expect((await db.post.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(`نوشتهٔ بابک ${stamp}`)
    expect((await write(a, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, status: 'PUBLISHED', title: `نوشتهٔ آنا ${stamp} ۲` })).status()).toBe(200)

    // What an author does not get.
    expect((await a.get('/api/admin/cms?type=postcats')).status(), 'categories are read, to file an article').toBe(200)
    expect((await write(a, 'post', '/api/admin/cms?type=postcats', { slug: `${stamp}-cat`, name: 'x' })).status()).toBe(403)
    for (const url of ['/api/admin/cms?type=pages', '/api/admin/cms?type=products', '/api/admin/comments', '/api/admin/media-library?type=cinema-titles', '/api/admin/media-library?type=software', '/api/admin/section-managers', `/api/admin/history?type=posts&id=${annaPost.id}`]) expect((await a.get(url)).status(), url).toBe(403)
    expect((await b.get('/api/admin/media-library?type=music-tracks')).status(), 'a magazine author is not a music author').toBe(403)

    // The block editor: one's own article, not another's.
    expect((await a.get(`/api/admin/editor/posts/${annaPost.id}`)).status()).toBe(200)
    expect((await a.get(`/api/admin/editor/posts/${theirs.id}`)).status()).toBe(404)
    expect((await a.get('/api/admin/editor/pages/1')).status()).toBe(403)

    // ---- a delete asked by the author waits in the trash
    expect((await request.get(`/blog/${stamp}-anna`)).status()).toBe(200)
    const asked = await write(a, 'delete', `/api/admin/cms?type=posts&id=${annaPost.id}`)
    expect(await asked.json()).toEqual({ trashed: true })
    const waiting = await db.post.findUniqueOrThrow({ where: { id: annaPost.id } })
    expect(waiting).toMatchObject({ status: 'TRASHED', trashedStatus: 'PUBLISHED', trashedById: anna.id }); expect(waiting.trashedAt).not.toBeNull()
    expect((await request.get(`/blog/${stamp}-anna`)).status(), 'a trashed article is not public').toBe(404)
    expect((await write(a, 'delete', `/api/admin/cms?type=posts&id=${annaPost.id}`)).status()).toBe(409)
    expect((await write(a, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, title: 'edited in the trash' })).status()).toBe(409)
    expect((await write(a, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, restore: true })).status(), 'an author does not take it back').toBe(409)
    expect((await write(a, 'put', `/api/admin/editor/posts/${annaPost.id}`, { document: { version: 1, blocks: [] }, updatedAt: waiting.updatedAt.toISOString() })).status()).toBe(409)
    expect((await (await a.get('/api/admin/cms?type=posts&paged=1')).json()).trashed).toBe(1)
    expect((await (await write(admin, 'post', '/api/admin/cms/bulk?type=posts', { ids: [annaPost.id], action: 'publish' })).json()).failed, 'a status batch does not empty the trash').toEqual([{ id: annaPost.id, reason: 'in the trash' }])
    expect((await write(admin, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, title: 'edited in the trash' })).status()).toBe(409)

    // The manager puts it back exactly as it was …
    const back = await write(admin, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, restore: true })
    expect(back.status(), await back.text()).toBe(200)
    expect(await db.post.findUniqueOrThrow({ where: { id: annaPost.id } })).toMatchObject({ status: 'PUBLISHED', trashedStatus: '', trashedAt: null, trashedById: null })
    expect((await request.get(`/blog/${stamp}-anna`)).status()).toBe(200)
    expect((await write(admin, 'patch', '/api/admin/cms?type=posts', { id: annaPost.id, restore: true })).status()).toBe(409)
    // … or deletes it for good.
    expect(await (await write(a, 'post', '/api/admin/cms/bulk?type=posts', { ids: [annaPost.id], action: 'delete' })).json()).toEqual({ changed: 1, failed: [] })
    expect((await db.post.findUniqueOrThrow({ where: { id: annaPost.id } })).status).toBe('TRASHED')
    expect((await write(admin, 'delete', `/api/admin/cms?type=posts&id=${annaPost.id}`)).status()).toBe(200)
    expect(await db.post.count({ where: { id: annaPost.id } })).toBe(0)

    // ---- music, through the shared media owner
    const artist = await write(a, 'post', '/api/admin/media-library?type=music-artists', { name: `هنرمند ${stamp}`, slug: `${stamp}-artist` })
    expect(artist.status(), await artist.text()).toBe(201)
    const artistId = (await artist.json()).id
    const track = await write(a, 'post', '/api/admin/media-library?type=music-tracks', { title: `آهنگ ${stamp}`, slug: `${stamp}-track`, artistId, status: 'PUBLISHED' })
    expect(track.status(), await track.text()).toBe(201)
    const trackId = (await track.json()).id
    expect(await db.musicTrack.findUniqueOrThrow({ where: { id: trackId }, select: { createdById: true, status: true } })).toEqual({ createdById: anna.id, status: 'PUBLISHED' })
    const foreign = await db.musicTrack.create({ data: { title: `آهنگ دیگران ${stamp}`, slug: `${stamp}-foreign`, artistId, status: 'PUBLISHED' } })
    const tracks = await (await a.get('/api/admin/media-library?type=music-tracks&paged=1')).json()
    expect(tracks.rows.map((row: { id: number }) => row.id)).toEqual([trackId]); expect(tracks).toMatchObject({ total: 1, overall: 1, mine: true })
    expect((await write(a, 'patch', '/api/admin/media-library?type=music-tracks', { id: foreign.id, title: 'taken' })).status()).toBe(404)
    expect((await write(a, 'delete', `/api/admin/media-library?type=music-tracks&id=${foreign.id}`)).status()).toBe(404)
    expect((await write(a, 'patch', '/api/admin/media-library?type=music-tracks', { id: trackId, title: `آهنگ ${stamp} ۲` })).status()).toBe(200)
    expect((await write(a, 'patch', '/api/admin/media-library?type=music-tracks', { id: trackId, status: 'TRASHED' })).status()).toBe(400)
    expect((await write(a, 'delete', `/api/admin/media-library?type=music-artists&id=${artistId}`)).status(), 'an artist is a shared name: only a manager deletes it').toBe(403)
    expect(await (await write(a, 'delete', `/api/admin/media-library?type=music-tracks&id=${trackId}`)).json()).toEqual({ trashed: true })
    expect(await db.musicTrack.findUniqueOrThrow({ where: { id: trackId }, select: { status: true, trashedStatus: true, trashedById: true } })).toEqual({ status: 'TRASHED', trashedStatus: 'PUBLISHED', trashedById: anna.id })
    expect((await request.get(`/music/track/${stamp}-track`)).status()).toBe(404)
    expect((await write(a, 'patch', '/api/admin/media-library?type=music-tracks', { id: trackId, title: 'x' })).status()).toBe(409)
    expect((await write(admin, 'patch', '/api/admin/media-library?type=music-tracks', { id: trackId, restore: true })).status()).toBe(200)
    expect((await db.musicTrack.findUniqueOrThrow({ where: { id: trackId } })).status).toBe('PUBLISHED')
    expect((await request.get(`/music/track/${stamp}-track`)).status()).toBe(200)
    expect(await (await write(a, 'delete', `/api/admin/media-library?type=music-tracks&id=${trackId}`)).json()).toEqual({ trashed: true })
    expect((await write(admin, 'delete', `/api/admin/media-library?type=music-tracks&id=${trackId}`)).status()).toBe(200)
    expect(await db.musicTrack.count({ where: { id: trackId } })).toBe(0)

    // ---- the database holds the trash rule too
    await expect(db.post.update({ where: { id: theirs.id }, data: { status: 'TRASHED' } })).rejects.toThrow()
    await expect(db.musicTrack.update({ where: { id: foreign.id }, data: { trashedAt: new Date() } })).rejects.toThrow()

    // ---- what the author sees
    const page = await annaContext.newPage(), errors = watchErrors(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/admin/posts')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByText(`نوشتهٔ بابک ${stamp}`)).toHaveCount(0)
    const menu = page.locator('nav, aside').first()
    await expect(menu.getByRole('link', { name: 'نوشته‌ها' })).toBeVisible()
    for (const closed of ['دیدگاه‌ها', 'دسته‌بندی مطالب', 'فروشگاه', 'تالار گفتمان']) await expect(menu.getByRole('link', { name: closed, exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('author-posts-1440.png'), fullPage: true })
    expect(errors).toEqual([])

    await expect(page.getByRole('button', { name: 'درخواست حذف' }).first()).toBeVisible()
    await page.close()

    // ---- film and series, and software: the same owner, the same rule
    expect((await admin.post('/api/admin/section-managers', { data: { userId: babak.id, sections: ['magazine', 'cinema', 'software'], as: 'author' } })).status()).toBe(200)
    for (const [type, body, model] of [['cinema-titles', { title: `فیلم ${stamp}`, slug: `${stamp}-film`, kind: 'MOVIE', status: 'PUBLISHED' }, 'cinemaTitle'], ['software', { title: `نرم‌افزار ${stamp}`, slug: `${stamp}-app`, status: 'DRAFT' }, 'softwareTitle']] as const) {
      const made = await write(b, 'post', `/api/admin/media-library?type=${type}`, body)
      expect(made.status(), `${type}: ${await made.text()}`).toBe(201)
      const id = (await made.json()).id
      const delegate = db[model] as unknown as { findUniqueOrThrow: (args: object) => Promise<{ createdById: number | null; status: string; trashedStatus: string }>; count: (args: object) => Promise<number> }
      expect((await delegate.findUniqueOrThrow({ where: { id } })).createdById, type).toBe(babak.id)
      expect((await a.get(`/api/admin/media-library?type=${type}`)).status(), `${type}: an author of other sections`).toBe(403)
      expect(await (await write(b, 'delete', `/api/admin/media-library?type=${type}&id=${id}`)).json(), type).toEqual({ trashed: true })
      expect(await delegate.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'TRASHED', trashedStatus: body.status })
      expect((await write(b, 'patch', `/api/admin/media-library?type=${type}`, { id, title: 'x' })).status(), type).toBe(409)
      expect((await write(admin, 'patch', `/api/admin/media-library?type=${type}`, { id, restore: true })).status(), type).toBe(200)
      expect((await delegate.findUniqueOrThrow({ where: { id } })).status, type).toBe(body.status)
      expect(await (await write(b, 'post', `/api/admin/media-library/bulk?type=${type}`, { ids: [id], action: 'delete' })).json(), type).toEqual({ changed: 1, failed: [] })
      expect((await write(admin, 'delete', `/api/admin/media-library?type=${type}&id=${id}`)).status(), type).toBe(200)
      expect(await delegate.count({ where: { id } }), type).toBe(0)
    }

    // ---- what the manager sees: the request in the overview and on the section's list, and the two decisions
    const waitingPost = await (await write(b, 'post', '/api/admin/cms?type=posts', { slug: `${stamp}-wait`, title: `منتظر تصمیم ${stamp}`, content: '<p>x</p>', status: 'PUBLISHED' })).json()
    expect(await (await write(b, 'delete', `/api/admin/cms?type=posts&id=${waitingPost.id}`)).json()).toEqual({ trashed: true })
    const overview = await (await admin.get('/api/admin/moderation')).json()
    const trashGroup = overview.groups.find((group: { key: string }) => group.key === 'trash-posts')
    expect(trashGroup.items.map((item: { id: number; by: string }) => [item.id, item.by])).toContainEqual([waitingPost.id, 'babak'])
    expect((await b.get('/api/admin/moderation')).status(), 'an author has no queue').toBe(403)
    const ownerContext = await browser.newContext({ baseURL, storageState: (await import('../paths')).ADMIN_STATE, ignoreHTTPSErrors: true })
    contexts.push(ownerContext)
    const ownerPage = await ownerContext.newPage(), ownerErrors = watchErrors(ownerPage)
    await ownerPage.setViewportSize({ width: 1440, height: 1000 })
    await ownerPage.goto('/admin/moderation')
    await expect(ownerPage.getByRole('region', { name: 'سطل زباله: نوشته‌های مجله' }).getByText(`منتظر تصمیم ${stamp}`).first()).toBeVisible()
    await ownerPage.goto(`/admin/posts`)
    await ownerPage.getByRole('searchbox').first().fill(`${stamp}-wait`)
    const row = ownerPage.getByRole('row').filter({ hasText: `منتظر تصمیم ${stamp}` })
    await expect(row.getByText('در سطل زباله')).toBeVisible()
    await expect(row.getByRole('button', { name: 'حذف نهایی' })).toBeVisible()
    await ownerPage.screenshot({ path: testInfo.outputPath('manager-trash-1440.png'), fullPage: true })
    await row.getByRole('button', { name: 'بازگردانی' }).click()
    await expect(row.getByText('در سطل زباله')).toHaveCount(0)
    expect((await db.post.findUniqueOrThrow({ where: { id: waitingPost.id } })).status).toBe('PUBLISHED')
    await ownerPage.goto('/admin/section-managers')
    await expect(ownerPage.getByTestId('authors-of-magazine')).toContainText('babak')
    await expect(ownerPage.getByRole('form', { name: 'افزودن نویسنده' }).getByRole('checkbox')).toHaveCount(4)
    await ownerPage.screenshot({ path: testInfo.outputPath('section-authors-page-1440.png'), fullPage: true })
    expect(ownerErrors).toEqual([])

    // ---- taking the group away takes the access away at once
    expect((await admin.post('/api/admin/section-managers', { data: { userId: anna.id, sections: [], as: 'author' } })).status()).toBe(200)
    expect(await db.user.findUniqueOrThrow({ where: { id: anna.id }, select: { role: true, roleId: true } })).toEqual({ role: 'CUSTOMER', roleId: null })
    expect((await a.get('/api/admin/cms?type=posts')).status()).toBe(403)
  } finally {
    for (const context of contexts) await context.close().catch(() => null)
    try {
      const ids = users.map((user) => user.id)
      await db.post.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.musicTrack.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.musicArtist.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.cinemaTitle.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.softwareTitle.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetType: "user", targetId: { in: ids.map(String) } }] } })
      await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => null)
      if (policy) await db.setting.update({ where: { key: policy.key }, data: { value: policy.value } }); else await db.setting.deleteMany({ where: { key: 'security.policy.v1' } })
    } finally { await db.$disconnect() }
  }
})
