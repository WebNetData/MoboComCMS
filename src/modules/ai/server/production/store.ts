import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm, type AuthedUser } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { toolById, operationModule } from '../../domain/operations'
import { parseProduction, productionTool, ProductionError, type ProductionKind, type ProductionConfig, type ProductionSeed, type ProductionOutput, type ProductionImage } from '../../domain/production'
import { randomUUID } from 'node:crypto'
import { auditAdminStrict } from '@/platform/audit/server'
import { validateCatalogDraft } from '@/modules/catalog/server/create'
type Reader = Prisma.TransactionClient
export type Batch = NonNullable<Awaited<ReturnType<typeof db.aiProductionBatch.findUnique>>> & { items: Awaited<ReturnType<typeof db.aiProductionItem.findMany>> }
export async function productionActor(req: NextRequest, kind: ProductionKind, reader: Reader | typeof db = db): Promise<AuthedUser> {
  const tool=toolById(productionTool(kind)); if(!tool)throw new ProductionError('نوع تولید معتبر نیست')
  const actor=await requirePerm(req,tool.permission,reader);if(!actor)throw new ProductionError('دسترسی این بخش را ندارید',403)
  const module=operationModule(tool.id)
  if(!await isModuleEnabled('ai-assistant')||module&&!await isModuleEnabled(module))throw new ProductionError('ماژول این بخش غیرفعال است',423)
  return actor
}
export async function owned(req: NextRequest, id: unknown, reader: Reader | typeof db = db) {
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new ProductionError('شناسهٔ دسته معتبر نیست')
  const batch=await reader.aiProductionBatch.findUnique({where:{id},include:{items:{orderBy:{position:'asc'}}}})
  if(!batch)throw new ProductionError('دسته پیدا نشد',404)
  const actor=await productionActor(req,batch.kind as ProductionKind,reader)
  if(batch.actorId!==actor.id)throw new ProductionError('دسته پیدا نشد',404)
  return{batch,actor}
}
export const configOf=(batch: Batch)=>JSON.parse(batch.config) as ProductionConfig
export const outputOf=(item: Batch['items'][number])=>JSON.parse(item.output) as ProductionOutput
export const imagesOf=(item: Batch['items'][number])=>JSON.parse(item.images) as ProductionImage[]
export function view(batch: Batch) {return{...batch,items:batch.items.map(({lease,...item})=>({...item,seed:JSON.parse(item.seed),output:item.output?JSON.parse(item.output):null,images:JSON.parse(item.images),saved:item.saved?JSON.parse(item.saved):null})),config:JSON.parse(batch.config)}}
export async function categories(kind: ProductionKind, config: ProductionConfig, reader: Reader | typeof db = db) {
  const rows=kind==='post'?await reader.postCategory.findMany({where:{id:{in:config.categoryIds}},select:{id:true,name:true}}):kind==='product'?await reader.productCategory.findMany({where:{id:{in:config.categoryIds}},select:{id:true,name:true}}):[]
  if(rows.length!==config.categoryIds.length)throw new ProductionError('یک دسته‌بندی حذف شده؛ تنظیمات دسته را اصلاح کنید',409)
  return rows.map(row=>row.name)
}
export async function productionSettings(req: NextRequest, kind: ProductionKind) {
  await productionActor(req,kind)
  return{categories:kind==='post'?await db.postCategory.findMany({orderBy:{name:'asc'},select:{id:true,name:true}}):kind==='product'?await db.productCategory.findMany({orderBy:{name:'asc'},select:{id:true,name:true}}):[]}
}
export async function productionList(req: NextRequest, kind: ProductionKind) {
  const actor=await productionActor(req,kind),select={id:true,kind:true,status:true,createdAt:true,_count:{select:{items:true}}} as const
  const [active,recent]=await Promise.all([
    db.aiProductionBatch.findMany({where:{actorId:actor.id,kind,status:{in:['PLANNED','RUNNING','PAUSED']}},orderBy:{createdAt:'desc'},take:10,select}),
    db.aiProductionBatch.findMany({where:{actorId:actor.id,kind,status:{in:['DONE','CANCELLED']}},orderBy:{createdAt:'desc'},take:20,select}),
  ])
  return[...active,...recent]
}
export async function productionRead(req: NextRequest,id:unknown) {return view((await owned(req,id)).batch)}
export async function productionCreate(req: NextRequest, input: unknown, id: unknown) {
  const{kind,config,seeds}=parseProduction(input);const actor=await productionActor(req,kind)
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new ProductionError('شناسهٔ یکتای درخواست لازم است')
  await categories(kind,config)
  if(kind==='product')for(const seed of seeds){try{await validateCatalogDraft({name:seed.topic,slug:'production-validation',price:seed.price,currency:config.currency,kind:config.productKind,stock:seed.stock,active:false,categoryId:config.categoryIds[0]||null,specifications:JSON.parse(config.specifications)})}catch(e){throw new ProductionError(e instanceof Error?e.message:'مشخصات محصول معتبر نیست')}}
  return db.$transaction(async tx=>{
    await productionActor(req,kind,tx);await categories(kind,config,tx)
    const prior=await tx.aiProductionBatch.findUnique({where:{id},include:{items:{orderBy:{position:'asc'}}}})
    if(prior){if(prior.actorId!==actor.id||prior.kind!==kind||prior.config!==JSON.stringify(config)||JSON.stringify(prior.items.map(x=>JSON.parse(x.seed)))!==JSON.stringify(seeds))throw new ProductionError('شناسه برای درخواست دیگری استفاده شده',409);return view(prior)}
    const count=await tx.aiProductionBatch.count({where:{actorId:actor.id,status:{in:['PLANNED','RUNNING','PAUSED']}}});if(count>=10)throw new ProductionError('ابتدا دسته‌های فعال قبلی را نهایی یا لغو کنید',409)
    const batch=await tx.aiProductionBatch.create({data:{id,actorId:actor.id,kind,config:JSON.stringify(config),items:{create:seeds.map((seed,position)=>({id:randomUUID(),position,seed:JSON.stringify(seed)}))}},include:{items:{orderBy:{position:'asc'}}}})
    await auditAdminStrict({req,actor,action:'ai.production.create',targetType:'ai-production',targetId:id,metadata:{kind,count:seeds.length}},tx);return view(batch)
  },{isolationLevel:'Serializable'})
}
export async function claimBatch(tx: Reader, req: NextRequest, batch: Batch, version: unknown) {
  if(version!==batch.version)throw new ProductionError('دسته در تب دیگری تغییر کرده؛ تازه‌سازی کنید',409)
  await productionActor(req,batch.kind as ProductionKind,tx)
  const claimed=await tx.aiProductionBatch.updateMany({where:{id:batch.id,actorId:batch.actorId,version:batch.version},data:{version:{increment:1}}})
  if(claimed.count!==1)throw new ProductionError('دسته هم‌زمان تغییر کرد',409)
}
export const seedOf=(item: Batch['items'][number])=>JSON.parse(item.seed) as ProductionSeed
export const snapshot=(tx: Reader,id:string)=>tx.aiProductionBatch.findUniqueOrThrow({where:{id},include:{items:{orderBy:{position:'asc'}}}})
