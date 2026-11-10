import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { getSiteSeo } from '@/modules/site/server/seo'
import { auditAdminStrict } from '@/platform/audit/server'
import { parseProductionOutput, productionPrompt, imagePrompt, nextImage, ProductionError, type ProductionKind } from '../../domain/production'
import { owned, configOf, outputOf, imagesOf, seedOf, categories, claimBatch, snapshot, view } from './store'
import { saveProduction } from './save'
import { attributeGroupForCategory } from '@/modules/catalog/server/product-config'
import { requireProductionTransport, validateProductionProviders, productionModelAuthority } from './providers'
import type { ProductionStep } from '../../domain/production-execution'

export async function productionCommand(req: NextRequest,body:Record<string,unknown>,transport:'chat-web'|'api'='chat-web'): Promise<{batch:ReturnType<typeof view>;step?:ProductionStep;result?:unknown}> {
  if(body.action==='save'){const result=await saveProduction(req,body.id,body.itemId,body.version,body.acknowledged===true,body.publish===true);return{result,batch:view((await owned(req,body.id)).batch)}}
  if(body.action==='start')await validateProductionProviders(configOf((await owned(req,body.id)).batch),await productionModelAuthority(req))
  const brand=(await getSiteSeo('fa')).name
  return db.$transaction(async tx=>{
    const{batch,actor}=await owned(req,body.id,tx),config=configOf(batch),item=batch.items.find(x=>x.id===body.itemId)
    await claimBatch(tx,req,batch,body.version)
    const done=()=>snapshot(tx,batch.id).then(b=>({batch:view(b)}))
    if(['pause','cancel','start'].includes(String(body.action))){
      if(['CANCELLED','DONE'].includes(batch.status))throw new ProductionError('دسته نهایی شده است',409)
      if(body.action==='start'&&batch.items.some(x=>x.state==='FAILED'||x.state==='RUNNING'))throw new ProductionError('ردیف نامطمئن را ابتدا صریحاً برای تلاش مجدد آماده کنید',409)
      await tx.aiProductionBatch.updateMany({where:{id:batch.id,version:batch.version+1},data:{status:body.action==='start'?'RUNNING':body.action==='pause'?'PAUSED':'CANCELLED'}})
      if(body.action!=='start')await tx.aiProductionItem.updateMany({where:{batchId:batch.id,state:'RUNNING'},data:{state:'FAILED',lease:null,expiresAt:null,error:'درخواست متوقف شد؛ نتیجهٔ دیررس پذیرفته نمی‌شود',version:{increment:1}}})
      await auditAdminStrict({req,actor,action:'ai.production.'+body.action,targetType:'ai-production',targetId:batch.id},tx);return done()
    }
    if(!item)throw new ProductionError('ردیف پیدا نشد',404)
    if(['CANCELLED','DONE'].includes(batch.status))throw new ProductionError('دسته نهایی شده است',409)
    if(body.action==='retry'){
      if(item.state!=='FAILED'&&!(item.state==='RUNNING'&&item.expiresAt&&item.expiresAt.getTime()<Date.now()))throw new ProductionError('ردیف برای تلاش مجدد آماده نیست',409)
      await tx.aiProductionItem.updateMany({where:{id:item.id,version:item.version},data:{state:item.output&&nextImage(config,imagesOf(item))===undefined?'REVIEW':'READY',lease:null,expiresAt:null,error:'',version:{increment:1}}});return done()
    }
    if(body.action==='claim'){
      if(batch.status!=='RUNNING'||batch.items.some(x=>x.state==='RUNNING')||item.state!=='READY')throw new ProductionError('دسته متوقف است یا درخواست دیگری فعال است',409)
      const names=await categories(batch.kind as ProductionKind,config,tx),lease=randomUUID(),expiresAt=new Date(Date.now()+12*60*1000),index=item.output?nextImage(config,imagesOf(item)):undefined
      if(item.output&&index===undefined)throw new ProductionError('ردیف آمادهٔ بازبینی است',409)
      const phase=item.output?'image':'text',prompt=phase==='text'?productionPrompt(batch.kind as ProductionKind,config,seedOf(item),names,brand,batch.kind==='product'?(await attributeGroupForCategory(config.categoryIds[0]||null)).fields:[]):imagePrompt(config,outputOf(item),index!)
      requireProductionTransport(config,phase,transport)
      const updated=await tx.aiProductionItem.updateMany({where:{id:item.id,version:item.version,state:'READY'},data:{state:'RUNNING',lease,expiresAt,version:{increment:1}}});if(updated.count!==1)throw new ProductionError('ردیف هم‌زمان گرفته شد',409)
      return{...await done(),step:{itemId:item.id,lease,phase,index,prompt}}
    }
    if(item.state!=='RUNNING'||typeof body.lease!=='string'||item.lease!==body.lease||!item.expiresAt||item.expiresAt.getTime()<Date.now()||batch.status!=='RUNNING')throw new ProductionError('مجوز این پاسخ منقضی یا لغو شده است',409)
    if(body.action==='fail'){
      await tx.aiProductionItem.updateMany({where:{id:item.id,version:item.version,lease:item.lease},data:{state:'FAILED',error:'تولید متوقف شد؛ اتصال، سهمیه یا رابط سرویس را بررسی و در صورت نیاز صریحاً دوباره تلاش کنید',lease:null,expiresAt:null,version:{increment:1}}})
      await tx.aiProductionBatch.updateMany({where:{id:batch.id,version:batch.version+1},data:{status:'PAUSED'}});return done()
    }
    if(body.action!=='text'||item.output)throw new ProductionError('مرحلهٔ پاسخ معتبر نیست',409)
    requireProductionTransport(config,'text',transport)
    const output=parseProductionOutput(body.text)
    if(output.sections.length<config.inline)throw new ProductionError('تعداد بخش‌ها برای تصاویر داخلی کافی نیست',422)
    if(config.cover&&output.coverPrompt.length<3||output.sections.slice(0,config.inline).some(s=>s.imagePrompt.length<3))throw new ProductionError('پرامپت تصاویر انتخاب‌شده کامل برنگشت؛ هیچ تصویری درخواست نشد',422)
    await tx.aiProductionItem.updateMany({where:{id:item.id,lease:item.lease,version:item.version},data:{output:JSON.stringify(output),state:nextImage(config,[])===undefined?'REVIEW':'READY',lease:null,expiresAt:null,error:'',version:{increment:1}}});return done()
  },{isolationLevel:'Serializable',timeout:30000})
}
