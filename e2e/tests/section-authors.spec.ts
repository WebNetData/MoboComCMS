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
    // The author is told what was decided, once per request; the manager who decided is not.
    const notices = (userId: number) => db.userNotification.findMany({ where: { userId, kind: 'TRASH_DECISION' }, orderBy: { id: 'asc' }, select: { dedupeKey: true, titleFa: true, bodyFa: true, href: true } })
    const decision = (row: { dedupeKey: string }) => row.dedupeKey.split(':').slice(-1)[0]
    expect((await notices(anna.id)).map((row) => [row.dedupeKey.startsWith(`trash:post:${annaPost.id}:`), decision(row), row.href])).toEqual([[true, 'restored', '/admin/posts']])
    expect((await notices(anna.id))[0].bodyFa).toContain(`نوشتهٔ آنا ${stamp} ۲`)
    // … or deletes it for good.
    expect(await (await write(a, 'post', '/api/admin/cms/bulk?type=posts', { ids: [annaPost.id], action: 'delete' })).json()).toEqual({ changed: 1, failed: [] })
    expect((await db.post.findUniqueOrThrow({ where: { id: annaPost.id } })).status).toBe('TRASHED')
    expect((await write(admin, 'delete', `/api/admin/cms?type=posts&id=${annaPost.id}`)).status()).toBe(200)
    expect(await db.post.count({ where: { id: annaPost.id } })).toBe(0)
    expect((await notices(anna.id)).map(decision), 'the second request gets its own answer').toEqual(['restored', 'deleted'])

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
    expect((await notices(anna.id)).filter((row) => row.dedupeKey.startsWith(`trash:music-tracks:${trackId}:`)).map((row) => [decision(row), row.href])).toEqual([['restored', '/admin/music/library'], ['deleted', '/admin/music/library']])

    // ---- the database holds the trash rule too
    await expect(db.post.update({ where: { id: theirs.id }, data: { status: 'TRASHED' } })).rejects.toThrow()
    await expect(db.musicTrack.update({ where: { id: foreign.id }, data: { trashedAt: new Date() } })).rejects.toThrow()

    // ---- what the author sees
    expect((await write(a, 'post', '/api/admin/cms?type=posts', { slug: `${stamp}-anna-second`, title: `نوشتهٔ دوم آنا ${stamp}`, content: '<p>x</p>', status: 'DRAFT' })).status()).toBe(200)
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

    // ---- games: an admin of its own, the same rule
    expect((await a.get('/api/admin/games/list')).status(), 'not a games author').toBe(403)
    expect((await admin.post('/api/admin/section-managers', { data: { userId: babak.id, sections: ['magazine', 'cinema', 'software', 'games'], as: 'author' } })).status()).toBe(200)
    const madeGame = await write(b, 'post', '/api/admin/media-library?type=games', { title: `بازی ${stamp}`, slug: `${stamp}-game`, status: 'PUBLISHED' })
    expect(madeGame.status(), await madeGame.text()).toBe(201)
    const gameId = (await madeGame.json()).id
    expect((await db.gameTitle.findUniqueOrThrow({ where: { id: gameId } })).createdById).toBe(babak.id)
    const foreignGame = await db.gameTitle.create({ data: { title: `بازی دیگران ${stamp}`, slug: `${stamp}-foreign-game`, status: 'PUBLISHED' } })
    const gameList = await (await b.get(`/api/admin/games/list?q=${stamp}`)).json()
    expect(gameList.games.map((game: { id: number }) => game.id)).toEqual([gameId]); expect(gameList).toMatchObject({ mine: true, counts: { all: 1, published: 1, trashed: 0 } })
    expect((await (await admin.get(`/api/admin/games/list?q=${stamp}`)).json()).games.length, 'the manager sees both').toBe(2)
    // Batches act on one's own games only, and featuring is the manager's.
    expect((await write(b, 'post', '/api/admin/games/list', { ids: [gameId], action: 'feature' })).status()).toBe(403)
    expect((await write(b, 'post', '/api/admin/games/list', { ids: [gameId], action: 'restore' })).status()).toBe(403)
    expect(await (await write(b, 'post', '/api/admin/games/list', { ids: [foreignGame.id, gameId], action: 'draft' })).json()).toEqual({ changed: 1 })
    expect((await db.gameTitle.findUniqueOrThrow({ where: { id: foreignGame.id } })).status).toBe('PUBLISHED')
    expect(await (await write(b, 'post', '/api/admin/games/list', { ids: [gameId], action: 'publish' })).json()).toEqual({ changed: 1 })
    expect((await write(b, 'patch', '/api/admin/media-library?type=games', { id: foreignGame.id, title: 'taken' })).status()).toBe(404)
    // Updates and DLC belong to a game: one's own, not another's.
    const patch = await write(b, 'post', '/api/admin/games/updates', { gameId, title: `وصلهٔ ${stamp}`, version: '1.1', kind: 'UPDATE' })
    expect(patch.status(), await patch.text()).toBe(201)
    expect((await (await b.get(`/api/admin/games/updates?gameId=${gameId}`)).json()).updates.length).toBe(1)
    expect((await b.get(`/api/admin/games/updates?gameId=${foreignGame.id}`)).status()).toBe(404)
    expect((await write(b, 'post', '/api/admin/games/updates', { gameId: foreignGame.id, title: 'taken update' })).status()).toBe(404)
    expect((await b.get('/api/admin/games/franchises')).status(), 'franchise names are read, to file a game').toBe(200)
    expect((await write(b, 'post', '/api/admin/games/franchises', { title: 'x franchise', slug: `${stamp}-fr` })).status()).toBe(403)
    for (const url of ['/api/admin/games/dashboard', '/api/admin/games/releases', '/api/admin/games/settings']) expect((await b.get(url)).status(), url).toBe(403)
    expect((await write(b, 'post', '/api/admin/games/releases', { id: gameId, releaseDate: '2027-01-01' })).status()).toBe(403)
    // The author's delete is a trash request; nothing about the game changes while it waits.
    expect((await request.get(`/games/${stamp}-game`)).status()).toBe(200)
    expect(await (await write(b, 'post', '/api/admin/games/list', { ids: [gameId, foreignGame.id], action: 'delete' })).json()).toEqual({ changed: 1, trashed: true })
    expect(await db.gameTitle.findUniqueOrThrow({ where: { id: gameId }, select: { status: true, trashedStatus: true, trashedById: true } })).toEqual({ status: 'TRASHED', trashedStatus: 'PUBLISHED', trashedById: babak.id })
    expect(await db.gameTitle.count({ where: { id: foreignGame.id } }), 'another author\'s game is untouched').toBe(1)
    expect((await request.get(`/games/${stamp}-game`)).status()).toBe(404)
    expect((await write(b, 'post', '/api/admin/games/updates', { gameId, title: 'while in the trash' })).status()).toBe(409)
    expect((await write(b, 'patch', '/api/admin/media-library?type=games', { id: gameId, title: 'x' })).status()).toBe(409)
    expect(await (await write(b, 'post', '/api/admin/games/list', { ids: [gameId], action: 'draft' })).json(), 'a status batch does not empty the trash').toEqual({ changed: 0 })
    expect(await (await write(admin, 'post', '/api/admin/games/list', { ids: [gameId], action: 'publish' })).json()).toEqual({ changed: 0 })
    expect((await (await admin.get('/api/admin/games/list?status=trashed')).json()).games.map((game: { id: number }) => game.id)).toContain(gameId)
    // What the author and the manager see on the games screens.
    const gamesPage = await babakContext.newPage(), gamesErrors = watchErrors(gamesPage)
    await gamesPage.setViewportSize({ width: 1440, height: 1000 })
    await gamesPage.goto('/admin/games/titles')
    const gameRow = gamesPage.getByRole('row').filter({ hasText: `بازی ${stamp}` })
    await expect(gameRow.getByText('در سطل زباله')).toBeVisible()
    await expect(gameRow.getByText('منتظر تصمیم مدیر بخش')).toBeVisible()
    await expect(gamesPage.getByText(`بازی دیگران ${stamp}`)).toHaveCount(0)
    await expect(gamesPage.getByRole('navigation', { name: 'بخش‌های مدیریت بازی' }).getByRole('link')).toHaveText(['بازی‌ها'])
    await gamesPage.screenshot({ path: testInfo.outputPath('author-games-1440.png'), fullPage: true })
    expect(gamesErrors).toEqual([])
    await gamesPage.close()
    const managerGames = await browser.newContext({ baseURL, storageState: (await import('../paths')).ADMIN_STATE, ignoreHTTPSErrors: true })
    contexts.push(managerGames)
    const managerGamesPage = await managerGames.newPage()
    await managerGamesPage.setViewportSize({ width: 1440, height: 1000 })
    await managerGamesPage.goto('/admin/games/titles?status=trashed')
    const trashedRow = managerGamesPage.getByRole('row').filter({ hasText: `بازی ${stamp}` })
    await expect(trashedRow.getByRole('button', { name: 'حذف نهایی' })).toBeVisible()
    await managerGamesPage.screenshot({ path: testInfo.outputPath('manager-games-trash-1440.png'), fullPage: true })
    await trashedRow.getByRole('button', { name: 'بازگردانی' }).click()
    await expect(managerGamesPage.getByText('از سطل زباله برگشت.')).toBeVisible()
    expect(await db.gameTitle.findUniqueOrThrow({ where: { id: gameId }, select: { status: true, trashedStatus: true, trashedAt: true } })).toEqual({ status: 'PUBLISHED', trashedStatus: '', trashedAt: null })
    expect((await request.get(`/games/${stamp}-game`)).status()).toBe(200)
    expect((await (await write(b, 'post', '/api/admin/games/list', { ids: [gameId], action: 'delete' })).json()).trashed).toBe(true)
    expect(await (await write(admin, 'post', '/api/admin/games/list', { ids: [gameId], action: 'delete' })).json()).toEqual({ changed: 1 })
    expect(await db.gameTitle.count({ where: { id: gameId } })).toBe(0)
    expect(await db.gameUpdate.count({ where: { gameId } }), 'its updates go with it').toBe(0)
    expect((await notices(babak.id)).filter((row) => row.dedupeKey.startsWith(`trash:games:${gameId}:`)).map((row) => [decision(row), row.href])).toEqual([['restored', '/admin/games/titles'], ['deleted', '/admin/games/titles']])
    // A manager's own delete of something nobody asked to delete tells nobody.
    expect(await db.userNotification.count({ where: { kind: 'TRASH_DECISION', userId: { notIn: [anna.id, babak.id] }, dedupeKey: { contains: stamp } } })).toBe(0)

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
    await expect(ownerPage.getByRole('form', { name: 'افزودن نویسنده' }).getByRole('checkbox')).toHaveCount(5)
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
      await db.gameTitle.deleteMany({ where: { slug: { startsWith: stamp } } })
      await db.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetType: "user", targetId: { in: ids.map(String) } }] } })
      await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => null)
      if (policy) await db.setting.update({ where: { key: policy.key }, data: { value: policy.value } }); else await db.setting.deleteMany({ where: { key: 'security.policy.v1' } })
    } finally { await db.$disconnect() }
  }
})
