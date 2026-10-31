// Ubuntu host backups share the existing libpq adapter. Credentials stay out of argv/logs.
const { pg } = require('./backup-core.cjs')
const path = require('node:path')
async function main() {
  const [command, file] = process.argv.slice(2)
  if (!file || !path.isAbsolute(file)) throw Error('ABSOLUTE_BACKUP_PATH_REQUIRED')
  if (command === 'dump') await pg('pg_dump', ['--format=custom', '--no-owner'], { output: file })
  else if (command === 'list') await pg('pg_restore', ['--list', file])
  else if (command === 'restore') await pg('pg_restore', ['--clean', '--if-exists', '--single-transaction', '--no-owner', '--no-privileges'], { input: file })
  else throw Error('INVALID_HOST_BACKUP_COMMAND')
}
const safeErrors = new Set(['PG_TOOL_FAILED_pg_dump', 'PG_TOOL_FAILED_pg_restore', 'PG_TOOL_TIMEOUT', 'PG_TOOL_UNAVAILABLE', 'PG_STREAM_FAILED', 'POSTGRES_REQUIRED', 'PUBLIC_SCHEMA_REQUIRED', 'ABSOLUTE_BACKUP_PATH_REQUIRED', 'INVALID_HOST_BACKUP_COMMAND'])
main().catch(error => { console.error('[host-backup]', safeErrors.has(error.message) ? error.message : 'OPERATION_FAILED'); process.exitCode = 1 })
