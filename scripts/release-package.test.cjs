const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), cp=require('node:child_process')
const release=require('./release-package.cjs')
const pair=crypto.generateKeyPairSync('ed25519'), publicPem=pair.publicKey.export({type:'spki',format:'pem'})
function envelope(payload=Buffer.from('signed source payload')) {
 const manifest=Buffer.from(JSON.stringify({format:1,version:'1.6.1',bytes:payload.length,sha256:crypto.createHash('sha256').update(payload).digest('hex')}))
 const header=Buffer.alloc(12);release.MAGIC.copy(header);header.writeUInt32BE(manifest.length,8)
 return Buffer.concat([header,manifest,crypto.sign(null,manifest,pair.privateKey),payload])
}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mobocom-release-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir}
test('release envelope verifies Ed25519, streams exact payload and reports public fingerprint',async t=>{
 const dir=fixture(t), file=path.join(dir,'release'), payload=path.join(dir,'payload');fs.writeFileSync(file,envelope())
 const result=await release.verifyPackage(file,publicPem,payload)
 assert.equal(result.version,'1.6.1');assert.equal(result.keyFingerprint,release.fingerprint(publicPem));assert.equal(fs.readFileSync(payload,'utf8'),'signed source payload')
})
test('wrong publisher, changed manifest/signature/payload, truncation and extra bytes are refused',async t=>{
 const dir=fixture(t), file=path.join(dir,'release'), wrong=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})
 fs.writeFileSync(file,envelope());await assert.rejects(release.verifyPackage(file,wrong))
 for(const offset of [0,11,16,envelope().length-1]) {
  const bytes=envelope();bytes[offset]^=1;fs.writeFileSync(file,bytes);await assert.rejects(release.verifyPackage(file,publicPem))
 }
 for(const bytes of [envelope().subarray(0,90),Buffer.concat([envelope(),Buffer.from('extra')])]){fs.writeFileSync(file,bytes);await assert.rejects(release.verifyPackage(file,publicPem))}
})
test('failed payload verification removes only its newly created output',async t=>{
 const dir=fixture(t), file=path.join(dir,'release'), out=path.join(dir,'payload'), bytes=envelope();bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes)
 await assert.rejects(release.verifyPackage(file,publicPem,out));assert.equal(fs.existsSync(out),false)
 fs.writeFileSync(out,'existing owner file');await assert.rejects(release.verifyPackage(file,publicPem,out));assert.equal(fs.readFileSync(out,'utf8'),'existing owner file')
})
test('stable version comparison is semantic and cannot accept command/ref injection',()=>{
 assert.equal(release.compare('1.10.0','1.9.9'),1);assert.equal(release.compare('1.6.0','1.6.0'),0)
 for(const ref of ['main','1.6.1;id','../1.6.1','v1.6.1','1.6.1-rc.1','1.2','1.2.3\n'])assert.throws(()=>release.compare(ref,'1.6.0'))
})
test('code inventory detects edits and new files while runtime data stays independent',t=>{
 const dir=fixture(t), app=path.join(dir,'app'), inventory=path.join(dir,'inventory.json');fs.mkdirSync(app)
 fs.writeFileSync(path.join(app,'code.js'),'original');fs.mkdirSync(path.join(app,'storage'));fs.writeFileSync(path.join(app,'storage','user'),'customer')
 const run=(command)=>cp.spawnSync(process.execPath,[path.join(__dirname,'release-package.cjs'),command,app,inventory],{encoding:'utf8'})
 assert.equal(run('inventory').status,0);assert.equal(run('clean').status,0)
 fs.mkdirSync(path.join(app,'public/uploads'),{recursive:true});fs.writeFileSync(path.join(app,'public/uploads/customer'),'legacy customer media');assert.equal(run('clean').status,0)
 fs.writeFileSync(path.join(app,'storage/user'),'new customer data');assert.equal(run('clean').status,0)
 fs.writeFileSync(path.join(app,'code.js'),'owner edit');assert.notEqual(run('clean').status,0)
 fs.writeFileSync(path.join(app,'code.js'),'original');fs.writeFileSync(path.join(app,'owner.js'),'new owner file');assert.notEqual(run('clean').status,0)
 fs.unlinkSync(path.join(app,'owner.js'));fs.writeFileSync(path.join(app,'__proto__'),'owner file with a special JS key');assert.notEqual(run('clean').status,0)
})

test('the publisher packs the committed bytes, so a package built on Windows has no CRLF the commit lacks', () => {
  const source = fs.readFileSync(path.join(__dirname, 'build-release-package.cjs'), 'utf8')
  assert.ok(source.includes("run('git',['-c','core.autocrlf=false','-c','core.eol=lf','archive',"), 'git archive keeps the committed line endings')
})
