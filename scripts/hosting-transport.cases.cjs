const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process')
test('Hosting HTTPS pins DNS, verifies certificates, refuses redirects, caps bytes and covers stalled body',{skip:process.platform==='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hosting-https-'))
 try{cp.execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/key.pem','-out',dir+'/cert.pem','-days','1','-subj','/CN=cloud.example','-addext','subjectAltName=DNS:cloud.example'],{stdio:'ignore'})
 const result=cp.spawnSync(process.execPath,['scripts/hosting-transport.probe.cjs',dir],{cwd:process.cwd(),env:{...process.env,NODE_EXTRA_CA_CERTS:dir+'/cert.pem'},encoding:'utf8',timeout:20000,maxBuffer:2e6});assert.equal(result.status,0,(result.stdout||'')+(result.stderr||'')+(result.error?.message||''))
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
