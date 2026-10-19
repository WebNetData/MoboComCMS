// Actual encrypted grants, media issuers and Identity on PostgreSQL; upstream/clean/settings are boundary doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient(),stamp=`mask-authority-${Date.now()}`,cache=new Map(),users=[],films=[],artists=[],fetched=[],cleaned=[];
let unavailable=false,viewerId=null,cleanResult=false;
const db=new Proxy(prisma,{get(target,key){if(key==='accessRestriction')return new Proxy(target[key],{get(model,method){if(method==='findMany')return args=>{if(unavailable)throw Error('fixture storage unavailable');return model.findMany(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}});
const settings={maskMode:'external',maskExclude:[],maskTtlHours:1,renamePattern:'',scrubWords:[],enforceTokens:false,requireLogin:false,hosts:[]};
function load(relative){
 const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(name=>{
  if(name==='@/platform/database/prisma')return {db};
  if(name==='@/platform/config/env')return {authSecret:()=> 'owned-mask-authority-fixture'};
  if(name==='@/platform/observability/logger')return {logEvent:()=>{}};
  if(name==='@/modules/settings/server')return {getSettings:async()=>({siteUrl:'https://site.example.invalid'})};
  if(name==='@/extensions/server/modules')return {isModuleEnabled:async()=>true,getModuleSettings:async()=>({})};
  if(name==='@/modules/membership/server/membership')return {getViewer:async()=>({userId:viewerId,member:false})};
  if(name==='@/modules/paywall/server/paywall')return {accessFor:async()=>({key:null,decision:{open:true}})};
  if(name==='@/modules/media/server/playback-prefs')return {getPlaybackPrefs:async()=>({subtitle:''})};
  if(name==='@/modules/downloads/server/guard')return {getDownloadSettings:async()=>settings,downloadGuardEnabled:async()=>false,signOriginUrl:url=>url,logDownload:async()=>{},downloaderOf:(_headers,viewer)=>viewer};
  if(name==='@/modules/downloads/server/clean')return {cleanedCopy:async(...args)=>{cleaned.push(args);return cleanResult?'/owned-cleaned-fixture':null},serveCleaned:async req=>new Response(req.method==='HEAD'?null:'cleaned',{headers:{'Cache-Control':'private, max-age=3600'}})};
  if(name.startsWith('@/')){const candidate='src/'+name.slice(2);if(candidate.endsWith('.json'))return JSON.parse(fs.readFileSync(candidate,'utf8'));return load(fs.existsSync(candidate+'.ts')?candidate+'.ts':candidate+'/index.ts')}
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name);
 },mod,mod.exports);return mod.exports;
}
const mask=load('src/modules/downloads/server/mask.ts'),media=load('src/modules/media/server/links.ts');
const input={u:'https://files.example.invalid/folder/film.mp4',e:Math.floor(Date.now()/1000)+3600,d:1,n:'film.mp4'};
const serve=(token,method='GET',name=['film.mp4'],headers={})=>mask.serveMasked(new Request('https://site.example.invalid/dl/fixture/film.mp4',{method,headers}),token,name);
async function restriction(user,extra={}){return prisma.accessRestriction.create({data:{userId:user.id,scope:'GLOBAL',effectKey:'identity.suspend',capabilities:'["identity.authenticate"]',reason:stamp,...extra}})}
async function clear(user){await prisma.accessRestriction.deleteMany({where:{userId:user.id,reason:stamp}})}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{fetched.push({url,options});return new Response(options.method==='HEAD'?null:'abc',{status:options.headers.Range?206:200,headers:{'Content-Type':'video/mp4','Content-Length':'3',...(options.headers.Range?{'Content-Range':'bytes 0-2/9'}:{})}})};
async function main(){
 for(const role of ['CUSTOMER','ADMIN'])users.push(await prisma.user.create({data:{email:`${stamp}-${role}@example.invalid`,passwordHash:'fixture-only',role}}));
 const owner=users[0],token=mask.sealLink({...input,a:owner.id});assert.deepEqual(mask.openLink(token),{...input,a:owner.id});
 const allowed=async()=>{const result=await serve(token);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(await result.text(),'abc')};
 const denied=async label=>{for(const method of ['GET','HEAD'])for(const name of [['film.mp4'],['segment.ts']]){const before=[fetched.length,cleaned.length];const result=await serve(token,method,name,{range:'bytes=0-2'});assert.equal(result.status,423,label);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual([fetched.length,cleaned.length],before,'no upstream or clean-cache lookup')}};
 await allowed();
 const range=await serve(token,'GET',['film.mp4'],{range:'bytes=0-2','if-range':'fixture-etag'});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 0-2/9');assert.equal(fetched.at(-1).options.headers['If-Range'],'fixture-etag');await range.body.cancel();
 assert.equal((await serve(token,'HEAD')).body,null);assert.equal(fetched.at(-1).options.method,'HEAD');
 assert.equal((await serve(token,'GET',['segment.ts'])).status,200);assert.equal(fetched.at(-1).url,'https://files.example.invalid/folder/segment.ts');
 cleanResult=true;const clean=await serve(token);assert.equal(await clean.text(),'cleaned');assert.equal(clean.headers.get('cache-control'),'private, no-store');
 const ban=await restriction(owner),overlap=await restriction(owner);await denied('GLOBAL denies cache and upstream');await prisma.accessRestriction.update({where:{id:ban.id},data:{revokedAt:new Date()}});await denied('overlap remains');await prisma.accessRestriction.update({where:{id:overlap.id},data:{revokedAt:new Date()}});cleanResult=false;await allowed();await clear(owner);
 for(const extra of [{scope:'MODULE',moduleKey:'forum',effectKey:'forum.suspend',capabilities:'["forum.post"]'},{startsAt:new Date(Date.now()+60000)},{startsAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)}]){await restriction(owner,extra);await allowed();await clear(owner)}
 await prisma.user.update({where:{id:owner.id},data:{status:'BANNED'}});await denied('standing');await prisma.user.update({where:{id:owner.id},data:{status:'ACTIVE',passwordChangedAt:new Date()}});await allowed();
 await restriction(users[1]);assert.equal((await serve(mask.sealLink({...input,a:users[1].id}))).status,423,'full ADMIN not exempt');await clear(users[1]);
 unavailable=true;for(const method of ['GET','HEAD']){const before=[fetched.length,cleaned.length];await assert.rejects(serve(token,method),/storage unavailable/);assert.deepEqual([fetched.length,cleaned.length],before)}unavailable=false;
 for(const a of [0,-1,1.5,'1',null]){const malformed=mask.sealLink({...input,a});assert.equal(mask.openLink(malformed),null);assert.equal((await serve(malformed)).status,404)}
 assert.equal((await serve(mask.sealLink({...input,e:1,a:owner.id}))).status,410);assert.equal((await serve('not-a-token')).status,404);
 assert.equal((await serve((token[0]==='A'?'B':'A')+token.slice(1))).status,404,'authenticated ciphertext rejects tampering');
 assert.equal((await serve(mask.sealLink({...input,a:2147483647}))).status,423,'missing current account is not an anonymous grant');
 const before=fetched.length;assert.equal((await serve(token,'GET',['..','elsewhere.bin'])).status,404);assert.equal(fetched.length,before);
 const legacy=mask.sealLink(input);await restriction(owner);assert.equal((await serve(legacy)).status,200,'legacy bearer token cannot acquire an invented owner');await clear(owner);
 // Actual three media issuer functions, real rows, real mask construction (no source-string assertion).
 films.push(await prisma.cinemaTitle.create({data:{slug:stamp,title:stamp,kind:'MOVIE'}}));
 const link=await prisma.mediaLink.create({data:{ownerType:'title',ownerId:films[0].id,kind:'STREAM',url:input.u}});
 artists.push(await prisma.musicArtist.create({data:{slug:stamp,name:stamp}}));const track=await prisma.musicTrack.create({data:{artistId:artists[0].id,slug:stamp,title:stamp,audioUrl:'https://files.example.invalid/song.mp3'}});
 const payloadOf=url=>mask.openLink(new URL(url,'https://site.example.invalid').pathname.split('/')[2]);
 viewerId=owner.id;
 assert.equal(payloadOf((await media.openMediaLink(new Request('https://site.example.invalid/api/media/link/'+link.id),String(link.id))).headers.get('location')).a,owner.id);
 assert.equal(payloadOf((await media.openTrack(new Request('https://site.example.invalid/api/media/track/'+track.id),String(track.id))).headers.get('location')).a,owner.id);
 assert.equal(payloadOf((await media.watchSource(String(link.id),null,new Headers())).src).a,owner.id);
 viewerId=null;assert.equal(payloadOf((await media.openTrack(new Request('https://site.example.invalid/api/media/track/'+track.id),String(track.id))).headers.get('location')).a,undefined,'guest remains anonymous');
 await assert.rejects(mask.maskedHref(input.u,{download:true,userId:0}),/Invalid masked-link account/);
 console.log('Masked file authority: actual PostgreSQL/Identity/encrypted grants and three real media issuers; standing/GLOBAL overlap/revoke/expiry/module/Admin, no fetch/clean on denial/outage, legacy/guest, malformed/expired tokens, GET/HEAD/range/sibling/clean-cache no-store and restoration passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{globalThis.fetch=originalFetch;try{await prisma.mediaLink.deleteMany({where:{ownerType:'title',ownerId:{in:films.map(f=>f.id)}}});await prisma.cinemaTitle.deleteMany({where:{id:{in:films.map(f=>f.id)},slug:stamp}});await prisma.musicArtist.deleteMany({where:{id:{in:artists.map(a=>a.id)},slug:stamp}});await prisma.accessRestriction.deleteMany({where:{userId:{in:users.map(u=>u.id)},reason:stamp}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}})}finally{await prisma.$disconnect()}});
