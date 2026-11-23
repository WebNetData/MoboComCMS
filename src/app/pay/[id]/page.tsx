import {requireModule} from '@/extensions/server/modules'
import Checkout from '@/components/pay/Checkout'
export const metadata = { title: 'پرداخت سفارش | موبوکام‌پی', robots: { index: false, follow: false } }
export default async function Page({params}:{params:Promise<{id:string}>}){await requireModule('mobocom-pay');const {id}=await params;return <Checkout id={id}/>}
