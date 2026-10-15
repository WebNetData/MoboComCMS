// Apply the actual SQL to a populated owned schema; never reconstruct or reset the current database.
const fs = require('node:fs'), assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), schema = `owned_business_requests_${Date.now()}`
const scoped = work => db.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`); return work(tx) })
async function main() {
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await scoped(async tx => {
      await tx.$executeRawUnsafe('CREATE TABLE "User" ("id" INTEGER PRIMARY KEY)')
      await tx.$executeRawUnsafe('CREATE TABLE "BusinessProfile" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)')
      await tx.$executeRawUnsafe('INSERT INTO "User" VALUES (11), (12)')
      await tx.$executeRawUnsafe('INSERT INTO "BusinessProfile" VALUES (21, \'Existing business survives\')')
      const sql = fs.readFileSync('prisma/migrations/20270102120000_business_requests/migration.sql', 'utf8')
      for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "BusinessProfile"'), [{ id: 21, name: 'Existing business survives' }])
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "User" ORDER BY "id"'), [{ id: 11 }, { id: 12 }])
      await tx.$executeRawUnsafe('INSERT INTO "BusinessRequest" ("kind", "requesterId", "businessId", "name", "domain", "note") VALUES (\'CLAIM\',11,21,\'Owned\',\'owned.example\',\'Reviewed claim fixture\')')
    })
    const insert = status => scoped(tx => tx.$executeRawUnsafe('INSERT INTO "BusinessRequest" ("kind", "requesterId", "name", "domain", "note", "status") VALUES (\'CLAIM\',11,\'Owned\',\'owned.example\',\'Fixture\',$1)', status))
    await assert.rejects(insert('PENDING'), error => error.code === 'P2010' && error.meta?.code === '23505')
    await insert('REJECTED') // historical rejected requests do not block a new pending request forever
    await assert.rejects(insert('BYPASSED'), error => error.code === 'P2010' && error.meta?.code === '23514')
    await scoped(async tx => {
      await tx.$executeRawUnsafe('DELETE FROM "BusinessProfile" WHERE "id" = 21')
      assert.equal((await tx.$queryRawUnsafe('SELECT "businessId" FROM "BusinessRequest" WHERE "status" = \'PENDING\''))[0].businessId, null)
      await tx.$executeRawUnsafe('DELETE FROM "User" WHERE "id" = 11')
      assert.equal((await tx.$queryRawUnsafe('SELECT COUNT(*)::integer AS count FROM "BusinessRequest"'))[0].count, 0)
    })
    console.log('Business request actual SQL: populated schema preservation, pending-only unique index, status constraint and canonical FK cleanup passed.')
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
