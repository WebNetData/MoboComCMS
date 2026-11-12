import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { StoreError } from '@/modules/store/domain/store'

type ChannelRow={channel:string;currency:string;orders:bigint;gross:bigint;knownRevenue:bigint;knownCost:bigint;unknownLines:bigint}
type EmployeeRow={cashierId:number;name:string;currency:string;method:string;total:bigint;orders:bigint}
const serial=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?value.toString():value]))

/** SQL aggregates bounded periods instead of truncating financial rows. Unknown historical costs stay unknown. */
export async function storeSalesReport(days=30,now=new Date()){
 if(!Number.isInteger(days)||days<1||days>366)throw new StoreError('بازهٔ گزارش از ۱ تا ۳۶۶ روز است')
 const since=new Date(now.getTime()-days*86400000),settings=await getStoreSettings()
 const [channels,refunds,returnRefunds,employees,top,lowStockIds]=await Promise.all([
  db.$queryRaw<ChannelRow[]>(Prisma.sql`SELECT o."saleSource" AS channel,i.currency,COUNT(DISTINCT o.id)::bigint AS orders,
    COALESCE(SUM(l."totalMinor" - (l."totalMinor" * i."discountMinor" / NULLIF(i."subtotalMinor",0))),0)::bigint AS gross,
    COALESCE(SUM(CASE WHEN l."unitCostMinor" IS NOT NULL THEN l."totalMinor" - (l."totalMinor" * i."discountMinor" / NULLIF(i."subtotalMinor",0)) ELSE 0 END),0)::bigint AS "knownRevenue",
    COALESCE(SUM(CASE WHEN l."unitCostMinor" IS NOT NULL THEN l."unitCostMinor"*l.quantity ELSE 0 END),0)::bigint AS "knownCost",
    COUNT(*) FILTER (WHERE l."unitCostMinor" IS NULL)::bigint AS "unknownLines"
    FROM "Order" o JOIN "Invoice" i ON i."orderId"=o.id JOIN "OrderLine" l ON l."orderId"=o.id
    WHERE o."productId" IS NOT NULL AND i.status IN ('PAID','REFUNDED') AND i."paidAt">=${since} AND i."paidAt"<=${now}
    GROUP BY o."saleSource",i.currency ORDER BY i.currency,o."saleSource"`),
  db.payment.groupBy({by:['currency'],where:{status:'REFUNDED',amountMinor:{lt:0n},createdAt:{gte:since,lte:now},order:{is:{productId:{not:null}}}},_sum:{amountMinor:true}}),
  db.returnRequest.groupBy({by:['currency'],where:{status:'REFUNDED',refundedAt:{gte:since,lte:now}},_sum:{refundMinor:true}}),
  db.$queryRaw<EmployeeRow[]>(Prisma.sql`SELECT o."createdById" AS "cashierId",u.name,o.currency,t.method,SUM(t."amountMinor")::bigint AS total,COUNT(DISTINCT o.id)::bigint AS orders FROM "StoreTender" t JOIN "Order" o ON o.id=t."orderId" LEFT JOIN "User" u ON u.id=o."createdById" WHERE t."createdAt">=${since} AND t."createdAt"<=${now} GROUP BY o."createdById",u.name,o.currency,t.method ORDER BY total DESC`),
  db.orderLine.groupBy({by:['productId','name','currency'],where:{order:{status:'PAID',invoice:{is:{status:'PAID',paidAt:{gte:since,lte:now}}}},sellerStatus:{not:'CANCELLED'}},_sum:{quantity:true,totalMinor:true},orderBy:{_sum:{quantity:'desc'}},take:20}),
  db.$queryRaw<{id:number}[]>(Prisma.sql`SELECT p.id FROM "Product" p WHERE p.active AND
   ((p.stock>=0 AND p.stock<=COALESCE(NULLIF(p."lowStockAt",0),${settings.lowStockDefault})) OR EXISTS
    (SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND v.active AND v.stock>=0 AND v.stock<=COALESCE(NULLIF(p."lowStockAt",0),${settings.lowStockDefault}))) ORDER BY p.stock,p.id LIMIT 30`),
 ])
 const stockRows=await db.product.findMany({where:{id:{in:lowStockIds.map(row=>row.id)}},orderBy:{stock:'asc'},select:{id:true,name:true,stock:true,sku:true,lowStockAt:true,variants:{where:{active:true,stock:{gte:0}},select:{id:true,name:true,stock:true}}}})
 const lowStock=stockRows.map(row=>({...row,variants:row.variants.filter(variant=>variant.stock<=(row.lowStockAt||settings.lowStockDefault))}))
 const currencies=[...new Set([...channels.map(x=>x.currency),...refunds.map(x=>x.currency),...returnRefunds.map(x=>x.currency)])]
 return {days,since:since.toISOString(),until:now.toISOString(),channels:channels.map(row=>({...serial(row),margin:(row.knownRevenue-row.knownCost).toString()})),
   refunds:currencies.map(currency=>({currency,amountMinor:(returnRefunds.filter(x=>x.currency===currency).reduce((sum,x)=>sum+(x._sum.refundMinor||0n),0n)-refunds.filter(x=>x.currency===currency).reduce((sum,x)=>sum+(x._sum.amountMinor||0n),0n)).toString()})),
   employees:employees.map(serial),top:top.map(row=>({productId:row.productId,name:row.name,currency:row.currency,quantity:row._sum.quantity||0,totalMinor:(row._sum.totalMinor||0n).toString()})),lowStock}
}
