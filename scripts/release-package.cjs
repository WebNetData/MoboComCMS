// Shared publisher/host verifier. Runtime copy is root-owned, with a root-pinned public key.
const fs = require('node:fs'), fsp = fs.promises, crypto = require('node:crypto')
const { Transform } = require('node:stream'), { pipeline } = require('node:stream/promises')
const MAGIC = Buffer.from('MBCREL01'), MAX_BYTES = 512 * 1024 * 1024
const path = require('node:path')
const skipped = name => ['storage','var','.git','node_modules','.next'].includes(name) || name.startsWith('.env')
async function inventory(root) {
  const result=Object.create(null)
  async function walk(dir, prefix='') {
    for(const item of await fsp.readdir(dir,{withFileTypes:true})) {
      if(!prefix && skipped(item.name)) continue
      const relative=prefix+item.name, absolute=path.join(dir,item.name)
      if(relative==='public/demo'||relative==='public/uploads')continue
      if(item.isSymbolicLink()) throw Error('CODE_LINK_REFUSED')
      if(item.isDirectory()) await walk(absolute,relative+'/')
      else if(item.isFile()) { const h=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(absolute))h.update(bytes);result[relative]=h.digest('hex') }
      else throw Error('CODE_TYPE_REFUSED')
    }
  }
  await walk(root);return result
}
const validVersion = value => typeof value === 'string' && value === value.trim() && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value)
function compare(a, b) {
  if (!validVersion(a) || !validVersion(b)) throw Error('STABLE_VERSION_REQUIRED')
  const x=a.split('.').map(Number), y=b.split('.').map(Number)
  for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i]?1:-1
  return 0
}
function publicKey(pem) {
  const key=crypto.createPublicKey(pem)
  if(key.asymmetricKeyType!=='ed25519') throw Error('ED25519_KEY_REQUIRED')
  return key
}
function fingerprint(pem) { return crypto.createHash('sha256').update(publicKey(pem).export({type:'spki',format:'der'})).digest('hex') }
async function trustedKey(file) {
  const stat=await fsp.lstat(file)
  if(!stat.isFile() || stat.isSymbolicLink() || (typeof process.getuid==='function' && (stat.uid!==0 || (stat.mode&0o022)))) throw Error('ROOT_PINNED_KEY_REQUIRED')
  return fsp.readFile(file)
}
async function verifyPackage(file, pem, payload) {
  const fd=await fsp.open(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW||0))
  let outputCreated=false
  try {
    const stat=await fd.stat()
    if(!stat.isFile() || stat.size>MAX_BYTES || stat.size<78) throw Error('INVALID_PACKAGE_SIZE')
    const header=Buffer.alloc(12)
    if((await fd.read(header,0,12,0)).bytesRead!==12 || !header.subarray(0,8).equals(MAGIC)) throw Error('INVALID_PACKAGE_HEADER')
    const length=header.readUInt32BE(8)
    if(length<2 || length>8192) throw Error('INVALID_MANIFEST_SIZE')
    const bytes=Buffer.alloc(length), signature=Buffer.alloc(64)
    if((await fd.read(bytes,0,length,12)).bytesRead!==length || (await fd.read(signature,0,64,12+length)).bytesRead!==64) throw Error('TRUNCATED_PACKAGE')
    if(!crypto.verify(null,bytes,publicKey(pem),signature)) throw Error('INVALID_RELEASE_SIGNATURE')
    const manifest=JSON.parse(bytes.toString('utf8')), offset=12+length+64
    if(manifest.format!==1 || !validVersion(manifest.version) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes<1 || manifest.bytes!==stat.size-offset) throw Error('INVALID_RELEASE_MANIFEST')
    const hash=crypto.createHash('sha256')
    const input=fs.createReadStream(file,{fd:fd.fd,autoClose:false,start:offset})
    const meter=new Transform({transform(chunk,_encoding,done){ hash.update(chunk); done(null,chunk) }})
    if(payload) {
      const output=await fsp.open(payload,'wx',0o600); outputCreated=true
      await pipeline(input,meter,output.createWriteStream())
    } else {
      meter.on('data',()=>{})
      await pipeline(input,meter)
    }
    if(hash.digest('hex')!==manifest.sha256) throw Error('RELEASE_HASH_MISMATCH')
    return {format:1,version:manifest.version,sha256:manifest.sha256,bytes:manifest.bytes,keyFingerprint:fingerprint(pem)}
  }catch(error){if(outputCreated)await fsp.unlink(payload).catch(()=>{});throw error}
  finally{await fd.close()}
}
async function cli() {
  const [command,file,key,out]=process.argv.slice(2)
  if(command==='verify') return console.log(JSON.stringify(await verifyPackage(file,await trustedKey(key),out)))
  if(command==='compare') { if(compare(file,key)<=0) throw Error('NEWER_VERSION_REQUIRED');return }
  if(command==='fingerprint') return console.log(fingerprint(await fsp.readFile(file)))
  if(command==='inventory') return fsp.writeFile(key,JSON.stringify(await inventory(file)),{flag:'wx',mode:0o600})
  if(command==='clean') {
    const before=JSON.parse(await fsp.readFile(key,'utf8')),now=await inventory(file)
    const names=Object.keys(before)
    if(names.length!==Object.keys(now).length || names.some(name=>before[name]!==now[name]))throw Error('LOCAL_WORK_PRESERVED')
    return
  }
  throw Error('INVALID_PACKAGE_COMMAND')
}
module.exports={MAGIC,MAX_BYTES,validVersion,compare,fingerprint,verifyPackage}
if(require.main===module)cli().catch(()=>{console.error('[release] package verification refused');process.exitCode=1})
