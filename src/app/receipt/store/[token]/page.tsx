import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { publicSaleReceipt } from '@/modules/store/server/sale-receipts'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { formatMoney } from '@/shared/money'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
export const dynamic='force-dynamic'
export const metadata={title:'فاکتور و وضعیت سفارش',robots:{index:false,follow:false}}
export default async function SaleReceipt({params}:{params:Promise<{token:string}>}){
 const {token}=await params, h=await headers()
 if(!await isStoreEnabled()||!(await rateLimitStrict(`store-receipt:${h.get('x-forwarded-for')?.split(',')[0]?.trim()||'local'}`,60,60_000)).ok)notFound()
 const receipt=await publicSaleReceipt(token);if(!receipt)notFound()
 const labels:Record<string,string>={WAITING:'در انتظار آماده‌سازی',READY:'آمادهٔ تحویل از فروشگاه',COLLECTED:'از فروشگاه تحویل گرفته شد',DELIVERED:'تحویل داده شد',PROCESSING:'در حال آماده‌سازی',PAID:'پرداخت‌شده',REFUNDED:'بازپرداخت‌شده'}
 return <main className="container content-surface" dir="rtl"><h1>فاکتور {receipt.number}</h1><p>{receipt.channel==='COUNTER'?'خرید حضوری':'خرید آنلاین'} · {labels[receipt.invoiceStatus==='REFUNDED'?'REFUNDED':receipt.status]||'سفارش ثبت‌شده'}</p>{receipt.customer&&<p>مشتری: {receipt.customer}</p>}<ul>{receipt.lines.map((line,index)=><li key={index}>{line.name} {line.variant} · {line.quantity.toLocaleString('fa-IR')} عدد · {formatMoney(BigInt(line.totalMinor),receipt.currency,'fa-IR')}</li>)}</ul><p><strong>مبلغ فاکتور: {formatMoney(BigInt(receipt.totalMinor),receipt.currency,'fa-IR')}</strong></p><p>برای تحویل حضوری، کدی را که به موبایل شما ارسال شده نزد خود نگه دارید.</p></main>
}
