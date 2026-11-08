import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { createJournalPost } from '@/modules/journal/server/create'
import { createCatalogProduct } from '@/modules/catalog/server/create'
import { createPage } from '@/modules/site/server/page-commands'
import { auditAdminStrict } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { ProductionError, nextImage, type ProductionKind } from '../../domain/production'
import { owned, configOf, outputOf, imagesOf, seedOf, productionActor, claimBatch, categories } from './store'
import { productionHtml, productionDocument } from './document'

/** Content creation, history and exactly-once receipt share the owner's transaction. */
export async function saveProduction(req: NextRequest,id:unknown,itemId:unknown,version:unknown) {
  const{batch,actor}=await owned(req,id),item=batch.items.find(x=>x.id===itemId)
  if(!item)throw new ProductionError('ردیف پیدا نشد',404)
  if(item.state==='SAVED')return JSON.parse(item.saved)
  if(batch.status==='CANCELLED'||item.state!=='REVIEW'||!item.output)throw new ProductionError('ابتدا تولید و تصاویر ردیف را تکمیل و بازبینی کنید',409)
  const config=configOf(batch),output=outputOf(item),images=imagesOf(item),seed=seedOf(item)
  if(nextImage(config,images)!==undefined)throw new ProductionError('تصاویر انتخاب‌شده کامل نشده‌اند',409)
  let result: Record<string,unknown>={}
  const commit=async(tx:Prisma.TransactionClient,_before:Record<string,unknown>,after:Record<string,unknown>)=>{
    const fresh=(await owned(req,batch.id,tx)).batch
    if(fresh.status==='CANCELLED')throw new ProductionError('دسته لغو شده است',409)
    await claimBatch(tx,req,fresh,version);await categories(batch.kind as ProductionKind,config,tx)
    result={id:after.id,title:output.title,href:batch.kind==='product'?`/admin/products?edit=${after.id}`:batch.kind==='page'?`/admin/pages?edit=${after.id}`:`/admin/posts?edit=${after.id}`}
    const update=await tx.aiProductionItem.updateMany({where:{id:item.id,batchId:batch.id,version:item.version,state:'REVIEW'},data:{state:'SAVED',saved:JSON.stringify(result),version:{increment:1}}})
    if(update.count!==1)throw new ProductionError('این ردیف هم‌زمان ذخیره یا تغییر کرد',409)
    const remaining=await tx.aiProductionItem.count({where:{batchId:batch.id,state:{not:'SAVED'}}});if(!remaining)await tx.aiProductionBatch.updateMany({where:{id:batch.id,version:fresh.version+1},data:{status:'DONE'}})
    await auditAdminStrict({req,actor,action:'ai.production.save',targetType:batch.kind,targetId:String(after.id),metadata:{batchId:batch.id,itemId:item.id}},tx)
  }
  const slug=output.slug+'-'+item.id.replaceAll('-','').slice(0,12),cover=images.find(x=>x.index===0)?.url||''
  try{
    if(batch.kind==='product')await createCatalogProduct({name:output.title,slug,description:productionHtml(output,images),image:cover,gallery:images.filter(x=>x.index>0).map(x=>x.url),price:seed.price,currency:config.currency,kind:config.productKind,stock:seed.stock,active:false,categoryId:config.categoryIds[0]||null,categoryIds:config.categoryIds,specifications:JSON.parse(config.specifications)},actor,commit)
    else{const fields={title:output.title,slug,status:'DRAFT',...await productionDocument(output,images,{...actor,roleId:actor.roleId??null,permissions:actor.permissions},batch.kind==='page')};if(batch.kind==='post')await createJournalPost({categoryIds:config.categoryIds,status:'DRAFT'}, {...fields,cover,excerpt:output.excerpt},actor,commit);else await createPage({},fields,actor,commit)}
    return result
  }catch(e){const current=await db.aiProductionItem.findUnique({where:{id:item.id}});if(current?.state==='SAVED')return JSON.parse(current.saved);throw e}
}
