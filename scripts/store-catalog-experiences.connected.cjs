// Native bounded quality reads and transactional device/condition authoring on disposable PostgreSQL.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
assert(/test|check|store_experiences_/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required');
const db=new PrismaClient(),stamp='catalog-experience-'+Date.now(),products=[];
const load=require('./connected-source-loader.cjs')({
  '@/platform/database/prisma':{db},
  '@/modules/settings/server':{readJsonSetting:async()=>null,getSettings:async()=>({})},
  '@/modules/catalog/server/storefront':{isStoreEnabled:async()=>true},
  '@/modules/content/server/revisions':{RevisionError:class extends Error {constructor(message,status){super(message);this.status=status}}},
});
const {replaceDeviceCompatibility,lookupDeviceCompatibility}=load('src/modules/catalog/server/device-compatibility.ts');
const {readCatalogQuality}=load('src/modules/catalog/server/quality.ts');
const {productRevisionState,restoreProductRevision}=load('src/modules/catalog/server/revision-state.ts');
const {snapshotOf}=load('src/modules/content/domain/revisions.ts');
;(async()=>{
 const product=await db.product.create({data:{name:stamp,slug:stamp,kind:'PHYSICAL',active:true,approval:'APPROVED',condition:'USED',conditionGrade:'B',conditionNotes:'دستگاه واقعی آزمایشی',price:1000,priceMinor:1000n,currency:'IRT'}});products.push(product.id);
 await db.$transaction(tx=>replaceDeviceCompatibility(tx,product.id,[{deviceModel:'مدل كی ۱۲',status:'CONDITIONAL',note:'فقط NVMe',source:'دفترچهٔ آزمایش'}]));
 assert.equal((await lookupDeviceCompatibility(stamp,'مدل کی 12')).status,'CONDITIONAL');
 assert.equal(await lookupDeviceCompatibility(stamp,'مدل کی'),null,'partial names never infer compatibility');
 await assert.rejects(db.$transaction(async tx=>{await tx.product.update({where:{id:product.id},data:{condition:'REFURBISHED'}});await replaceDeviceCompatibility(tx,product.id,[{deviceModel:'تغییر',status:'COMPATIBLE'}]);throw Error('audit-fault')}),/audit-fault/);
 assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).condition,'USED');
 assert.equal((await lookupDeviceCompatibility(stamp,'مدل کی 12')).status,'CONDITIONAL','failed authoring/audit transaction preserves prior device declarations');
 const snapshot=snapshotOf(await productRevisionState(product.id));
 await db.$transaction(async tx=>{await tx.product.update({where:{id:product.id},data:{condition:'REFURBISHED',healthReport:'تغییر'}});await replaceDeviceCompatibility(tx,product.id,[{deviceModel:'تازه',status:'INCOMPATIBLE'}])});
 await restoreProductRevision(product.id,snapshot);
 assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).condition,'USED');
 assert.equal((await lookupDeviceCompatibility(stamp,'مدل کی 12')).status,'CONDITIONAL','revision restores device evidence with condition');
 await assert.rejects(db.$transaction(tx=>replaceDeviceCompatibility(tx,product.id,[{deviceModel:'model',status:'COMPATIBLE'},{deviceModel:'MODEL',status:'INCOMPATIBLE'}])));
 const quality=await readCatalogQuality(product.id-1,product.id);
 assert.deepEqual(quality.rows[0].issues.sort(),['health','photo','warranty']);assert.equal(quality.rows.length,1);assert.equal(quality.nextAfter,null);
 await db.product.update({where:{id:product.id},data:{healthReport:'آزمایش شد',warranty:'هفت روز',image:'/test.png'}});
 assert.deepEqual((await readCatalogQuality(product.id-1,product.id)).rows[0].issues,[]);
 const compareLoad=require('./connected-source-loader.cjs')({
  '@/platform/database/prisma':{db}, '@/extensions/server/modules':{isModuleEnabled:async()=>true},
  '@/modules/content/server/registry':{itemCards:async()=>new Map([[`product:${product.id}`,{title:product.name,url:`/products/${stamp}`,image:'',subtitle:'',access:''}]])},
  '@/modules/reviews/server/reviews':{ratingsFor:async()=>new Map(),dimensionSummariesFor:async()=>new Map()},
  '@/modules/vocabulary/server/vocabulary':{listLabels:async()=>[]},
 });
 const comparison=await compareLoad('src/modules/compare/server/compare.ts').compareItems([{type:'product',id:product.id}]);
 assert.deepEqual(comparison.rows.find(row=>row.label==='وضعیت کالا').values,['کارکرده']);
 assert.deepEqual(comparison.rows.find(row=>row.label==='ضمانت').values,['هفت روز']);
 await db.product.update({where:{id:product.id},data:{active:false}});assert.equal(await lookupDeviceCompatibility(stamp,'مدل کی 12'),null);
 console.log('PASS catalogue condition/device persistence, exact normalization, transaction rollback, duplicate refusal, bounded actionable quality and hidden product refusal');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await db.productDeviceCompatibility.deleteMany({where:{productId:{in:products}}});await db.product.deleteMany({where:{id:{in:products}}});await db.$disconnect()});
