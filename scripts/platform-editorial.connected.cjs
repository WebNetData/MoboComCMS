// Connected PostgreSQL proof for Journal's bounded editorial calendar and existing quality rules.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const loadSource = require('./connected-source-loader.cjs')

const db = new PrismaClient()
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
const stamp = `editorial-${Date.now().toString(36)}`

async function main() {
  const now = new Date('2030-06-01T20:29:00.000Z') // 23:59 Tehran: the next minute belongs to the next local date.
  const withinWindow = new Date(now.getTime() + 2 * 60 * 60_000)
  const outsideWindow = new Date(now.getTime() + 16 * 86_400_000)
  try {
    const current = await db.post.create({
      data: { slug: `${stamp}-scheduled`, title: `${stamp} scheduled`, content: '<p>short</p>', excerpt: '', cover: '', status: 'PUBLISHED', publishedAt: withinWindow },
      select: { id: true, publishedAt: true },
    })
    const beyond = await db.post.create({
      data: { slug: `${stamp}-beyond`, title: `${stamp} beyond`, content: 'x'.repeat(800), excerpt: 'A sufficiently complete excerpt for the check.', cover: '/fixture.jpg', status: 'PUBLISHED', publishedAt: outsideWindow },
      select: { id: true },
    })
    await db.post.createMany({ data: Array.from({ length: 51 }, (_, index) => ({ slug: `${stamp}-bulk-${index}`, title: 'Bounded schedule fixture', content: 'x', status: 'PUBLISHED', publishedAt: new Date(withinWindow.getTime() + (index + 1) * 1000) })) })
    const { journalDashboard } = loadSource({ '@/platform/database/prisma': { db } })('src/modules/journal/server/admin.ts')
    const result = await journalDashboard(now)
    const calendar = result.editorialCalendar
    assert.equal(calendar.days.length, 14, 'the calendar contains exactly fourteen Tehran dates')
    assert.equal(calendar.limit, 50)
    assert.equal(calendar.checkedCount, 50)
    assert.equal(calendar.hasMore, true, 'detailed inspection stays bounded while day counts remain exact')
    assert.equal(calendar.hasMore, calendar.scheduledCount > calendar.checkedCount)
    const windowEnd = new Date(new Date(`${calendar.days[13].day}T00:00:00.000+03:30`).getTime() + 86_400_000)
    assert.equal(calendar.scheduledCount, await db.post.count({ where: { status: 'PUBLISHED', publishedAt: { gt: now, lt: windowEnd } } }))
    assert.equal(calendar.days.reduce((sum, day) => sum + day.count, 0), calendar.scheduledCount, 'daily exact counts sum to the window count')
    const scheduled = calendar.days.flatMap((day) => day.posts)
    const included = scheduled.find((post) => post.id === current.id)
    assert.ok(included, 'the near scheduled post is listed')
    assert(calendar.days.find(day => day.day === '2030-06-02').posts.some(post => post.id === current.id), 'calendar grouping follows Tehran midnight rather than UTC')
    assert.deepEqual(included.issues.map((issue) => issue.key), ['cover', 'excerpt', 'category', 'short'], 'attention uses the existing factual quality rules')
    assert.ok(!scheduled.some((post) => post.id === beyond.id), 'posts beyond the fourteen-day window are excluded')
    assert.ok(calendar.quality.some((post) => post.id === current.id), 'the quality attention list links the same scheduled item')
    assert.deepEqual(await db.post.findUniqueOrThrow({ where: { id: current.id }, select: { status: true, publishedAt: true } }), { status: 'PUBLISHED', publishedAt: withinWindow }, 'reading the calendar does not publish or alter a scheduled item')
    console.log(`Journal editorial calendar: ${calendar.scheduledCount} scheduled within fourteen days; ${calendar.checkedCount} inspected; exact daily counts and existing quality findings agree`)
  } finally {
    await db.post.deleteMany({ where: { slug: { startsWith: stamp } } })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
