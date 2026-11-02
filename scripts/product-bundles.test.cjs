const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript-api')
const mod={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('src/modules/catalog/domain/product-bundles.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod,mod.exports)
const parse=mod.exports.parseProductBundles, source=3
const bundle=()=>({id:9,name:'  Starter kit  ',nameEn:' Starter kit ',active:true,components:[{productId:source,variantId:7,quantity:1},{productId:4,quantity:2}]})
function load(file,mocks={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];throw Error(`Unexpected dependency ${name}`)},mod,mod.exports);return mod.exports}
test('fixed bundle definition preserves owner anchor, explicit variants, quantities and order without pricing inputs',()=>{
 const input=bundle();input.price=0;const result=parse([input],source)[0]
 assert.deepEqual(result,{id:9,name:'Starter kit',nameEn:'Starter kit',active:true,components:[{productId:source,variantId:7,quantity:1},{productId:4,variantId:null,quantity:2}]})
 assert.deepEqual(parse([],source),[])
})
test('bundle definitions reject missing anchor, duplicate refs/identities, invalid or oversized fields',()=>{
 const mutations=[b=>b.components.shift(),b=>b.components.push({...b.components[0]}),b=>b.components[0].quantity=31,b=>b.components[0].quantity=0,b=>b.components[0].productId='3',b=>b.components[0].variantId=0,b=>b.name='<script>',b=>b.name=' ',b=>b.nameEn='a'.repeat(121),b=>b.active='true',b=>b.id=-1,b=>b.components=Array.from({length:13},(_,i)=>({productId:i+1,quantity:1}))]
 for(const mutate of mutations){const b=bundle();mutate(b);assert.throws(()=>parse([b],source))}
 assert.throws(()=>parse([bundle(),bundle()],source));assert.throws(()=>parse(Array.from({length:9},bundle),source));assert.throws(()=>parse([],0));assert.throws(()=>parse({},source))
})
test('bundle rollout starts off and legacy settings clients preserve it',()=>{
 const {DEFAULT_STORE_SETTINGS,normalizeStoreSettings}=load('src/modules/store/domain/store.ts')
 assert.equal(DEFAULT_STORE_SETTINGS.showProductBundles,false)
 const current=normalizeStoreSettings({showProductBundles:true});assert.equal(normalizeStoreSettings({offerTitle:'Updated'},current).showProductBundles,true)
 assert.equal(normalizeStoreSettings({showProductBundles:false},current).showProductBundles,false)
})
test('bundle public reads stop before definition lookup when module, rollout or source is closed',async()=>{
 for(const state of ['module-off','paused','missing','private','ready']){
  let reads=0
  const service=load('src/modules/store/server/bundles.ts',{
   '@/platform/database/prisma':{db:{product:{findUnique:async()=>state==='missing'?null:{active:true,approval:state==='private'?'PENDING':'APPROVED'}}}},
   '@/modules/catalog/domain/product-publication':load('src/modules/catalog/domain/product-publication.ts'),
   '@/modules/catalog/server/product-bundles':{productBundleDefinitions:async()=>{reads++;return[]}},
   '@/modules/catalog/server/storefront':{isStoreEnabled:async()=>state!=='module-off'},
   '@/modules/membership/server/membership':{opensMembersOnly:async(_userId,member)=>!!member},'@/modules/store/domain/store':load('src/modules/store/domain/store.ts'),
   '@/modules/store/server/catalog':{getStoreSettings:async()=>({showProductBundles:state!=='paused'})},
   '@/modules/store/server/cart':{},'@/modules/store/server/pricing':{},'@/shared/money':{},
   '@/modules/account/server/user-groups':{groupDeal:async()=>({percent:0,prices:new Map()})},
   '@/modules/account/server/item-audience':{userOpensAudience:async raw=>!raw},
  })
  const result=await service.readProductBundles(1,null)
  if(state==='ready'){assert.deepEqual(result,{items:[]});assert.equal(reads,1)}else{assert.equal(result,null);assert.equal(reads,0)}
 }
})
