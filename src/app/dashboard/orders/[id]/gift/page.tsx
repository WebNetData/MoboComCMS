import '../../../../account-orders.css'
import './receipt.css'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getViewer } from '@/modules/membership/server/membership'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { giftReceipt } from '@/modules/store/server/gift-receipt'
import PrintButton from '@/components/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رسید هدیه', robots: { index: false, follow: false } }

export default async function GiftReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await isStoreEnabled()) notFound()
  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) notFound()
  const viewer = await getViewer()
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/dashboard/orders/${id}/gift`)}`)
  const receipt = await giftReceipt(viewer.userId, id)
  if (!receipt) notFound()
  return <article className="sx-my sx-my-detail gift-receipt" dir="rtl">
    <header className="sx-my-head"><div><h1>رسید هدیه</h1><p>سفارش {receipt.id.toLocaleString('fa-IR')}</p></div><PrintButton label="چاپ رسید هدیه" /></header>
    <section className="sx-my-card"><h2>برای {receipt.gift.recipient}</h2>{receipt.gift.message && <p dir="auto" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{receipt.gift.message}</p>}</section>
    <section className="sx-my-card"><h2>کالاهای هدیه</h2><ul>{receipt.lines.map((line, index) => <li key={index}><b>{line.name}</b>{line.variantName && <> · {line.variantName}</>} · {line.quantity.toLocaleString('fa-IR')} عدد</li>)}</ul></section>
  </article>
}
