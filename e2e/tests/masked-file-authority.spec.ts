import { createServer } from 'node:http'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect } from '../helpers'

test('issued masked grants recheck account authority before actual upstream GET HEAD and range', async ({ admin, playwright, page, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.NEXTAUTH_SECRET, 'requires owned compiled PostgreSQL fixture')
  const db = new PrismaClient(), stamp = `e2e-mask-${Date.now()}`, hits: { method: string; url: string }[] = []
  // Four seconds of valid local PCM audio; no external provider or silent/error fallback proves playback.
  const sampleRate = 8000, samples = sampleRate * 4, bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 1200), 44 + i * 2)
  const server = createServer((req, res) => {
    hits.push({ method: req.method || '', url: req.url || '' })
    const ranged = req.headers.range === 'bytes=0-2'
    res.writeHead(ranged ? 206 : 200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': ranged ? 3 : bytes.length, ...(ranged ? { 'Content-Range': `bytes 0-2/${bytes.length}` } : {}) })
    res.end(req.method === 'HEAD' ? undefined : ranged ? bytes.subarray(0, 3) : bytes)
  })
  let userId = 0, artistId = 0, filmId = 0
  let signed: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined
  let guest: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined
  const previous = await db.setting.findUnique({ where: { key: 'downloads.config.v1' } })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Owned upstream was not started')
    const source = `http://127.0.0.1:${address.port}/folder/song.wav`
    expect((await admin.patch('/api/admin/downloads', { data: { enforceTokens: false, requireLogin: false, maskMode: 'external', maskExclude: [], cleanAudio: false, cleanVideo: false, cleanArchive: false } })).ok()).toBeTruthy()
    const user = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'fixture-only' } }); userId = user.id
    const artist = await db.musicArtist.create({ data: { slug: stamp, name: stamp } }); artistId = artist.id
    const track = await db.musicTrack.create({ data: { slug: stamp, title: stamp, artistId, audioUrl: source } })
    const film = await db.cinemaTitle.create({ data: { slug: stamp, title: stamp, kind: 'MOVIE' } }); filmId = film.id
    const link = await db.mediaLink.create({ data: { ownerType: 'title', ownerId: filmId, kind: 'DOWNLOAD', url: source } })
    const cookie = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(user.id), sub: String(user.id), role: user.role, authAt: Date.now() } })
    signed = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! }, storageState: { cookies: [{ name: '__Secure-next-auth.session-token', value: cookie, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } })
    guest = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } })
    const issued = async (context: typeof signed, path: string) => {
      const result = await context!.get(path, { maxRedirects: 0 })
      expect([302, 303, 307]).toContain(result.status())
      const url = result.headers().location
      expect(new URL(url, baseURL).pathname).toMatch(/^\/dl\//)
      return url
    }
    const music = await issued(signed, `/api/media/track/${track.id}`)
    const download = await issued(signed, `/api/media/link/${link.id}`)
    const anonymous = await issued(guest, `/api/media/track/${track.id}`)
    await page.context().addCookies([{ name: '__Secure-next-auth.session-token', value: cookie, domain: new URL(baseURL!).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
    await page.goto(`/music/track/${track.slug}`, { waitUntil: 'networkidle' })
    await page.locator('main button:has-text("پخش")').first().click({ force: true })
    await expect.poll(() => page.evaluate(() => { const audio = document.querySelector('audio'); return !!audio && !audio.paused && audio.currentTime > 0 && !audio.error }), { timeout: 20_000 }).toBe(true)
    await page.evaluate(() => document.querySelector('audio')?.pause())
    for (const url of [music, download]) {
      const response = await guest.get(url); expect(response.status()).toBe(200); expect(await response.body()).toEqual(bytes)
      expect(response.headers()['cache-control']).toBe('private, no-store')
      const head = await guest.head(url); expect(head.status()).toBe(200); expect((await head.body()).length).toBe(0)
      const range = await guest.get(url, { headers: { range: 'bytes=0-2', 'if-range': 'fixture' } }); expect(range.status()).toBe(206); expect(range.headers()['content-range']).toBe(`bytes 0-2/${bytes.length}`); expect(await range.body()).toEqual(bytes.subarray(0, 3))
    }
    const sibling = new URL(music, baseURL!); sibling.pathname = sibling.pathname.slice(0, sibling.pathname.lastIndexOf('/') + 1) + 'segment.ts'
    expect((await guest.get(sibling.toString())).status()).toBe(200); expect(hits.at(-1)?.url).toBe('/folder/segment.ts')
    const ban = await db.accessRestriction.create({ data: { userId, scope: 'GLOBAL', effectKey: 'identity.suspend', capabilities: '["identity.authenticate"]', reason: stamp } })
    const before = hits.length
    for (const url of [music, download, sibling.toString()]) {
      const denied = await guest.get(url, { headers: { range: 'bytes=0-2' } }); expect(denied.status()).toBe(423); expect(denied.headers()['cache-control']).toBe('no-store')
      expect((await guest.head(url)).status()).toBe(423)
    }
    expect(hits.length).toBe(before)
    expect((await guest.get(anonymous)).status()).toBe(200)
    // The previous protocol's writer has no human claim: existing links retain their embedded TTL.
    const iv = randomBytes(12), key = createHash('sha256').update(`${process.env.NEXTAUTH_SECRET}:masked-file-links:v1`).digest()
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const payload = JSON.stringify({ u: source, e: Math.floor(Date.now() / 1000) + 60, d: 0, n: 'song.wav' })
    const body = Buffer.concat([cipher.update(payload), cipher.final()]), legacy = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
    expect((await guest.get(`/dl/${legacy}/song.wav`)).status()).toBe(200)
    expect((await db.accessRestriction.updateMany({ where: { id: ban.id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: stamp } })).count).toBe(1)
    expect((await guest.get(music)).status()).toBe(200)
    await db.user.update({ where: { id: userId }, data: { status: 'BANNED' } })
    const standingBefore = hits.length; expect((await guest.get(download)).status()).toBe(423); expect(hits.length).toBe(standingBefore)
    await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } }); expect((await guest.get(download)).status()).toBe(200)
  } finally {
    await signed?.dispose(); await guest?.dispose()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    try {
      if (previous) await db.setting.upsert({ where: { key: previous.key }, create: { key: previous.key, value: previous.value }, update: { value: previous.value } })
      else await db.setting.deleteMany({ where: { key: 'downloads.config.v1' } })
      await db.mediaLink.deleteMany({ where: { ownerType: 'title', ownerId: filmId } })
      await db.cinemaTitle.deleteMany({ where: { id: filmId, slug: stamp } })
      await db.musicArtist.deleteMany({ where: { id: artistId, slug: stamp } })
      await db.accessRestriction.deleteMany({ where: { userId, reason: stamp } })
      await db.user.deleteMany({ where: { id: userId, email: `${stamp}@example.invalid` } })
    } finally { await db.$disconnect() }
  }
})
