// Real PostgreSQL import jobs, records and external ids around two films, read through the provenance reader.
// Only this script's jobs, records and films are created and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `iprov${Date.now()}`
const mod = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/modules/imports/server/provenance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(name => name === '@/platform/database/prisma' ? { db: prisma } : require(name), mod, mod.exports)
const { itemProvenance, IMPORTED_AS } = mod.exports
const M = 'cinemaTitle'

async function main() {
  assert.deepEqual([IMPORTED_AS['cinema-titles'], IMPORTED_AS.posts, IMPORTED_AS.pages], [M, 'post', undefined], 'kinds an import can make; a page is never imported')
  const film = await prisma.cinemaTitle.create({ data: { slug: `${seed}-film`, title: `${seed} imported`, kind: 'MOVIE', summary: 'from the file' } })
  const other = await prisma.cinemaTitle.create({ data: { slug: `${seed}-other`, title: `${seed} other`, kind: 'MOVIE' } })
  const row = id => prisma.cinemaTitle.findUnique({ where: { id } })
  assert.equal(await itemProvenance(M, film.id, await row(film.id)), null, 'an item no import touched has no provenance')

  const job = name => prisma.importJob.create({ data: { adapter: 'media.movies', fileName: `${seed}-${name}.csv`, createdById: 1, createdByEmail: `${seed}@example.invalid`, status: 'DONE' } })
  const record = (jobRow, index, entityId, action, changes, status = 'OK') => prisma.importRecord.create({ data: { jobId: jobRow.id, index, sourceKey: `tt${entityId}`, action, status, entityType: M, entityId, changes: JSON.stringify({ changes }) } })
  const first = await job('first')
  await record(first, 0, film.id, 'CREATE', [{ kind: 'created', entity: 'cinemaSeason', id: film.id, stamp: '2000-01-01T00:00:00.000Z' }, { kind: 'created', entity: M, id: film.id, stamp: film.updatedAt.toISOString() }])
  await record(first, 1, other.id, 'CREATE', [{ kind: 'created', entity: M, id: other.id, stamp: other.updatedAt.toISOString() }])
  await prisma.importRecord.create({ data: { jobId: first.id, index: 2, action: 'SKIP', entityType: M, entityId: film.id } })
  await prisma.importExternalRef.createMany({ data: [{ source: `${seed}-imdb`, entityType: 'media.movies', externalId: 'tt001', entityId: film.id, jobId: first.id }, { source: `${seed}-imdb`, entityType: 'media.movies', externalId: 'tt002', entityId: other.id, jobId: first.id }] })

  // ---- made by an import and untouched since
  let seen = await itemProvenance(M, film.id, await row(film.id))
  assert.deepEqual([seen.sources, seen.imports.map(item => [item.job, item.action, item.file, item.by, item.undone, item.fields]), seen.editedSince], [[{ source: `${seed}-imdb`, externalId: 'tt001' }], [[first.id, 'CREATE', `${seed}-first.csv`, `${seed}@example.invalid`, false, []]], false], 'its own id in the source and its own import; a skipped row and another film\'s are not its history')
  await new Promise(resolve => setTimeout(resolve, 15)); await prisma.cinemaTitle.update({ where: { id: film.id }, data: { summary: 'rewritten by staff' } })
  assert.equal((await itemProvenance(M, film.id, await row(film.id))).editedSince, true, 'edited here since the import made it')

  // ---- a later import updated two fields; staff then changed one of them
  const second = await job('second')
  await prisma.cinemaTitle.update({ where: { id: film.id }, data: { title: `${seed} updated`, year: 2020 } })
  await record(second, 0, film.id, 'UPDATE', [{ kind: 'updated', entity: M, id: film.id, before: { title: `${seed} imported`, year: null }, after: { title: `${seed} updated`, year: 2020 } }])
  seen = await itemProvenance(M, film.id, await row(film.id))
  assert.deepEqual([seen.imports.map(item => [item.job, item.action, item.fields]), seen.editedSince], [[[second.id, 'UPDATE', ['title', 'year']], [first.id, 'CREATE', []]], []], 'newest first; the item is as the last import left the fields it wrote')
  await prisma.cinemaTitle.update({ where: { id: film.id }, data: { title: `${seed} corrected by staff`, summary: 'another field' } })
  assert.deepEqual((await itemProvenance(M, film.id, await row(film.id))).editedSince, ['title'], 'only the fields the import wrote are compared: a re-import would overwrite exactly these edits')

  // ---- an import that was rolled back is shown as undone and is not what the item is compared with
  await prisma.importRecord.updateMany({ where: { jobId: second.id }, data: { status: 'ROLLED_BACK' } })
  seen = await itemProvenance(M, film.id, await row(film.id))
  assert.deepEqual([seen.imports.map(item => item.undone), seen.editedSince], [[true, false], true])
  assert.deepEqual((await itemProvenance(M, other.id, await row(other.id))).editedSince, false)
  assert.equal((await itemProvenance(M, film.id, null)).editedSince, false, 'an item that is gone is compared with nothing')
  console.log('PostgreSQL import provenance: the imports and source ids of an item, what staff edited since the last import by field, and rolled-back imports passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const jobs = (await prisma.importJob.findMany({ where: { createdByEmail: `${seed}@example.invalid` }, select: { id: true } })).map(item => item.id)
    await prisma.importExternalRef.deleteMany({ where: { source: { startsWith: seed } } }); await prisma.importRecord.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.importJob.deleteMany({ where: { id: { in: jobs } } })
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
