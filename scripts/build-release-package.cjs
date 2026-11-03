// Publisher-only tool. Destination servers require neither Git nor GitHub.
const fs=require('node:fs'), fsp=fs.promises, path=require('node:path'), os=require('node:os'), cp=require('node:child_process'), crypto=require('node:crypto')
const {pipeline}=require('node:stream/promises'), {MAGIC,MAX_BYTES,validVersion,fingerprint}=require('./release-package.cjs')
const root=path.resolve(__dirname,'..')
let phase='arguments'
const python=process.env.PYTHON || (process.platform==='win32'?'python':'python3')
const run=(cmd,args)=>cp.execFileSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024})
async function main(){
 const [command,output,keyFile]=process.argv.slice(2)
 if(!output)throw Error('Usage: node scripts/build-release-package.cjs keygen <private-directory> | build <output-directory> <private-key.pem>')
 const dest=path.resolve(output);await fsp.mkdir(dest,{recursive:true,mode:0o700})
 if(command==='keygen'){
  const relative=path.relative(root,dest);if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw Error('SIGNING_KEYS_MUST_BE_OUTSIDE_SOURCE')
  const pair=crypto.generateKeyPairSync('ed25519')
  await fsp.writeFile(path.join(dest,'release-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600})
  await fsp.writeFile(path.join(dest,'release-public.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx',mode:0o644})
  console.log('Signing key created. Keep release-private.pem offline; never ship it.');return
 }
 if(command!=='build'||!keyFile)throw Error('PRIVATE_SIGNING_KEY_REQUIRED')
 phase='signing-key'
 const signingKey=crypto.createPrivateKey(await fsp.readFile(keyFile));if(signingKey.asymmetricKeyType!=='ed25519')throw Error('ED25519_KEY_REQUIRED')
 const publicPem=crypto.createPublicKey(signingKey).export({type:'spki',format:'pem'})
 phase='source-version'
 const version=JSON.parse(run('git',['show','HEAD:package.json'])).version;if(!validVersion(version))throw Error('STABLE_VERSION_REQUIRED')
 const stage=await fsp.mkdtemp(path.join(os.tmpdir(),'mobocom-publish-'));await fsp.chmod(stage,0o700)
 const created=[];let complete=false
 try{
  phase='source-archive'
  run('git',['archive','--format=tar','--output',path.join(stage,'source.tar'),'HEAD'])
  phase='source-filter'
  run(python,['deploy/ubuntu/release-extract.py','pack',path.join(stage,'source.tar'),path.join(stage,'payload.tar.gz')])
  phase='payload-signature'
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(path.join(stage,'payload.tar.gz')))hash.update(chunk)
  const bytes=(await fsp.stat(path.join(stage,'payload.tar.gz'))).size;if(bytes>MAX_BYTES-10000)throw Error('RELEASE_TOO_LARGE')
  const manifest=Buffer.from(JSON.stringify({format:1,version,sha256:hash.digest('hex'),bytes,commit:run('git',['rev-parse','HEAD']).trim()}))
  const signature=crypto.sign(null,manifest,signingKey), header=Buffer.alloc(12);MAGIC.copy(header);header.writeUInt32BE(manifest.length,8)
  const name=`mobocom-${version}.mbrelease`, release=path.join(dest,name)
  await fsp.writeFile(release,Buffer.concat([header,manifest,signature]),{flag:'wx',mode:0o600})
  created.push(release)
  await pipeline(fs.createReadStream(path.join(stage,'payload.tar.gz')),fs.createWriteStream(release,{flags:'a'}))
  phase='bootstrap'
  const bundle=path.join(stage,'bootstrap');await fsp.mkdir(bundle,{mode:0o700})
  const assets={'install.sh':'deploy/ubuntu/install.sh','platform.sh':'deploy/ubuntu/platform.sh','release-package.cjs':'scripts/release-package.cjs','release-extract.py':'deploy/ubuntu/release-extract.py'}
  for(const [name,file]of Object.entries(assets))await fsp.writeFile(path.join(bundle,name),run('git',['show',`HEAD:${file}`]),{mode:0o600})
  await fsp.copyFile(release,path.join(bundle,'release.mbrelease'));await fsp.writeFile(path.join(bundle,'release-public.pem'),publicPem)
  run(python,['-c',"import tarfile,sys,pathlib; root=pathlib.Path(sys.argv[1]); t=tarfile.open(sys.argv[2],'w:gz'); [t.add(p,arcname=p.name,recursive=False) for p in sorted(root.iterdir())]; t.close()",bundle,path.join(stage,'bootstrap.tar.gz')])
  const stub=`#!/usr/bin/env bash\nset -euo pipefail\n[ \"$(id -u)\" -eq 0 ] || { echo 'Run with sudo bash' >&2; exit 1; }\nwork=$(mktemp -d /root/mobocom-bootstrap.XXXXXXXX)\ntrap 'rm -rf -- \"$work\"' EXIT\nline=$(awk '/^__MOBOCOM_BUNDLE__$/ {print NR+1; exit}' \"$0\")\ntail -n +\"$line\" \"$0\" | base64 --decode | tar -xz -C \"$work\"\nbash \"$work/install.sh\" --package \"$work/release.mbrelease\" --public-key \"$work/release-public.pem\" \"$@\"\nexit 0\n__MOBOCOM_BUNDLE__\n`
  phase='installer-output'
  const installer=path.join(dest,`mobocom-setup-${version}.run`)
  await fsp.writeFile(installer,stub+(await fsp.readFile(path.join(stage,'bootstrap.tar.gz'))).toString('base64').match(/.{1,76}/g).join('\n')+'\n',{flag:'wx',mode:0o700})
  created.push(installer)
  await fsp.writeFile(path.join(dest,'release-public.pem'),publicPem,{flag:'wx',mode:0o644})
  created.push(path.join(dest,'release-public.pem'))
  const sum=crypto.createHash('sha256').update(await fsp.readFile(installer)).digest('hex')
  await fsp.writeFile(installer+'.sha256',`${sum}  ${path.basename(installer)}\n`,{flag:'wx'})
  created.push(installer+'.sha256');complete=true
  console.log(JSON.stringify({version,package:name,installer:path.basename(installer),bytes,keyFingerprint:fingerprint(publicPem)}))
 }finally{if(!complete)for(const file of created)await fsp.unlink(file).catch(()=>{});await fsp.rm(stage,{recursive:true,force:true})}
}
main().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:`Release packaging failed at ${phase} (${error.code||'INVALID_INPUT'}); check inputs and output collisions`);process.exitCode=1})
