import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { importDataImage } from '@/modules/downloads/server/files'
import { auditAdminStrict } from '@/platform/audit/server'
import { ProductionError, nextImage, type ProductionImage } from '../../domain/production'
import { owned,configOf,imagesOf,outputOf,claimBatch,snapshot,view } from './store'
import { requireProductionTransport } from './providers'

export async function productionImage(req: NextRequest,body:Record<string,unknown>,transport:'chat-web'|'api'='chat-web') {
  const{batch,actor}=await owned(req,body.id),item=batch.items.find(x=>x.id===body.itemId)
  if(!item||!item.output)throw new ProductionError('ردیف پیدا نشد',404)
  if(batch.status!=='RUNNING'||item.state!=='RUNNING'||item.lease!==body.lease||!item.expiresAt||item.expiresAt.getTime()<Date.now())throw new ProductionError('پاسخ تصویر منقضی یا لغو شده است',409)
  const config=configOf(batch),images=imagesOf(item),index=nextImage(config,images)
  requireProductionTransport(config,'image',transport)
  if(index===undefined||index!==body.index||typeof body.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(body.data)||body.data.length>2800000)throw new ProductionError('تصویر یا شمارهٔ مرحله معتبر نیست',422)
  // Reuse Media's existing bounded decoder/reencoder and Library registration.
  // If a concurrent stop wins, the owned imported image stays in Library; no content is saved.
  const url=await importDataImage(body.data,actor.id),output=outputOf(item)
  const description=index===0?output.coverDescription||output.title:output.sections[index-1].imageDescription||output.sections[index-1].heading||output.title
  const image:ProductionImage={index,url,alt:description,caption:'تصویرسازی با هوش مصنوعی · '+description}
  return db.$transaction(async tx=>{
    const fresh=(await owned(req,batch.id,tx)).batch,current=fresh.items.find(x=>x.id===item.id)!
    await claimBatch(tx,req,fresh,body.version)
    if(fresh.status!=='RUNNING'||current.state!=='RUNNING'||current.lease!==body.lease||!current.expiresAt||current.expiresAt.getTime()<Date.now())throw new ProductionError('پاسخ تصویر هم‌زمان لغو شد؛ فایل در کتابخانهٔ شما حفظ شد',409)
    const all=[...images,image];const updated=await tx.aiProductionItem.updateMany({where:{id:item.id,version:item.version,lease:item.lease},data:{images:JSON.stringify(all),state:nextImage(config,all)===undefined?'REVIEW':'READY',lease:null,expiresAt:null,error:'',version:{increment:1}}});if(updated.count!==1)throw new ProductionError('این تصویر قبلاً ثبت شده یا پاسخ تغییر کرده است',409)
    await auditAdminStrict({req,actor,action:'ai.production.image',targetType:'ai-production',targetId:batch.id,metadata:{itemId:item.id,index,url}},tx)
    return{batch:view(await snapshot(tx,batch.id))}
  },{isolationLevel:'Serializable'})
}
