// Isolated Ubuntu host rehearsal. Explicit opt-in; requires local PostgreSQL and root
// solely to exercise the real root -> service-user boundary with a fake systemctl.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const cp = require('node:child_process')
const root = path.resolve(__dirname, '..')
const enabled = process.env.MOBOCOM_HOST_REHEARSAL === '1'
if (enabled && (process.getuid?.() !== 0 || process.env.PGHOST !== '127.0.0.1')) throw Error('ISOLATED_LOCAL_LAB_REQUIRED')
function run(cmd, args, options = {}) { return cp.execFileSync(cmd, args, {encoding:'utf8', timeout:60000, ...options}) }
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-hostops-'))
  fs.chmodSync(dir, 0o755)
  run('chown',['mobocom:mobocom',dir]) // mirrors the service-owned /opt/mobocom home
  const app = path.join(dir,'app'), backups = path.join(dir,'backups'), bin = path.join(dir,'bin'), envFile = path.join(dir,'env')
  for (const sub of ['storage/uploads','storage/config','storage/update','storage/backups','.git']) fs.mkdirSync(path.join(app,sub),{recursive:true})
  fs.writeFileSync(path.join(app,'package.json'),'{"version":"1.6.0"}')
  for (const file of ['deploy/ubuntu/backup.sh','deploy/ubuntu/mobocom','deploy/ubuntu/restore-files.py','scripts/host-backup-db.cjs','scripts/backup-core.cjs','scripts/load-runtime-env.cjs']) {
    fs.mkdirSync(path.dirname(path.join(app,file)),{recursive:true}); fs.copyFileSync(path.join(root,file), path.join(app,file))
  }
  fs.mkdirSync(bin); fs.mkdirSync(backups)
  fs.writeFileSync(path.join(bin,'systemctl'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${dir}/service.log'\n`); fs.chmodSync(path.join(bin,'systemctl'),0o755)
  const db = 'hostops_' + path.basename(dir).replace(/[^a-z0-9]/gi,'').toLowerCase()
  run('psql',['-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c', `CREATE ROLE ${db} LOGIN;`])
  run('createdb',['-U','postgres','-O', db, db])
  const query = sql => run('psql',['-U',db,'-d',db,'-XAt','-v','ON_ERROR_STOP=1','-c',sql])
  if (process.env.MOBOCOM_HOST_SCHEMA_DUMP) run('pg_restore',['-U',db,'-d',db,'--no-owner','--no-privileges',process.env.MOBOCOM_HOST_SCHEMA_DUMP])
  query("CREATE TABLE item (id int PRIMARY KEY, value text); INSERT INTO item VALUES (1,'old');")
  fs.writeFileSync(envFile, `DATABASE_URL=postgresql://${db}@127.0.0.1:5432/${db}?schema=public\nHOST_BACKUP_DIR=${backups}\n`)
  fs.chmodSync(envFile,0o644)
  fs.writeFileSync(path.join(app,'storage/uploads/item'),'old')
  fs.writeFileSync(path.join(app,'storage/config/runtime.env'),'CURRENT_CONFIGURATION=keep\n')
  fs.writeFileSync(path.join(app,'storage/update/history.log'),'keep history')
  run('chown',['-R','mobocom:mobocom',app,backups])
  const env = {...process.env, MOBOCOM_ENV_FILE:envFile, MOBOCOM_APP_DIR:app, MOBOCOM_APP_USER:'mobocom', MOBOCOM_HEALTH_URL:`file://${envFile}`, PATH:bin+':'+process.env.PATH}
  const stamp = '20000101-000000'
  run('sudo',['-u','mobocom','env',`MOBOCOM_ENV_FILE=${envFile}`,`MOBOCOM_APP_DIR=${app}`,'bash','deploy/ubuntu/backup.sh'],{cwd:app,env})
  for (const file of fs.readdirSync(backups)) {
    if (file.startsWith('db-')) fs.renameSync(path.join(backups,file),path.join(backups,`db-${stamp}.dump`))
    if (file.startsWith('storage-')) fs.renameSync(path.join(backups,file),path.join(backups,`storage-${stamp}.tar.gz`))
  }
  query("UPDATE item SET value='new'")
  fs.writeFileSync(path.join(app,'storage/uploads/item'),'new')
  const restore = () => cp.spawnSync('bash',['deploy/ubuntu/mobocom','restore',stamp],{cwd:app,env:{...env,MOBOCOM_RESTORE_CONFIRM:stamp},encoding:'utf8',timeout:60000})
  t.after(() => {
    run('dropdb',['-U','postgres',db]); run('psql',['-U','postgres','-d','postgres','-c',`DROP ROLE ${db}`])
    fs.rmSync(dir,{recursive:true,force:true})
  })
  return {dir, app, backups, envFile, stamp, query, restore, calls:()=> fs.existsSync(path.join(dir,'service.log')) ? fs.readFileSync(path.join(dir,'service.log'),'utf8') : ''}
}
test('host restore: actual PostgreSQL + uploads restore while current config/history/backups stay', {skip:!enabled}, t => {
  const b=fixture(t), r=b.restore()
  assert.equal(r.status,0,r.stdout+r.stderr)
  assert.equal(b.query('SELECT value FROM item').trim(),'old')
  if (process.env.MOBOCOM_HOST_SCHEMA_DUMP) {
    assert.ok(Number(b.query('SELECT count(*) FROM "_prisma_migrations"').trim())>0,'actual MoboCom migration history restored')
    assert.equal(b.query('SELECT count(*) FROM "User"').trim(),'0','empty application identity data retained')
  }
  assert.equal(fs.readFileSync(path.join(b.app,'storage/uploads/item'),'utf8'),'old')
  assert.equal(fs.readFileSync(path.join(b.app,'storage/config/runtime.env'),'utf8'),'CURRENT_CONFIGURATION=keep\n')
  assert.equal(fs.readFileSync(path.join(b.app,'storage/update/history.log'),'utf8'),'keep history')
  assert.equal(fs.existsSync(path.join(b.app,'storage/update/lock')),false)
  assert.equal(fs.readdirSync(b.backups).filter(f=>f.endsWith('.dump')).length,2,'safety backup retained')
  assert.match(b.calls(),/stop mobocom\nstart mobocom/)
})
test('host restore: transaction failure preserves DB and compensates uploaded files', {skip:!enabled}, t => {
  const b=fixture(t)
  b.query('CREATE VIEW dependency AS SELECT * FROM item') // clean cannot drop a table with this extra dependency
  const r=b.restore()
  assert.notEqual(r.status,0,r.stdout+r.stderr)
  assert.match(r.stderr,/PG_TOOL_FAILED_pg_restore/)
  assert.equal(b.query('SELECT value FROM item').trim(),'new')
  assert.equal(b.query('SELECT value FROM dependency').trim(),'new')
  assert.equal(fs.readFileSync(path.join(b.app,'storage/uploads/item'),'utf8'),'new')
  assert.equal(fs.existsSync(path.join(b.app,'storage/update/lock')),false)
  assert.match(b.calls(),/start mobocom/)
})
test('host restore: traversal archive rejected before service stop or DB/file mutation', {skip:!enabled}, t => {
  const b=fixture(t), archive=path.join(b.backups,`storage-${b.stamp}.tar.gz`)
  run('python3',['-c',"import tarfile,io,sys; t=tarfile.open(sys.argv[1],'w:gz'); m=tarfile.TarInfo('storage/../../escape'); m.size=4; t.addfile(m,io.BytesIO(b'evil')); t.close()",archive])
  const r=b.restore()
  assert.notEqual(r.status,0)
  assert.match(r.stderr,/UNSAFE_ARCHIVE_ENTRY/)
  assert.equal(b.query('SELECT value FROM item').trim(),'new')
  assert.equal(fs.readFileSync(path.join(b.app,'storage/uploads/item'),'utf8'),'new')
  assert.equal(b.calls(),'')
  assert.equal(fs.existsSync(path.join(b.dir,'escape')),false)
})
test('host restore: corrupt DB archive and a concurrent update block restore before stopping', {skip:!enabled}, t => {
  const b=fixture(t)
  fs.mkdirSync(path.join(b.app,'storage/update/lock'))
  const locked=b.restore()
  assert.notEqual(locked.status,0)
  assert.match(locked.stderr,/another update or restore/)
  fs.rmdirSync(path.join(b.app,'storage/update/lock'))
  fs.writeFileSync(path.join(b.backups,`db-${b.stamp}.dump`),'damaged')
  const corrupt=b.restore()
  assert.notEqual(corrupt.status,0)
  assert.match(corrupt.stderr,/PG_TOOL_FAILED_pg_restore/)
  assert.equal(b.query('SELECT value FROM item').trim(),'new')
  assert.equal(b.calls(),'')
})

test('host restore: failed safety backup restarts unchanged site and releases lock', {skip:!enabled}, t => {
  const b=fixture(t)
  // Listing a custom-format dump needs no DB connection; the safety dump does.
  fs.writeFileSync(b.envFile, `DATABASE_URL=postgresql://invalid@127.0.0.1:1/unreachable\nHOST_BACKUP_DIR=${b.backups}\n`)
  const r=b.restore()
  assert.notEqual(r.status,0)
  assert.match(r.stderr,/safety backup failed/)
  assert.equal(b.query('SELECT value FROM item').trim(),'new')
  assert.equal(fs.readFileSync(path.join(b.app,'storage/uploads/item'),'utf8'),'new')
  assert.equal(fs.existsSync(path.join(b.app,'storage/update/lock')),false)
  assert.match(b.calls(),/stop mobocom\nstart mobocom/)
})
