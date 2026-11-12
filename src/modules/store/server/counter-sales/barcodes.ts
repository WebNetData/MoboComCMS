import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { counterProducts } from './read'

export async function scanCounterProduct(raw: string) {
 const value=raw.trim(),system=value.match(/^MC-([PV])-(\d{1,9})$/i)
 if(!value)throw new StoreError('بارکد را اسکن یا وارد کنید')
 if(value.length>80)throw new StoreError('بارکد بیش از حد طولانی است')
 const candidates=new Map<string,{productId:number;variantId:number|null}>()
 const add=(productId:number,variantId:number|null)=>{if(productId>0)candidates.set(`${productId}:${variantId||0}`,{productId,variantId})}
 if(system){
  if(system[1].toUpperCase()==='P')add(Number(system[2]),null)
  else{const variant=await db.productVariant.findFirst({where:{id:Number(system[2]),active:true},select:{id:true,productId:true}});if(variant)add(variant.productId,variant.id)}
 }
 const [products,variants]=await Promise.all([db.product.findMany({where:{active:true,OR:[{barcode:value},{sku:value}]},take:2,select:{id:true}}),db.productVariant.findMany({where:{active:true,OR:[{barcode:value},{sku:value}]},take:2,select:{id:true,productId:true}})])
 products.forEach(row=>add(row.id,null));variants.forEach(row=>add(row.productId,row.id))
 if(candidates.size!==1)throw new StoreError(candidates.size?'بارکد یا کد انبار تکراری است؛ محصول را دستی انتخاب کنید':'بارکد پیدا نشد',candidates.size?409:404)
 const {productId,variantId}=[...candidates.values()][0]
 const product=(await counterProducts('',productId))[0]
 if(!product)throw new StoreError('این کالا برای فروش حضوری فعال نیست',404)
 return {product,variantId,requiresVariant:product.variants.length>0&&!variantId}
}

export async function productLabels(query: string,productId?:number){
 const rows=await db.product.findMany({where:{active:true,...(productId?{id:productId}:query?{OR:[{name:{contains:query.slice(0,80)}},{sku:{contains:query.slice(0,80)}}]}:{})},include:{variants:{where:{active:true},orderBy:{id:'asc'}}},orderBy:{id:'desc'},take:40})
 return rows.flatMap<{id:string;productId:number;variantId:number|null;name:string;barcode:string;sku:string}>(product=>product.variants.length?product.variants.map(variant=>({id:`v:${variant.id}`,productId:product.id,variantId:variant.id,name:`${product.name} · ${variant.name}`,barcode:variant.barcode||`MC-V-${variant.id}`,sku:variant.sku})): [{id:`p:${product.id}`,productId:product.id,variantId:null,name:product.name,barcode:product.barcode||`MC-P-${product.id}`,sku:product.sku}])
}
