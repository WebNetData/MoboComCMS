// Real PostgreSQL roles. The data migration that told the magazine permission apart from the sections it used
// to open is run on roles made for this test. Everything happens inside one transaction that is rolled back at
// the end, so neither these roles nor the database's own roles are left changed by the test.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `ppm${Date.now()}`
const statements = fs.readFileSync(path.resolve(__dirname, '..', 'prisma/migrations/20261203120000_posts_permission_is_the_magazine/migration.sql'), 'utf8').split('\n').filter(line => line.startsWith('UPDATE '))
const OPENED = ['music.manage', 'cinema.manage', 'games.manage', 'software.manage', 'forum.moderate', 'reviews.moderate']
const ROLLBACK = new Error('rolled back on purpose')

async function main() {
  assert.equal(statements.length, OPENED.length)
  await prisma.$transaction(async tx => {
    const run = async () => { for (const sql of statements) await tx.$executeRawUnsafe(sql) }
    const list = async name => (await tx.role.findUnique({ where: { name: `${seed}-${name}` } })).permissions.split(',').map(item => item.trim())
    const all = () => tx.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, permissions: true } })
    const roles = {
      editor: 'dashboard.view,cms.posts',                        // the old "content" role: must keep every section
      spaced: 'dashboard.view, cms.posts , music.manage',        // typed by hand, already holds one of them
      music: 'dashboard.view,music.manage',                      // never held cms.posts: nothing to give
      lookalike: 'dashboard.view,xcms.posts,cms.postsx',         // names that merely contain it
      full: '*',                                                 // full access needs nothing
      pages: 'dashboard.view,cms.pages,cms.products',
      star: '*,cms.posts',                                       // full access written beside it: still nothing to add
    }
    for (const [name, permissions] of Object.entries(roles)) await tx.role.create({ data: { name: `${seed}-${name}`, permissions } })

    await run()
    assert.deepEqual(await list('editor'), ['dashboard.view', 'cms.posts', ...OPENED], 'a role that held cms.posts keeps everything it used to open')
    const spaced = await list('spaced')
    assert.deepEqual([spaced.filter(item => item === 'music.manage').length, OPENED.every(item => spaced.includes(item)), spaced.includes('cms.posts')], [1, true, true], 'what it already held is not given twice')
    assert.deepEqual(await list('music'), ['dashboard.view', 'music.manage'], 'a role without cms.posts is left alone')
    assert.deepEqual(await list('lookalike'), ['dashboard.view', 'xcms.posts', 'cms.postsx'], 'only the exact permission counts')
    assert.deepEqual(await list('full'), ['*'])
    assert.deepEqual(await list('pages'), ['dashboard.view', 'cms.pages', 'cms.products'])
    assert.deepEqual(await list('star'), ['*', 'cms.posts'], 'a full-access role is not rewritten')

    // ---- safe to run again: the second time changes no role at all, these or the database's own
    const once = await all()
    await run()
    assert.deepEqual(await all(), once)
    throw ROLLBACK
  }, { timeout: 30_000 }).catch(error => { if (error !== ROLLBACK) throw error })
  assert.equal(await prisma.role.count({ where: { name: { startsWith: seed } } }), 0, 'the test left nothing behind')
  console.log('PostgreSQL posts-permission migration: roles holding cms.posts keep what it opened, nothing is given twice, other roles are untouched, and it is safe to repeat passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
