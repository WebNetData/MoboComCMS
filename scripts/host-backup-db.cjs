// Ubuntu host backups share the existing libpq adapter. Credentials stay out of argv/logs.
const { pg } = require('./backup-core.cjs')
const path = require('node:path')
const fs = require('node:fs')
async function main() {
  const [command, file] = process.argv.slice(2)
  if (command === 'install-state') {
    if (process.env.INSTALL_DISABLED === 'true') return console.log('installed')
    const directory = path.resolve(process.env.INSTALL_CONFIG_DIR || path.join(process.env.MOBOCOM_APP_DIR || process.cwd(), 'storage/config'))
    try { fs.lstatSync(path.join(directory, 'installed.lock')); return console.log('installed') } catch (error) { if (error.code !== 'ENOENT') throw error }
    const missing = (await pg('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT to_regclass('public."User"') IS NULL;`], { capture: true })).trim()
    if (missing === 't') return console.log('no-schema')
    if (missing !== 'f') throw Error('INSTALL_STATE_UNAVAILABLE')
    const count = (await pg('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT count(*) FROM public."User" WHERE role = 'ADMIN';`], { capture: true })).trim()
    if (!/^\d+$/.test(count)) throw Error('INSTALL_STATE_UNAVAILABLE')
    return console.log(count === '0' ? 'no-admin' : 'installed')
  }
  if (!file || !path.isAbsolute(file)) throw Error('ABSOLUTE_BACKUP_PATH_REQUIRED')
  if (command === 'dump') await pg('pg_dump', ['--format=custom', '--no-owner'], { output: file })
  else if (command === 'list') await pg('pg_restore', ['--list', file])
  else if (command === 'restore') await pg('pg_restore', ['--clean', '--if-exists', '--single-transaction', '--no-owner', '--no-privileges'], { input: file })
  else throw Error('INVALID_HOST_BACKUP_COMMAND')
}
const safeErrors = new Set(['PG_TOOL_FAILED_pg_dump', 'PG_TOOL_FAILED_pg_restore', 'PG_TOOL_FAILED_psql', 'INSTALL_STATE_UNAVAILABLE', 'PG_TOOL_TIMEOUT', 'PG_TOOL_UNAVAILABLE', 'PG_STREAM_FAILED', 'POSTGRES_REQUIRED', 'PUBLIC_SCHEMA_REQUIRED', 'ABSOLUTE_BACKUP_PATH_REQUIRED', 'INVALID_HOST_BACKUP_COMMAND'])
main().catch(error => { console.error('[host-backup]', safeErrors.has(error.message) ? error.message : 'OPERATION_FAILED'); process.exitCode = 1 })
