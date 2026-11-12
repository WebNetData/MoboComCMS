import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { counterProducts } from './read'
import QRCode from 'qrcode'
import { siteLink } from '@/modules/sms/server/sms'
import { unitPrice } from '@/modules/store/server/pricing'
import { formatMoney } from '@/shared/money'

export async function scanCounterProduct(raw: string, locationId?: number|null) {
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
 const product=(await counterProducts('',productId,locationId))[0]
 if(!product)throw new StoreError('این کالا برای فروش حضوری فعال نیست',404)
 return {product,variantId,requiresVariant:product.variants.length>0&&!variantId}
}

/** Shelf labels: barcode for the scanner, retail price, and a QR to the public product page (reviews, specs, online stock). */
export async function productLabels(query: string,productId?:number){
 const rows=await db.product.findMany({where:{active:true,...(productId?{id:productId}:query?{OR:[{name:{contains:query.slice(0,80)}},{sku:{contains:query.slice(0,80)}}]}:{})},include:{variants:{where:{active:true},orderBy:{id:'asc'}}},orderBy:{id:'desc'},take:40})
 const qr=new Map<string,string>()
 const link=async(slug:string,variantId:number|null)=>{
  const url=await siteLink(`/products/${encodeURIComponent(slug)}${variantId?`?variant=${variantId}`:''}`)
  if(!qr.has(url))qr.set(url,await QRCode.toDataURL(url,{width:160,margin:1,errorCorrectionLevel:'M'}))
  return {url,qr:qr.get(url)!}
 }
 const price=(product:(typeof rows)[number],variant:(typeof rows)[number]['variants'][number]|null)=>{const value=unitPrice(product,variant,false);return value.unitMinor>0n?formatMoney(value.unitMinor,value.currency,'fa-IR'):''}
 const labels:{id:string;productId:number;variantId:number|null;name:string;barcode:string;sku:string;price:string;url:string;qr:string}[]=[]
 for(const product of rows){
  if(product.variants.length)for(const variant of product.variants)labels.push({id:`v:${variant.id}`,productId:product.id,variantId:variant.id,name:`${product.name} · ${variant.name}`,barcode:variant.barcode||`MC-V-${variant.id}`,sku:variant.sku,price:price(product,variant),...await link(product.slug,variant.id)})
  else labels.push({id:`p:${product.id}`,productId:product.id,variantId:null,name:product.name,barcode:product.barcode||`MC-P-${product.id}`,sku:product.sku,price:price(product,null),...await link(product.slug,null)})
 }
 return labels
}
