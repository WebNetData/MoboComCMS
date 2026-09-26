const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { pipeline } = require('node:stream/promises')
const MAGIC = Buffer.from('HAPPBK01')
function encryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY || ''
  if (!/^[a-f\d]{64}$/i.test(raw)) throw Error('BACKUP_KEY_REQUIRED')
  return Buffer.from(raw, 'hex')
}
function connection(url = process.env.DATABASE_URL) {
  const parsed = new URL(url)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw Error('POSTGRES_REQUIRED')
  if (parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public') throw Error('PUBLIC_SCHEMA_REQUIRED')
  // Prisma-only URL parameters must not be passed to libpq.
  for (const key of ['schema','connection_limit','pool_timeout','pgbouncer','statement_cache_size','connect_timeout']) parsed.searchParams.delete(key)
  return { url: parsed.toString(), database: decodeURIComponent(parsed.pathname.slice(1)), user: decodeURIComponent(parsed.username) }
}
function pg(program, args = [], { database, output, input, capture = false } = {}) {
  const cfg = connection()
  const container = process.env.BACKUP_PG_CONTAINER
  const env = { ...process.env, PGCONNECT_TIMEOUT: '15' }
  const url = new URL(cfg.url); if (database) url.pathname = '/' + database
  env.PGDATABASE = url.toString()
  let command = program, argv = args
  if (container) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(container)) throw Error('INVALID_CONTAINER')
    if (!['localhost','127.0.0.1',container].includes(url.hostname)) throw Error('BACKUP_CONTAINER_HOST_MISMATCH')
    command = 'docker'; argv = ['exec', '-i', container, program, '-U', cfg.user, ...args]
    if (program === 'pg_dump' || program === 'pg_restore' || program === 'psql') argv.push('-d', database || cfg.database)
    if (program === 'createdb' || program === 'dropdb') argv.push('--maintenance-db=' + cfg.database)
  }
  // Native tools use PGDATABASE/PGUSER/PGPASSWORD env; never put credentials in argv.
  if (!container) { env.PGUSER = decodeURIComponent(url.username); env.PGPASSWORD = decodeURIComponent(url.password); env.PGHOST = url.hostname; env.PGPORT = url.port || '5432'; env.PGDATABASE = database || cfg.database; if (url.searchParams.get('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode'); argv = args }
  if (!container && program === 'pg_restore') argv = [...args, '-d', database || cfg.database]
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { env, windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    let result = '', failed = false
    const timer = setTimeout(() => { failed = true; child.kill(); reject(Error('PG_TOOL_TIMEOUT')) }, 30 * 60000)
    const chunks = []
    child.stderr.on('data', () => {}) // may contain connection secrets; never log raw tool output
    if (capture) child.stdout.on('data', chunk => { if (result.length < 10000000) result += chunk.toString() })
    else if (!output) child.stdout.resume()
    if (output) chunks.push(pipeline(child.stdout, fs.createWriteStream(output, { mode: 0o600 })))
    if (input) chunks.push(pipeline(fs.createReadStream(input), child.stdin))
    else child.stdin.end()
    child.on('error', () => { clearTimeout(timer); failed = true; reject(Error('PG_TOOL_UNAVAILABLE')) })
    child.on('close', async code => { clearTimeout(timer); try { await Promise.all(chunks); if (!failed) code === 0 ? resolve(result) : reject(Error('PG_TOOL_FAILED_' + program)) } catch { reject(Error('PG_STREAM_FAILED')) } })
    for (const job of chunks) job.catch(() => { failed = true; child.kill(); clearTimeout(timer); reject(Error('PG_STREAM_FAILED')) })
  })
}
async function encryptFile(source, destination) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  await fsp.writeFile(destination, Buffer.concat([MAGIC, iv]), { mode: 0o600, flag: 'wx' })
  await pipeline(fs.createReadStream(source), cipher, fs.createWriteStream(destination, { flags: 'a' }))
  await fsp.appendFile(destination, cipher.getAuthTag())
}
async function decryptFile(source, destination) {
  const handle = await fsp.open(source, 'r'); const stat = await handle.stat()
  const header = Buffer.alloc(20), tag = Buffer.alloc(16)
  try { await handle.read(header,0,20,0); await handle.read(tag,0,16,stat.size-16) } finally { await handle.close() }
  if (stat.size < 36 || !header.subarray(0,8).equals(MAGIC)) throw Error('INVALID_BACKUP')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), header.subarray(8)); decipher.setAuthTag(tag)
  try { await pipeline(fs.createReadStream(source, { start: 20, end: stat.size-17 }), decipher, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })) }
  catch { await fsp.rm(destination, { force: true }); throw Error('BACKUP_AUTHENTICATION_FAILED') }
}
async function sha256(file) { const hash=crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex') }
async function restoreTest(archive, options = {}) {
  const keep = options.keepDatabase
  if (keep && (!/^happvpn_recovered_[a-z0-9_]{1,32}$/.test(keep) || keep === connection().database)) throw Error('INVALID_RESTORE_TARGET')
  const name = keep || 'happvpn_restore_test_' + crypto.randomBytes(10).toString('hex')
  const dir = await fsp.mkdtemp(path.join(path.dirname(archive), '.restore-')); await fsp.chmod(dir,0o700)
  const plain = path.join(dir,'restore.dump'); let created = false, success = false
  try {
    await decryptFile(archive, plain)
    await pg('createdb', [name]); created = true
    await pg('pg_restore', ['--exit-on-error','--no-owner','--no-acl'], { database: name, input: plain })
    const result = await pg('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1','-c', 'SELECT count(*) FROM "User"; SELECT count(*) FROM "Setting"; SELECT count(*) FROM "WalletAccount";'], { database:name, capture:true })
    if (!/^\s*\d+\s+\d+\s+\d+\s*$/.test(result)) throw Error('RESTORE_CHECK_FAILED')
    success = true
    return { ok: true, checkedAt: new Date().toISOString(), counts: result.trim().split(/\s+/).map(Number), ...(keep ? {database:name} : {}) }
  } finally {
    try { if (created && (!keep || !success)) await pg('dropdb', [name]) } finally { await fsp.rm(plain,{force:true}); await fsp.rmdir(dir) }
  }
}
function retentionVictims(manifests, days, dailyDays, now = Date.now()) {
  const daily = new Map()
  for (const item of [...manifests].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))) if (!daily.has(item.createdAt.slice(0,10))) daily.set(item.createdAt.slice(0,10), item.id)
  return manifests.filter(item => { const age = (now - Date.parse(item.createdAt))/86400000; return age > dailyDays || (age > days && daily.get(item.createdAt.slice(0,10)) !== item.id) })
}
module.exports = { connection, pg, encryptFile, decryptFile, sha256, restoreTest, retentionVictims, encryptionKey }
