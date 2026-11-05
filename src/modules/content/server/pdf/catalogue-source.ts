import { db } from '@/platform/database/prisma'
import { type Viewer } from '@/modules/membership/server/membership'
import { type PdfRef } from '@/modules/content/domain/pdf'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { attributeFieldsForCategory } from '@/modules/catalog/server/product-config'
import { unitPrice } from '@/modules/store/server/pricing'
import { minorToNumber } from '@/shared/money'
import { formatAmount } from '@/shared/money/format'
import { pdfAccess,pdfContent,dataFacts } from './source-common'

export async function cataloguePdfSource(ref:PdfRef,viewer:Viewer){
  if(ref.type!=='product'||!await isStoreEnabled())return null
  const r=await db.product.findFirst({where:{id:ref.id,active:true,approval:'APPROVED'},include:{brand:{select:{name:true}},category:{select:{name:true}},_count:{select:{variants:{where:{active:true}}}}}})
  if(!r)return null
  // Product descriptions are public on their page; VIP flags govern purchase/download, not the description.
  await pdfAccess(ref,viewer,{audienceGroups:r.audienceGroups})
  const fields=await attributeFieldsForCategory(r.categoryId),labels=new Map(fields.map(f=>[f.key,f.label]))
  const price=unitPrice(r,null,false)
  return pdfContent(ref,{kind:'product',title:r.name,subtitle:r.nameEn,summary:r.shortDescription,html:r.description,image:r.image,url:'/products/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['دسته‌بندی',r.category?.name||''],['برند',r.brand?.name||''],['شناسهٔ کالا',r.sku],['قیمت پایه در زمان دریافت',r._count.variants?'وابسته به گونهٔ انتخابی':formatAmount(minorToNumber(price.unitMinor,price.currency),price.currency,'fa-IR')],['وضعیت موجودی',r.stock===0?'ناموجود':'قابل سفارش'],['ضمانت',r.warranty],...dataFacts(r.specifications).map(([k,v]):[string,string]=>[labels.get(k)||k,v])]})
}
