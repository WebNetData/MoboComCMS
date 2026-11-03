const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api')
const cache=new Map()
function load(file){file=path.resolve(__dirname,'..',file);if(!fs.existsSync(file)&&file.endsWith('.ts'))file=file.slice(0,-3)+'/index.ts';if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(file),name+'.ts')));return require(name)},mod,mod.exports);return mod.exports}
const p=load('src/modules/account/domain/price-adjustments.ts'),price=load('src/modules/store/server/pricing.ts').unitPrice
test('250,000 toman: percentage, amount, separate price and free use exact minor units',()=>{
 const cases=[['PERCENT','20',200000n],['AMOUNT','۵۰٬۰۰۰',200000n],['PRICE','۱۹۰۰۰۰',190000n],['FREE','',0n],['PERCENT','100',0n],['AMOUNT','300000',0n]]
 for(const[mode,value,expected]of cases)assert.equal(p.adjustedPrice(250000n,p.normalizeAdjustment({mode,value},'IRT')),expected)
 assert.equal(p.adjustedPrice(85000n,p.normalizeAdjustment({mode:'PERCENT',value:'۱۲.۵۰'},'IRT')),74375n)
 assert.equal(p.normalizeAdjustment({mode:'PRICE',value:'9.99'},'USD').value,'999')
})
test('discount rounds the final amount down and never becomes negative or raises the price',()=>{
 assert.equal(p.adjustedPrice(1n,p.normalizeAdjustment({mode:'PERCENT',value:'1'},'IRT')),0n)
 assert.equal(p.adjustedPrice(85000n,p.normalizeAdjustment({mode:'PRICE',value:'100000'},'IRT')),85000n)
 for(let base=1n;base<1000n;base+=7n)for(const mode of ['AMOUNT','PERCENT','PRICE','FREE']){const rule=p.normalizeAdjustment({mode,value:mode==='PERCENT'?'13.57':'155'},'IRT'),result=p.adjustedPrice(base,rule);assert.ok(result>=0n&&result<=base)}
})
test('audience inputs reject duplicate/unknown targets and malformed or excessive amounts',()=>{
 for(const value of ['-1','101','0','1e2','10.001','NaN'])assert.throws(()=>p.normalizeAdjustment({mode:'PERCENT',value},'IRT'))
 assert.throws(()=>p.normalizeAdjustment({mode:'PRICE',value:'99999999999999999999'},'IRT'))
 assert.throws(()=>p.normalizeAudiencePrices([{audience:'vip',mode:'FREE'},{audience:'vip',mode:'FREE'}],'IRT'))
 assert.throws(()=>p.normalizeAudiencePrices([{audience:'role:1',mode:'FREE'}],'IRT'))
 const rules=p.normalizeAudiencePrices([{audience:'group:42',mode:'PERCENT',value:'12.5'}],'IRT')
 assert.deepEqual(p.readAudiencePrices(JSON.stringify(rules)),rules);assert.equal(p.adjustmentInput(rules[0],'IRT').value,'12.50')
})
const product={id:42,price:250000,priceMinor:250000n,memberPriceMinor:220000n,compareAtMinor:0n,saleEndsAt:null,currency:'IRT',digitalMode:'FILES',vipPricing:JSON.stringify({mode:'PERCENT',value:'2000'})}
test('file-store filter round-trips independently of ordinary digital products and physical filters',()=>{
 const store=load('src/modules/store/domain/store.ts'),query=store.parseShopQuery({kind:'VIRTUAL',files:'1'})
 assert.equal(query.files,true);assert.equal(store.isStoreFront(query),false)
 assert.equal(new URLSearchParams(store.shopQueryString(query)).get('files'),'1')
 assert.equal(store.parseShopQuery({kind:'PHYSICAL',files:'1'}).files,false)
 assert.equal(store.isStoreFront(store.parseShopQuery({kind:'VIRTUAL'})),true)
 const configured=store.normalizeStoreSettings({showFileStore:false,fileStoreTitle:'فایل‌های ویژهٔ ما',fileStoreDescription:'نسخهٔ کامل'})
 assert.equal(configured.showFileStore,false);assert.equal(configured.fileStoreTitle,'فایل‌های ویژهٔ ما')
})
test('VIP and two groups choose the lowest eligible result without stacking',()=>{
 const deal={percent:10,prices:new Map([['42:0',210000n]]),adjustments:new Map([['42:0',[{mode:'AMOUNT',value:'60000'},{mode:'PERCENT',value:'1500'}]]])}
 assert.equal(price(product,null,true,undefined,deal).unitMinor,190000n)
 assert.equal(price(product,null,false).unitMinor,250000n)
 assert.equal(price(product,null,true).unitMinor,200000n)
})
test('only FILES delivery accepts a zero special price; legacy zero VIP is still no offer',()=>{
 const free={percent:0,prices:new Map(),adjustments:new Map([['42:0',[{mode:'FREE',value:'0'}]]])}
 assert.equal(price(product,null,false,undefined,free).unitMinor,0n)
 assert.equal(price({...product,digitalMode:'MANUAL'},null,false,undefined,free).unitMinor,250000n)
 assert.equal(price({...product,vipPricing:'',memberPriceMinor:0n},null,true).unitMinor,250000n)
})
