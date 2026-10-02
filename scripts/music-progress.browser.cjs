// Run against the local Docker app: node --env-file=.env scripts/music-progress.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-progress-${Date.now()}`
let userId = 0
let artistId = 0
let browser

function silence(seconds = 20, sampleRate = 16000) {
  const bytes = seconds * sampleRate * 2
  const wav = Buffer.alloc(44 + bytes)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40)
  return wav
}

async function main() {
  assert.ok(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET is required')
  const staleUsers = await db.user.findMany({ where: { email: { startsWith: 'codex-progress-', endsWith: '@example.invalid' } }, select: { id: true, email: true } })
  for (const stale of staleUsers) {
    const slug = stale.email.slice(0, -'@example.invalid'.length)
    const tracks = await db.musicTrack.findMany({ where: { artist: { slug } }, select: { id: true } })
    await db.searchDocument.deleteMany({ where: { itemType: 'track', itemId: { in: tracks.map((track) => track.id) } } })
    await db.musicArtist.deleteMany({ where: { slug } })
    await db.user.delete({ where: { id: stale.id } })
  }
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  const artist = await db.musicArtist.create({ data: { slug: seed, name: 'Progress test artist' } })
  artistId = artist.id
  const track = await db.musicTrack.create({ data: { slug: `${seed}-track`, title: 'Progress test track', artistId: artist.id, audioUrl: '/progress-test.wav', duration: 20, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 1000) } })
  await db.musicListenHistory.create({ data: { userId, trackId: track.id, positionSeconds: 12, durationSeconds: 20, progressUpdatedAt: new Date() } })
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })

  const fallbackChrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(fallbackChrome) ? fallbackChrome : undefined) })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.route(`**/api/media/track/${track.id}*`, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silence() }))
  await page.goto(`http://127.0.0.1:3000/music/track/${track.slug}`)
  await page.locator('.mu-detail-hero .mu-pb').first().click()
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime >= 12, undefined, { timeout: 15000 })
  const resumedAt = await page.locator('audio').evaluate((audio) => audio.currentTime)
  assert.ok(resumedAt >= 12 && resumedAt < 20, `resume position was ${resumedAt}`)
  await page.waitForTimeout(1500)
  await page.locator('.mu-play-main').click()
  let row
  for (let i = 0; i < 20; i++) {
    row = await db.musicListenHistory.findUniqueOrThrow({ where: { userId_trackId: { userId, trackId: track.id } } })
    if (row.positionSeconds > 12) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(row.positionSeconds > 12)
  console.log('Music progress browser: server resume and pause sync OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (artistId) await db.musicArtist.delete({ where: { id: artistId } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
