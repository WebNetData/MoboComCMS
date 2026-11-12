import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { publicSaleReceipt } from '@/modules/store/server/sale-receipts'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import SaleReceiptDocument from '@/components/store/SaleReceiptDocument'
import PrintButton from '@/components/forms/PrintButton'
import '@/app/sale-receipt.css'
export const dynamic='force-dynamic'
export const metadata={title:'فاکتور و وضعیت سفارش',robots:{index:false,follow:false}}
const LABELS:Record<string,string>={WAITING:'در انتظار آماده‌سازی',READY:'آمادهٔ تحویل از فروشگاه',COLLECTED:'از فروشگاه تحویل گرفته شد',DELIVERED:'تحویل داده شد',PROCESSING:'در حال آماده‌سازی',PAID:'پرداخت‌شده',REFUNDED:'بازپرداخت‌شده'}
const TONE:Record<string,'ok'|'warn'|'muted'>={WAITING:'warn',PROCESSING:'warn',READY:'ok',COLLECTED:'ok',DELIVERED:'ok',PAID:'ok',REFUNDED:'muted'}
/** The customer's QR copy: the same printed document, without stamp, phone, payments, codes or handover proof. */
export default async function SaleReceipt({params}:{params:Promise<{token:string}>}){
 const {token}=await params, h=await headers()
 if(!await isStoreEnabled()||!(await rateLimitStrict(`store-receipt:${h.get('x-forwarded-for')?.split(',')[0]?.trim()||'local'}`,60,60_000)).ok)notFound()
 const receipt=await publicSaleReceipt(token);if(!receipt)notFound()
 const state=receipt.invoiceStatus==='REFUNDED'?'REFUNDED':receipt.status,counter=receipt.channel==='COUNTER'
 return <main className="container sr-page" dir="rtl">
  <div className="sr-tools"><h1>{counter?'رسید خرید حضوری شما':'فاکتور خرید شما'}</h1><PrintButton label="چاپ یا ذخیرهٔ PDF"/></div>
  <SaleReceiptDocument format="sheet" seller={{name:receipt.seller.name||'فروشگاه',logo:receipt.seller.logo,phone:receipt.seller.phone,address:receipt.seller.address}} title="فاکتور فروش" badge={counter?'فروش حضوری':'فروش آنلاین'} number={receipt.number} createdAt={receipt.createdAt}
   status={{label:LABELS[state]||'سفارش ثبت‌شده',tone:TONE[state]||'muted'}} paid={receipt.invoiceStatus==='PAID'}
   parties={[{label:'نام خریدار',value:receipt.customer||''},{label:'نوع خرید',value:counter?'حضوری از فروشگاه':'آنلاین'}]}
   lines={receipt.lines.map(line=>({name:line.name,variant:line.variant,quantity:line.quantity,totalMinor:line.totalMinor}))} currency={receipt.currency} totalMinor={receipt.totalMinor} signatures={false}/>
  <p className="sr-help">برای تحویل حضوری، کدی را که به موبایل شما ارسال شده نزد خود نگه دارید و آن را فقط به کارمند فروشگاه بگویید.</p>
 </main>
}
