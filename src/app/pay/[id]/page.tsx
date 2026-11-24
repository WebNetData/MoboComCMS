import {requireModule} from '@/extensions/server/modules'
import Checkout from '@/components/pay/Checkout'
export const metadata = { title: 'پرداخت سفارش | موبوکام‌پی', robots: { index: false, follow: false } }
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{method?:string|string[]}>}){await requireModule('mobocom-pay');const {id}=await params;const query=await searchParams;return <Checkout id={id} preferredGateway={typeof query.method==='string'&&query.method.length<=64?query.method:''}/>}
