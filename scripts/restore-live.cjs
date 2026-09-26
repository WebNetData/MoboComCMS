// Live restore: replaces the CURRENT database with an encrypted backup.
//
// Safety model (an admin action may never silently destroy the only copy):
//   1. RESTORE_CONFIRM=1 is mandatory — the API sets it only after the operator
//      typed the confirmation phrase.
//   2. A pre-restore snapshot of the live database is taken and encrypted first.
//   3. Other sessions are terminated, then pg_restore runs with
//      --single-transaction --clean --if-exists: all-or-nothing.
//   4. Row counts are queried afterwards; the operator restarts the app.
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const core = require('./backup-core.cjs')

const ID = /^backup-\d{13}-[a-f0-9]{12}$/
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || 'storage/backups')

/** Resolves an archive strictly inside the backup directory. */
function safeArchive(file) {
  const resolved = path.resolve(file)
  const name = path.basename(resolved)
  if (path.dirname(resolved) !== BACKUP_DIR || !ID.test(name.replace(/\.dump\.enc$/, ''))) throw Error('INVALID_BACKUP_PATH')
  return resolved
}

/** The live database may only be replaced by an explicit operator confirmation. */
function assertConfirmed(env = process.env) {
  if (env.RESTORE_CONFIRM !== '1') throw Error('RESTORE_NOT_CONFIRMED')
}

async function snapshotFirst() {
  const id = `backup-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  const plain = path.join(BACKUP_DIR, id + '.dump.tmp')
  const archive = path.join(BACKUP_DIR, id + '.dump.enc')
  await core.pg('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], { output: plain })
  await core.encryptFile(plain, archive)
  await fs.rm(plain, { force: true })
  const meta = { id, createdAt: new Date().toISOString(), bytes: (await fs.stat(archive)).size, sha256: await core.sha256(archive), format: 'HAPPBK01-AES256GCM-pgcustom', reason: 'pre-restore', restore: null, telegram: null }
  await fs.writeFile(path.join(BACKUP_DIR, id + '.json'), JSON.stringify(meta, null, 2), { mode: 0o600 })
  return meta
}

async function liveRestore(file, options = {}) {
  assertConfirmed()
  const archive = safeArchive(file)
  const connection = core.connection()
  core.encryptionKey()
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 })
  const safety = options.skipSafetySnapshot ? null : await snapshotFirst()
  const dir = await fs.mkdtemp(path.join(BACKUP_DIR, '.restore-'))
  const plain = path.join(dir, 'restore.dump')
  try {
    await core.decryptFile(archive, plain)
    // The running application holds pooled connections; they must go before
    // --clean can drop objects. Prisma reconnects on the next query.
    await core.pg('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"], { capture: true })
    await core.pg('pg_restore', ['--single-transaction', '--clean', '--if-exists', '--no-owner', '--no-acl'], { database: connection.database, input: plain })
    const result = await core.pg('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT count(*) FROM "User"; SELECT count(*) FROM "Setting"; SELECT count(*) FROM "WalletAccount";'], { capture: true })
    const counts = result.trim().split(/\s+/).map(Number)
    if (counts.length !== 3 || counts.some((n) => !Number.isInteger(n))) throw Error('RESTORE_CHECK_FAILED')
    return { ok: true, restoredAt: new Date().toISOString(), counts, source: path.basename(archive), safetyBackup: safety ? safety.id : null }
  } finally {
    await fs.rm(plain, { force: true })
    await fs.rm(dir, { recursive: true, force: true })
  }
}

module.exports = { safeArchive, assertConfirmed, liveRestore, snapshotFirst, BACKUP_DIR }

if (require.main === module) {
  const file = process.argv[2]
  ;(file ? liveRestore(file) : Promise.reject(Error('USAGE_REQUIRES_BACKUP_FILE')))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(/^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'LIVE_RESTORE_FAILED'); process.exitCode = 1 })
}
