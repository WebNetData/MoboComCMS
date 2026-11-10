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
import { itemQuality } from './quality'
import { attributeGroupForCategory } from '@/modules/catalog/server/product-config'
import type { ProductionConfig, ProductionOutput } from '../../domain/production'

/**
 * The model's product fields made safe for the catalogue: specifications only of the category's real keys and options
 * (the batch's own fixed values win), variants with a real price and free SKUs, plus SKU, FAQs and SEO. Anything that
 * does not fit is dropped so the row still saves.
 */
async function productExtras(output: ProductionOutput, config: ProductionConfig) {
  const extra = output.product, group = await attributeGroupForCategory(config.categoryIds[0] || null)
  const fixed = JSON.parse(config.specifications) as Record<string, string>
  if (!extra) return { specifications: fixed }
  const specFields = group.fields.filter((f) => !f.variant), variantFields = group.fields.filter((f) => f.variant)
  const fits = (fields: typeof group.fields, key: string, value: string) => { const field = fields.find((f) => f.key === key); return !!field && (field.kind === 'text' || field.options.includes(value)) }
  const specifications = { ...Object.fromEntries(Object.entries(extra.specifications).filter(([key, value]) => fits(specFields, key, value))), ...fixed }
  const taken = new Set((await db.productVariant.findMany({ where: { sku: { in: extra.variants.map((v) => v.sku) } }, select: { sku: true } })).map((v) => v.sku))
  const combos = new Set<string>(), variants: Record<string, unknown>[] = []
  for (const v of extra.variants) {
    if (!(Number(v.price) > 0)) continue
    const attributes = Object.fromEntries(Object.entries(v.attributes).filter(([key, value]) => fits(variantFields, key, value)))
    const combo = Object.keys(attributes).length ? JSON.stringify(Object.entries(attributes).sort()) : 'name:' + v.name
    if (combos.has(combo)) continue
    let sku = v.sku
    for (let n = 2; taken.has(sku) && n < 50; n++) sku = (v.sku + '-' + n).slice(0, 80)
    if (taken.has(sku)) continue
    taken.add(sku); combos.add(combo)
    variants.push({ sku, name: v.name, nameEn: v.nameEn, price: v.price, stock: v.stock, attributes })
  }
  return {
    specifications, ...(variants.length ? { variants } : {}),
    ...(extra.sku ? { sku: extra.sku } : {}), ...(extra.shortDescription ? { shortDescription: extra.shortDescription } : {}),
    ...(extra.warranty ? { warranty: extra.warranty } : {}), ...(extra.seoTitle ? { seoTitle: extra.seoTitle } : {}),
    ...(extra.seoDescription ? { seoDescription: extra.seoDescription } : {}), ...(extra.faqs.length ? { faqs: extra.faqs } : {}),
  }
}

/** Content creation, history and exactly-once receipt share the owner's transaction. */
/** `publish`: the reviewer's choice at save — live (active product / published post or page) or a draft (inactive product). */
export async function saveProduction(req: NextRequest,id:unknown,itemId:unknown,version:unknown,acknowledged=false,publish=false) {
  const{batch,actor}=await owned(req,id),item=batch.items.find(x=>x.id===itemId)
  if(!item)throw new ProductionError('ردیف پیدا نشد',404)
  if(item.state==='SAVED')return JSON.parse(item.saved)
  if(batch.status==='CANCELLED'||item.state!=='REVIEW'||!item.output)throw new ProductionError('ابتدا تولید و تصاویر ردیف را تکمیل و بازبینی کنید',409)
  const config=configOf(batch),output=outputOf(item),images=imagesOf(item),seed=seedOf(item)
  if(nextImage(config,images)!==undefined)throw new ProductionError('تصاویر انتخاب‌شده کامل نشده‌اند',409)
  // Checked again at save: the site may have changed since the reviewer read the report.
  const quality=await itemQuality(batch,item)
  if(quality.level==='block'&&!acknowledged)throw new ProductionError('کنترل کیفیت مورد مسدودکننده دارد؛ گزارش را بررسی و اصلاح کنید یا آگاهانه تأیید کنید',409)
  // Content with a blocking finding never goes live straight from the batch: only as a draft for the editor.
  if(publish&&quality.level==='block')throw new ProductionError('این ردیف مورد مسدودکننده دارد؛ فقط به‌صورت پیش‌نویس ذخیره می‌شود',409)
  const status=publish?'PUBLISHED':'DRAFT'
  let result: Record<string,unknown>={}
  const commit=async(tx:Prisma.TransactionClient,_before:Record<string,unknown>,after:Record<string,unknown>)=>{
    const fresh=(await owned(req,batch.id,tx)).batch
    if(fresh.status==='CANCELLED')throw new ProductionError('دسته لغو شده است',409)
    await claimBatch(tx,req,fresh,version);await categories(batch.kind as ProductionKind,config,tx)
    result={id:after.id,title:output.title,href:batch.kind==='product'?`/admin/products?edit=${after.id}`:batch.kind==='page'?`/admin/pages?edit=${after.id}`:`/admin/posts?edit=${after.id}`}
    const update=await tx.aiProductionItem.updateMany({where:{id:item.id,batchId:batch.id,version:item.version,state:'REVIEW'},data:{state:'SAVED',saved:JSON.stringify(result),version:{increment:1}}})
    if(update.count!==1)throw new ProductionError('این ردیف هم‌زمان ذخیره یا تغییر کرد',409)
    const remaining=await tx.aiProductionItem.count({where:{batchId:batch.id,state:{not:'SAVED'}}});if(!remaining)await tx.aiProductionBatch.updateMany({where:{id:batch.id,version:fresh.version+1},data:{status:'DONE'}})
    await auditAdminStrict({req,actor,action:'ai.production.save',targetType:batch.kind,targetId:String(after.id),metadata:{batchId:batch.id,itemId:item.id,published:publish,quality:{profile:quality.profile,level:quality.level,blocks:quality.findings.filter(f=>f.level==='block').length,warnings:quality.findings.filter(f=>f.level==='warn').length,acknowledged:quality.level==='block'}}},tx)
  }
  const cover=images.find(x=>x.index===0)?.url||''
  // Keep the requested slug. Only an actual collision adds a readable number.
  for(let attempt=0;attempt<20;attempt++){
  const slug=output.slug+(attempt?'-'+(attempt+1):'')
  const query={where:{slug},select:{id:true}}
  const existing=batch.kind==='product'?await db.product.findUnique(query):batch.kind==='page'?await db.page.findUnique(query):await db.post.findUnique(query)
  if(existing)continue
  try{
    if(batch.kind==='product')await createCatalogProduct({name:output.title,slug,description:productionHtml(output,images),image:cover,gallery:images.filter(x=>x.index>0).map(x=>x.url),price:seed.price,currency:config.currency,kind:config.productKind,stock:seed.stock,active:publish,categoryId:config.categoryIds[0]||null,categoryIds:config.categoryIds,...await productExtras(output,config)},actor,commit)
    else{const fields={title:output.title,slug,status,...await productionDocument(output,images,{...actor,roleId:actor.roleId??null,permissions:actor.permissions},batch.kind==='page')};if(batch.kind==='post')await createJournalPost({categoryIds:config.categoryIds,status}, {...fields,cover,excerpt:output.excerpt},actor,commit);else await createPage({},fields,actor,commit)}
    return result
  }catch(e){const current=await db.aiProductionItem.findUnique({where:{id:item.id}});if(current?.state==='SAVED')return JSON.parse(current.saved);const error=e as {code?:string;meta?:{target?:unknown}};if(error?.code==='P2002'&&Array.isArray(error.meta?.target)&&error.meta.target.includes('slug'))continue;throw e}
  }
  throw new ProductionError('این نامک بارها استفاده شده است؛ نامک متفاوتی انتخاب کنید',409)
}
