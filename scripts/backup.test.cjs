const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const path=require('node:path')
const os=require('node:os')
const crypto=require('node:crypto')
const {encryptFile,decryptFile,retentionVictims,connection}=require('./backup-core.cjs')
test('encrypted backups authenticate content and reject tampering or wrong keys',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'happ-backup-test-'))
 const saved=process.env.BACKUP_ENCRYPTION_KEY
 try{
  process.env.BACKUP_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex')
  const plain=path.join(dir,'input'),encrypted=path.join(dir,'encrypted'),output=path.join(dir,'output')
  await fs.writeFile(plain,'private database snapshot')
  await encryptFile(plain,encrypted);await decryptFile(encrypted,output)
  assert.equal(await fs.readFile(output,'utf8'),'private database snapshot')
  await fs.unlink(output)
  const bytes=await fs.readFile(encrypted);bytes[22]^=1;await fs.writeFile(encrypted,bytes)
  await assert.rejects(decryptFile(encrypted,output),/AUTHENTICATION/)
  await assert.rejects(fs.stat(output),/ENOENT/)
  bytes[22]^=1;await fs.writeFile(encrypted,bytes)
  process.env.BACKUP_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex')
  await assert.rejects(decryptFile(encrypted,output),/AUTHENTICATION/)
 }finally{if(saved===undefined)delete process.env.BACKUP_ENCRYPTION_KEY;else process.env.BACKUP_ENCRYPTION_KEY=saved;for(const file of await fs.readdir(dir))await fs.unlink(path.join(dir,file));await fs.rmdir(dir)}
})
test('retention keeps recent snapshots and one daily snapshot until daily expiry',()=>{
 const now=Date.parse('2026-09-22T12:00:00Z')
 const list=[{id:'a',createdAt:'2026-09-22T00:00:00Z'},{id:'b',createdAt:'2026-09-10T00:00:00Z'},{id:'c',createdAt:'2026-09-10T02:00:00Z'},{id:'d',createdAt:'2026-08-01T00:00:00Z'}]
 assert.deepEqual(retentionVictims(list,7,30,now).map(x=>x.id),['c','d'])
})
test('backup connection rejects SQLite and strips Prisma-only parameters',()=>{
 assert.throws(()=>connection('file:./dev.db'),/POSTGRES/)
 assert.equal(new URL(connection('postgresql://user:pw@localhost/db?schema=public&connection_limit=3&sslmode=require').url).search,'?sslmode=require')
})
test('live restore refuses unconfirmed runs and archives outside the backup directory',()=>{
 const {safeArchive,assertConfirmed}=require('./restore-live.cjs')
 const dir=process.env.BACKUP_DIR
 try{
  process.env.BACKUP_DIR=path.join(os.tmpdir(),'mobocomcms-restore-guard')
  delete require.cache[require.resolve('./restore-live.cjs')]
  const guards=require('./restore-live.cjs')
  assert.throws(()=>guards.assertConfirmed({}),/RESTORE_NOT_CONFIRMED/)
  assert.doesNotThrow(()=>guards.assertConfirmed({RESTORE_CONFIRM:'1'}))
  assert.throws(()=>guards.safeArchive(path.join(os.tmpdir(),'mobocomcms-restore-guard','backup-1-a.dump.enc')),/INVALID_BACKUP_PATH/)
  assert.throws(()=>guards.safeArchive(path.join(os.tmpdir(),'elsewhere','backup-1760000000000-abcdef123456.dump.enc')),/INVALID_BACKUP_PATH/)
  assert.match(guards.safeArchive(path.join(os.tmpdir(),'mobocomcms-restore-guard','backup-1760000000000-abcdef123456.dump.enc')),/backup-1760000000000-abcdef123456\.dump\.enc$/)
 }finally{
  if(dir===undefined)delete process.env.BACKUP_DIR;else process.env.BACKUP_DIR=dir
  delete require.cache[require.resolve('./restore-live.cjs')]
 }
})
