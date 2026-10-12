const fs = require('node:fs'), assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const migration = fs.readFileSync('prisma/migrations/20261222120000_repository_upload_reservations/migration.sql', 'utf8')

async function main() {
  for (const populated of [false, true]) {
    const schema = `owned_upload_migration_${Date.now()}_${populated ? 1 : 0}`
    assert.match(schema, /^owned_upload_migration_\d+_[01]$/)
    const table = `"${schema}"."RepoRelease"`
    try {
      await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      await db.$executeRawUnsafe(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, "productId" INTEGER NOT NULL, version TEXT NOT NULL, "fileId" TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, changelog TEXT NOT NULL DEFAULT '', "requiresCore" TEXT NOT NULL DEFAULT '', runtime TEXT NOT NULL DEFAULT 'declarative', published BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("productId",version))`)
      if (populated) await db.$executeRawUnsafe(`INSERT INTO ${table} (id,"productId",version,"fileId",sha256,size,published,"createdAt") VALUES (1,101,'1.0.0','legacy.zip','retained',123,FALSE,'2020-01-01T00:00:00Z')`)
      const original = await db.$queryRawUnsafe(`SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY id`)
      for (const statement of migration.split(';').map(x => x.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement.replaceAll('"RepoRelease"', table))
      const after = await db.$queryRawUnsafe(`SELECT to_jsonb(r) - 'storageState' - 'uploadTokenHash' AS row FROM ${table} r ORDER BY id`)
      assert.deepEqual(after, original, 'all legacy fields/dates/publication retained')
      const states = await db.$queryRawUnsafe(`SELECT "storageState", "uploadTokenHash" FROM ${table}`)
      assert(states.every(row => row.storageState === 'READY' && row.uploadTokenHash === null))
      await db.$executeRawUnsafe(`INSERT INTO ${table} (id,"productId",version,"fileId",sha256,size) VALUES (2,101,'1.0.1','legacy-client.zip','retained',1)`)
      assert.equal((await db.$queryRawUnsafe(`SELECT "storageState" FROM ${table} WHERE id=2`))[0].storageState, 'READY', 'old payload works with defaults')
      for (const [state, token, published] of [['UNKNOWN', null, false], ['STAGING', null, false], ['STAGING', 'c'.repeat(64), true], ['STAGING', 'bad', false], ['READY', 'c'.repeat(64), false]]) {
        await assert.rejects(() => db.$executeRawUnsafe(`INSERT INTO ${table} (id,"productId",version,"fileId",sha256,size,"storageState","uploadTokenHash",published) VALUES (3,101,'2.0.0','candidate.zip','retained',1,$1,$2,$3)`, state, token, published), error => String(error.message).includes('RepoRelease_storage_state_check'))
      }
      await db.$executeRawUnsafe(`INSERT INTO ${table} (id,"productId",version,"fileId",sha256,size,"storageState","uploadTokenHash",published) VALUES (3,101,'2.0.0','candidate.zip','retained',1,'STAGING',$1,FALSE)`, 'c'.repeat(64))
      const indexes = await db.$queryRawUnsafe('SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename=\'RepoRelease\'', schema)
      assert(indexes.some(row => row.indexname === 'RepoRelease_fileId_idx'))
      console.log(`Actual ${populated ? 'populated' : 'empty'} old release migration/default/constraints/index passed`)
    } finally { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
