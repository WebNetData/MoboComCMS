const fs=require('fs'),https=require('https'),assert=require('assert/strict');let server
;(async()=>{const dir=process.argv[2],state={mode:'ok',posts:0,private:false}
 server=https.createServer({key:fs.readFileSync(dir+'/key.pem'),cert:fs.readFileSync(dir+'/cert.pem')},(req,res)=>{
  state.posts++;assert.equal(req.headers.authorization,'synthetic-only');assert.equal(req.headers.host,'cloud.example:2087')
  if(state.mode==='redirect'){res.writeHead(302,{location:'https://evil.invalid'});res.end();return}
  if(state.mode==='large'){res.end(Buffer.alloc(1024*1024+1));return}
  if(state.mode==='stalled'){res.writeHead(200);res.write('partial');return}
  res.end('{"ok":true}')
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const load=require('./connected-source-loader.cjs')({
  'node:dns/promises':{lookup:async()=>[{address:state.private?'127.0.0.1':'8.8.8.8',family:4}]},
  'node:https':{request:(url,options,...args)=>{
   let called=false;options.lookup('cloud.example',{all:false},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);called=true});assert.equal(called,true);assert.equal(options.rejectUnauthorized,undefined)
   const target=new URL(url);target.port=server.address().port
   return https.request(target,{...options,lookup:(_host,opt,cb)=>opt?.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)},...args)
  }},
 }),owner=load('src/modules/hosting/server/drivers/http.ts')
 const send=()=>owner.hostingRequest('https://cloud.example:2087/json-api/version?api.version=1',{headers:{authorization:'synthetic-only'},timeoutMs:state.mode==='stalled'?1000:5000})
 assert.equal((await send()).text,'{"ok":true}');state.mode='redirect';await assert.rejects(send(),e=>e.code==='REDIRECT');assert.equal(state.posts,2)
 state.mode='large';await assert.rejects(send(),e=>e.code==='RESPONSE_SIZE')
 state.mode='stalled';await assert.rejects(send(),e=>e.code==='TIMEOUT')
 const count=state.posts;await assert.rejects(owner.hostingRequest('https://wrong.example:2087/',{headers:{authorization:'synthetic-only'}}),e=>e.code==='TLS');assert.equal(state.posts,count)
 state.private=true;await assert.rejects(send(),e=>e.code==='DESTINATION');await assert.rejects(owner.hostingRequest('http://cloud.example/'),e=>e.code==='DESTINATION');assert.equal(state.posts,count)
 console.log('Actual Hosting TLS/pinning/redirect/body/deadline checks passed')
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{server?.closeAllConnections();server?.close()})
