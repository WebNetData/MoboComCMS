// Opt-in isolated Linux host rehearsal: real non-superuser PG backups and real code swaps.
// Build/service commands are fixtures; HTTP readiness is a real loopback server.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),http=require('node:http')
const root=path.resolve(__dirname,'..'),{MAGIC}=require('./release-package.cjs')
const enabled=process.env.MOBOCOM_HOST_REHEARSAL==='1'
if(enabled&&(process.getuid?.()!==0||process.env.PGHOST!=='127.0.0.1'))throw Error('ISOLATED_ROOT_LAB_REQUIRED')
const run=(command,args,options={})=>cp.execFileSync(command,args,{encoding:'utf8',timeout:60000,...options})
const asApp=args=>run('sudo',['-u','mobocom',...args])
const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target)}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mobocom-package-host-'));fs.chmodSync(dir,0o755);run('chown',['mobocom:mobocom',dir])
 const app=path.join(dir,'app'),tools=path.join(dir,'tools'),backups=path.join(dir,'backups'),envFile=path.join(dir,'env'),keyFile=path.join(tools,'public.pem')
 for(const folder of [app,tools,backups,path.join(app,'storage/update/packages'),path.join(app,'storage/uploads'),path.join(app,'var')])fs.mkdirSync(folder,{recursive:true})
 const files=['deploy/ubuntu/backup.sh','scripts/backup-core.cjs','scripts/host-backup-db.cjs','scripts/load-runtime-env.cjs']
 for(const file of files)copy(path.join(root,file),path.join(app,file))
 for(const [from,to]of [['deploy/ubuntu/package-update.sh','package-update.sh'],['deploy/ubuntu/release-extract.py','release-extract.py'],['scripts/release-package.cjs','release-package.cjs'],['scripts/host-backup-db.cjs','host-backup-db.cjs'],['scripts/backup-core.cjs','backup-core.cjs']])copy(path.join(root,from),path.join(tools,to))
 fs.writeFileSync(path.join(app,'package.json'),'{"version":"1.6.0"}');fs.writeFileSync(path.join(app,'.env'),'OWNER_ENV=preserved');fs.writeFileSync(path.join(app,'storage/uploads/customer'),'customer data')
 const pair=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(keyFile,pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o644})
 const db='package_'+crypto.randomBytes(8).toString('hex')
 run('psql',['-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${db} LOGIN`]);run('createdb',['-U','postgres','-O',db,db])
 const query=sql=>run('psql',['-U',db,'-d',db,'-XAt','-v','ON_ERROR_STOP=1','-c',sql])
 query("CREATE TABLE item(id int PRIMARY KEY,value text);INSERT INTO item VALUES(1,'customer row')")
 fs.writeFileSync(envFile,`DATABASE_URL=postgresql://${db}@127.0.0.1:5432/${db}?schema=public\nHOST_BACKUP_DIR=${backups}\n`)
 run('chown',['-R','mobocom:mobocom',app,backups])
 asApp(['node',path.join(tools,'release-package.cjs'),'inventory',app,path.join(app,'storage/update/current-files.json')])
 const server=http.createServer((_req,res)=>{const version=JSON.parse(fs.readFileSync(path.join(app,'package.json'))).version;res.statusCode=fixtureHealth(version)?200:503;res.end('readiness')})
 let fixtureHealth=()=>true;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const health=`http://127.0.0.1:${server.address().port}/api/health/ready`
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));run('dropdb',['-U','postgres',db]);run('psql',['-U','postgres','-d','postgres','-c',`DROP ROLE ${db}`]);fs.rmSync(dir,{recursive:true,force:true})})
 function pack(version='1.6.1'){
  const source=fs.mkdtempSync(path.join(dir,'publisher-'))
  for(const file of files)copy(path.join(root,file),path.join(source,file))
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({version}));fs.writeFileSync(path.join(source,'package-lock.json'),'{}')
  const archive=path.join(dir,`payload-${version}.gz`)
  run('tar',['-czf',archive,'--transform=s,^./,,','-C',source,'package.json','package-lock.json','deploy','scripts'])
  const payload=fs.readFileSync(archive),manifest=Buffer.from(JSON.stringify({format:1,version,bytes:payload.length,sha256:crypto.createHash('sha256').update(payload).digest('hex')})),header=Buffer.alloc(12);MAGIC.copy(header);header.writeUInt32BE(manifest.length,8)
  const bytes=Buffer.concat([header,manifest,crypto.sign(null,manifest,pair.privateKey),payload]),id=crypto.createHash('sha256').update(bytes).digest('hex'),file=path.join(app,'storage/update/packages',id+'.mbrelease')
  fs.writeFileSync(file,bytes);run('chown',['mobocom:mobocom',file]);return id
 }
 async function update(id,extra={}){
  const vars={MOBOCOM_APP_DIR:app,UPDATE_PUBLIC_KEY_FILE:keyFile,UPDATE_ENV_FILE:envFile,UPDATE_NPM:'true',UPDATE_BUILD:'mkdir -p .next; echo built > .next/BUILD_ID',UPDATE_STOP:`touch '${dir}/stopped'`,UPDATE_RESTART:'true',UPDATE_HEALTH_TRIES:'1',UPDATE_MIN_FREE_MB:'0',UPDATE_HEALTH_URL:health,...extra}
  return new Promise(resolve=>cp.execFile('sudo',['-u','mobocom','env',...Object.entries(vars).map(([k,v])=>k+'='+v),'bash',path.join(tools,'package-update.sh'),id],{encoding:'utf8',timeout:60000},(error,stdout,stderr)=>resolve({code:error?.code||0,stdout,stderr})))
 }
 return{dir,app,backups,query,pack,update,envFile,health:set=>{fixtureHealth=set},version:()=>JSON.parse(fs.readFileSync(path.join(app,'package.json'))).version,state:()=>JSON.parse(fs.readFileSync(path.join(app,'storage/update/state.json'))),files}
}
test('unfinished package refresh preserves member identity and existing data through the normal backup/adoption worker',{skip:!enabled},async t=>{
 const b=await fixture(t);b.query('CREATE TABLE "User" (id int PRIMARY KEY, role text); INSERT INTO "User" VALUES(42,\'USER\')')
 const result=await b.update(b.pack(),{UPDATE_REQUIRE_UNINSTALLED:'1'});assert.equal(result.code,0,result.stderr)
 assert.equal(b.version(),'1.6.1');assert.equal(b.query('SELECT id FROM "User"').trim(),'42');assert.equal(b.query('SELECT value FROM item').trim(),'customer row')
 assert(fs.readdirSync(b.backups).some(file=>file.endsWith('.dump')))
})

test('unfinished refresh refuses an administrator, an installed lock or explicit installer disable before backup/stop/adoption',{skip:!enabled},async t=>{
 for(const kind of ['admin','lock','disabled']){
  const b=await fixture(t),extra={UPDATE_REQUIRE_UNINSTALLED:'1'}
  if(kind==='admin')b.query('CREATE TABLE "User" (role text); INSERT INTO "User" VALUES(\'ADMIN\')')
  if(kind==='lock'){fs.mkdirSync(path.join(b.app,'storage/config'));fs.writeFileSync(path.join(b.app,'storage/config/installed.lock'),'installed')}
  if(kind==='disabled')extra.INSTALL_DISABLED='true'
  const result=await b.update(b.pack(),extra);assert.notEqual(result.code,0)
  assert.equal(b.version(),'1.6.0');assert.equal(fs.existsSync(path.join(b.dir,'stopped')),false);assert.equal(fs.readdirSync(b.backups).length,0)
  assert.equal(b.query('SELECT value FROM item').trim(),'customer row');assert.equal(fs.existsSync(path.join(b.app,'storage/update/lock')),false)
 }
})

test('unfinished refresh rechecks first-owner standing after a concurrent build-time owner creation',{skip:!enabled},async t=>{
 const b=await fixture(t),script=path.join(b.dir,'new-owner.cjs')
 fs.writeFileSync(script,`const {pg}=require(process.argv[2]);pg('psql',['-X','-v','ON_ERROR_STOP=1','-c',${JSON.stringify('CREATE TABLE "User" (role text); INSERT INTO "User" VALUES(\'ADMIN\')')}]).catch(()=>{process.exitCode=1})`)
 const result=await b.update(b.pack(),{UPDATE_REQUIRE_UNINSTALLED:'1',UPDATE_BUILD:`node '${script}' '${b.app}/scripts/backup-core.cjs'; mkdir -p .next; echo built > .next/BUILD_ID`})
 assert.notEqual(result.code,0);assert.equal(b.version(),'1.6.0');assert.equal(b.query('SELECT count(*) FROM "User"').trim(),'1');assert.equal(fs.existsSync(path.join(b.dir,'stopped')),false)
 assert.equal(fs.readdirSync(b.backups).length,0)
})

test('unfinished refresh fails closed on an unreadable database and does not print connection secrets',{skip:!enabled},async t=>{
 const b=await fixture(t),bad=path.join(b.dir,'offline.env'),secret='Must-Never-Be-Printed-2049'
 fs.writeFileSync(bad,`DATABASE_URL=postgresql://unused:${secret}@127.0.0.1:9/unreachable\n`)
 const result=await b.update(b.pack(),{UPDATE_REQUIRE_UNINSTALLED:'1',UPDATE_ENV_FILE:bad})
 assert.notEqual(result.code,0);assert(!result.stderr.includes(secret));assert.equal(b.version(),'1.6.0');assert.equal(fs.existsSync(path.join(b.dir,'stopped')),false)
})

test('package update without .git: actual code replacement, PG backup, data/config preserved and next package works',{skip:!enabled},async t=>{
 const rootRefusal=cp.spawnSync('bash',[path.join(root,'deploy/ubuntu/package-update.sh'),'a'.repeat(64)],{encoding:'utf8'});assert.equal(rootRefusal.status,2);assert.match(rootRefusal.stderr,/not root/)
 const b=await fixture(t);let result=await b.update(b.pack());assert.equal(result.code,0,result.stderr)
 assert.equal(b.version(),'1.6.1');assert.equal(b.state().status,'done');assert.equal(fs.existsSync(path.join(b.app,'.git')),false)
 assert.equal(b.query('SELECT value FROM item').trim(),'customer row');assert.equal(fs.readFileSync(path.join(b.app,'storage/uploads/customer'),'utf8'),'customer data');assert.equal(fs.readFileSync(path.join(b.app,'.env'),'utf8'),'OWNER_ENV=preserved')
 assert.equal(fs.readdirSync(b.backups).filter(f=>f.endsWith('.dump')).length,1)
 // Avoid archive timestamp collision without a timing sleep; keep the real first backup.
 for(const file of fs.readdirSync(b.backups).filter(f=>f.startsWith('db-')||f.startsWith('storage-')))fs.renameSync(path.join(b.backups,file),path.join(b.backups,file.replace(/\d{8}-\d{6}/,'20000101-000000')))
 result=await b.update(b.pack('1.6.2'));assert.equal(result.code,0,result.stderr);assert.equal(b.version(),'1.6.2')
})
test('package build or backup failure never stops/replaces code or touches data',{skip:!enabled},async t=>{
 for(const extra of [{UPDATE_BUILD:'false'},{UPDATE_BACKUP:'false'}]){
  const b=await fixture(t),result=await b.update(b.pack(),extra);assert.notEqual(result.code,0)
  assert.equal(b.version(),'1.6.0');assert.equal(b.query('SELECT value FROM item').trim(),'customer row');assert.equal(fs.existsSync(path.join(b.dir,'stopped')),false);assert.equal(fs.existsSync(path.join(b.app,'storage/update/lock')),false)
 }
})
test('unhealthy package restores previous code and verifies old readiness; failed old health stays failed',{skip:!enabled},async t=>{
 for(const oldHealthy of [true,false]){
  const b=await fixture(t);b.health(version=>oldHealthy&&version==='1.6.0')
  const result=await b.update(b.pack());assert.notEqual(result.code,0);assert.equal(b.version(),'1.6.0');assert.equal(b.state().status,oldHealthy?'rolled-back':'failed');assert.equal(b.query('SELECT value FROM item').trim(),'customer row')
 }
})
test('owner edits and concurrent restore prevent package execution',{skip:!enabled},async t=>{
 const b=await fixture(t),id=b.pack();fs.writeFileSync(path.join(b.app,'owner.js'),'keep this')
 assert.notEqual((await b.update(id)).code,0);assert.equal(b.version(),'1.6.0');assert.equal(fs.readFileSync(path.join(b.app,'owner.js'),'utf8'),'keep this');assert.equal(fs.existsSync(path.join(b.dir,'stopped')),false)
 fs.unlinkSync(path.join(b.app,'owner.js'));fs.mkdirSync(path.join(b.app,'storage/update/lock'));assert.equal((await b.update(id)).code,3)
})
test('failure after healthy code adoption restores the previous source inventory too',{skip:!enabled},async t=>{
 const b=await fixture(t),shim=path.join(b.dir,'shim');fs.mkdirSync(shim)
 fs.writeFileSync(path.join(shim,'node'),'#!/bin/sh\nif [ "$1" = -e ] && [ "${4:-}" = done ]; then exit 9; fi\nexec /usr/local/bin/node "$@"\n');fs.chmodSync(path.join(shim,'node'),0o755)
 const result=await b.update(b.pack(),{PATH:shim+':'+process.env.PATH});assert.notEqual(result.code,0);assert.equal(b.version(),'1.6.0');assert.equal(b.state().status,'rolled-back')
 asApp(['node',path.join(b.dir,'tools/release-package.cjs'),'clean',b.app,path.join(b.app,'storage/update/current-files.json')])
 assert.equal(b.query('SELECT value FROM item').trim(),'customer row')
})
